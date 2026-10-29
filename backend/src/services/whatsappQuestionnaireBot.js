const WhatsAppConversation = require('../models/WhatsAppConversation');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const Lead = require('../models/Lead');
const {
  STOP_REPLY,
  START_REPLY,
  MAX_REASKS,
  isOptOutRequest,
  isOptInRequest,
  assertCanSendBot,
  markBotSent,
  applyOptOut,
  applyOptIn,
  canRestartCompleted,
} = require('./whatsappBotSafety');

/**
 * Short welcome questionnaire — destination, travel date, adults, best call time.
 * Starts on any new inbound message when chat is idle (not only Hi).
 */
const QUESTIONS = {
  welcome:
    'Hello! 👋 Welcome to *HindHolidays*.\n\n' +
    'To help us plan your trip, please share 4 quick details:\n\n' +
    '1️⃣ What is your preferred *destination*?\n' +
    '(e.g. Manali, Goa, Dubai)\n\n' +
    '_Reply STOP anytime to pause automated messages._',
  travelDate:
    'Great choice! ✈️\n\n' +
    '2️⃣ What is your preferred *travel date*?\n' +
    '(e.g. 15/08/2026 or 15 August)',
  adults:
    'Perfect!\n\n' +
    '3️⃣ How many *adults* will be travelling?\n' +
    '(numbers only, e.g. 2)',
  bestTime:
    'Thank you!\n\n' +
    '4️⃣ What is the *best time to call* you?\n' +
    '(e.g. morning 10–12, afternoon, or evening 5–7)',
  done:
    'Thank you! ✅ Your details have been saved successfully.\n\n' +
    'Our travel specialist will contact you shortly.\n' +
    'If you have any questions in the meantime, feel free to message us here.',
  reaskDestination: 'Please share the destination name (e.g. Manali or Goa).',
  reaskTravelDate: 'Please share the travel date again (e.g. 15/08/2026).',
  reaskAdults: 'Please reply with the number of adults only (e.g. 2 or 4).',
  reaskBestTime: 'Please share the best time to call (e.g. morning 11 AM).',
};

const ACTIVE_STEPS = [
  'await_destination',
  'await_travel_date',
  'await_adults',
  'await_best_time',
  'await_travelers', // legacy
];

function isMediaPlaceholder(text = '') {
  return /^\[(Image|Document|Audio|Video|Sticker)\]$/i.test(String(text).trim());
}

/** Used for restart hints / ignore during flow */
function isGreeting(text = '') {
  const t = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return false;

  if (
    /^(hi+|h+i+o*|hello+|hey+|helo+|hellow+|hlo+|namaste|namaskar|hola|yo+|sup|hai+|hy+)$/.test(t)
  ) {
    return true;
  }

  if (/^good\s*(morning|evening|afternoon|night)$/.test(t)) return true;

  if (
    /^(hi+|hello+|hey+|namaste|namaskar)\b/.test(t) &&
    t.split(' ').length <= 4 &&
    t.length <= 28
  ) {
    return true;
  }

  return false;
}

function parseTravelDate(raw = '') {
  const text = String(raw || '').trim();
  if (!text) return null;

  const dmy = text.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmy) {
    let [, dd, mm, yyyy] = dmy;
    dd = Number(dd);
    mm = Number(mm);
    yyyy = Number(yyyy);
    if (yyyy < 100) yyyy += 2000;
    const d = new Date(yyyy, mm - 1, dd);
    if (d.getFullYear() === yyyy && d.getMonth() === mm - 1 && d.getDate() === dd) {
      return d;
    }
  }

  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

function parseAdults(raw = '') {
  const match = String(raw || '').match(/(\d{1,3})/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 1 || n > 200) return null;
  return n;
}

function parseDestination(raw = '') {
  const text = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!text || isMediaPlaceholder(text)) return null;
  if (text.length < 2 || text.length > 80) return null;
  if (/^(hi+|hello+|hey+|namaste|ok+|okay|haan|yes|no|stop)$/i.test(text)) return null;
  return text;
}

function parseBestTime(raw = '') {
  const text = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!text || isMediaPlaceholder(text)) return null;
  if (text.length < 2 || text.length > 120) return null;
  return text;
}

async function sendAndStoreBotReply(conversation, text) {
  const gate = await assertCanSendBot(conversation);
  if (!gate.ok) {
    console.warn('[whatsappBot] send blocked', conversation?.phone, gate.reason);
    return null;
  }

  const { sendWhatsAppText } = require('./whatsappCloudService');
  const phone = conversation.phone;
  let waMessageId;
  try {
    const data = await sendWhatsAppText({ toPhone: phone, text });
    waMessageId = data?.messages?.[0]?.id;
  } catch (err) {
    const msg = String(err.message || '');
    if (/spam|restrict|quality|rate|too many|131047|131026|130429/i.test(msg)) {
      await WhatsAppConversation.updateOne(
        { _id: conversation._id },
        {
          $set: {
            botEnabled: false,
            botStep: 'paused',
            botBlockedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        }
      );
    }
    console.error('[whatsappBot] send failed', err.message);
    throw err;
  }

  const now = new Date();
  await Promise.all([
    WhatsAppMessage.create({
      conversation: conversation._id,
      lead: conversation.lead || undefined,
      waMessageId,
      fromPhone: phone,
      direction: 'outgoing',
      type: 'text',
      text,
      status: 'sent',
      timestamp: now,
    }),
    WhatsAppConversation.updateOne(
      { _id: conversation._id },
      {
        $set: {
          lastMessageText: text,
          lastMessageAt: now,
          lastDirection: 'outgoing',
        },
      }
    ),
    markBotSent(conversation._id),
  ]);

  conversation.botLastSentAt = now;
  return true;
}

async function syncBotAnswersToLead(conversation) {
  if (!conversation?.lead) return null;
  const answers = conversation.botAnswers || {};
  const update = {};

  if (answers.destination && answers.destination !== 'Not specified') {
    update.destination = answers.destination;
  }
  if (answers.travelDate) update.travelDate = answers.travelDate;
  const adults = answers.adults || answers.travelers;
  if (adults) {
    update.travelers = adults;
    update.adults = adults;
  }
  if (answers.bestTimeToCall) {
    update.preferredCallTime = answers.bestTimeToCall;
  }

  if (!Object.keys(update).length) return null;
  return Lead.updateOne({ _id: conversation.lead }, { $set: update });
}

async function ensureLeadFromBot(conversation) {
  if (conversation?.lead) {
    await syncBotAnswersToLead(conversation);
    return;
  }
  try {
    const { createLeadFromConversation } = require('./whatsappCloudService');
    await createLeadFromConversation(conversation._id, {
      destination: conversation.botAnswers?.destination || undefined,
      travelDate: conversation.botAnswers?.travelDate || undefined,
      travelers: conversation.botAnswers?.adults || conversation.botAnswers?.travelers || undefined,
      name: conversation.profileName || undefined,
    });
  } catch (err) {
    console.error('[whatsappBot] auto-create lead failed', err.message);
  }
}

async function maybeReask(conversation, replyText) {
  const count = Number(conversation.botReaskCount || 0);
  if (count >= MAX_REASKS) {
    await WhatsAppConversation.updateOne(
      { _id: conversation._id },
      { $set: { botStep: 'paused', botEnabled: false, botReaskCount: 0 } }
    );
    await sendAndStoreBotReply(
      conversation,
      'No problem — a travel specialist from our team will connect with you personally.'
    );
    return false;
  }
  await WhatsAppConversation.updateOne(
    { _id: conversation._id },
    { $inc: { botReaskCount: 1 } }
  );
  conversation.botReaskCount = count + 1;
  await sendAndStoreBotReply(conversation, replyText);
  return true;
}

async function startWelcomeFlow(conversation) {
  const claimed = await WhatsAppConversation.findOneAndUpdate(
    {
      _id: conversation._id,
      botEnabled: { $ne: false },
      botOptOut: { $ne: true },
      botStep: { $in: [null, undefined, 'idle'] },
    },
    {
      $set: {
        botStep: 'await_destination',
        botSessionStartedAt: new Date(),
        botReaskCount: 0,
      },
    },
    { new: true }
  );
  if (!claimed) return;
  await sendAndStoreBotReply(claimed, QUESTIONS.welcome);
}

async function handleDestinationAnswer(conversation, text) {
  const destination = parseDestination(text);
  if (!destination) {
    await maybeReask(conversation, QUESTIONS.reaskDestination);
    return;
  }

  const claimed = await WhatsAppConversation.findOneAndUpdate(
    {
      _id: conversation._id,
      botEnabled: { $ne: false },
      botOptOut: { $ne: true },
      botStep: 'await_destination',
    },
    {
      $set: {
        botStep: 'await_travel_date',
        botReaskCount: 0,
        'botAnswers.destinationRaw': text,
        'botAnswers.destination': destination,
      },
    },
    { new: true }
  );
  if (!claimed) return;

  await syncBotAnswersToLead(claimed);
  await sendAndStoreBotReply(claimed, QUESTIONS.travelDate);
}

async function handleTravelDateAnswer(conversation, text) {
  if (!text || isMediaPlaceholder(text)) {
    await maybeReask(conversation, QUESTIONS.reaskTravelDate);
    return;
  }

  const travelDate = parseTravelDate(text);
  // Accept free-text dates even if not parseable (store raw); prefer parsed when available
  const claimed = await WhatsAppConversation.findOneAndUpdate(
    {
      _id: conversation._id,
      botEnabled: { $ne: false },
      botOptOut: { $ne: true },
      botStep: 'await_travel_date',
    },
    {
      $set: {
        botStep: 'await_adults',
        botReaskCount: 0,
        'botAnswers.travelDateRaw': text,
        ...(travelDate ? { 'botAnswers.travelDate': travelDate } : {}),
      },
    },
    { new: true }
  );
  if (!claimed) return;

  await syncBotAnswersToLead(claimed);
  await sendAndStoreBotReply(claimed, QUESTIONS.adults);
}

async function handleAdultsAnswer(conversation, text) {
  const adults = parseAdults(text);
  if (!adults) {
    await maybeReask(conversation, QUESTIONS.reaskAdults);
    return;
  }

  const claimed = await WhatsAppConversation.findOneAndUpdate(
    {
      _id: conversation._id,
      botEnabled: { $ne: false },
      botOptOut: { $ne: true },
      botStep: { $in: ['await_adults', 'await_travelers'] },
    },
    {
      $set: {
        botStep: 'await_best_time',
        botReaskCount: 0,
        'botAnswers.adultsRaw': text,
        'botAnswers.adults': adults,
        'botAnswers.travelersRaw': text,
        'botAnswers.travelers': adults,
      },
    },
    { new: true }
  );
  if (!claimed) return;

  await syncBotAnswersToLead(claimed);
  await sendAndStoreBotReply(claimed, QUESTIONS.bestTime);
}

async function handleBestTimeAnswer(conversation, text) {
  const bestTime = parseBestTime(text);
  if (!bestTime) {
    await maybeReask(conversation, QUESTIONS.reaskBestTime);
    return;
  }

  const claimed = await WhatsAppConversation.findOneAndUpdate(
    {
      _id: conversation._id,
      botEnabled: { $ne: false },
      botOptOut: { $ne: true },
      botStep: 'await_best_time',
    },
    {
      $set: {
        botStep: 'completed',
        botReaskCount: 0,
        botCompletedAt: new Date(),
        'botAnswers.bestTimeRaw': text,
        'botAnswers.bestTimeToCall': bestTime,
        'botAnswers.completedAt': new Date(),
      },
    },
    { new: true }
  );
  if (!claimed) return;

  await ensureLeadFromBot(claimed);
  await sendAndStoreBotReply(claimed, QUESTIONS.done);
}

/**
 * Run after a newly stored inbound WhatsApp message.
 */
async function runWhatsAppQuestionnaireBot({ conversationId, inboundText }) {
  if (!conversationId) return { skipped: true, reason: 'no_conversation' };

  const conversation = await WhatsAppConversation.findById(conversationId);
  if (!conversation) return { skipped: true, reason: 'missing' };

  const text = String(inboundText || '').trim();

  if (isOptOutRequest(text)) {
    await applyOptOut(conversation._id);
    const fresh = await WhatsAppConversation.findById(conversationId);
    if (fresh) {
      fresh.botOptOut = false;
      fresh.botEnabled = true;
      await sendAndStoreBotReply(fresh, STOP_REPLY);
      await applyOptOut(conversation._id);
    }
    return { ok: true, optedOut: true };
  }

  if (isOptInRequest(text)) {
    await applyOptIn(conversation._id);
    const fresh = await WhatsAppConversation.findById(conversationId);
    if (fresh) await sendAndStoreBotReply(fresh, START_REPLY);
    return { ok: true, optedIn: true };
  }

  const step = conversation.botStep || 'idle';
  if (step === 'paused' || conversation.botEnabled === false || conversation.botOptOut === true) {
    return { skipped: true, reason: 'paused_or_opted_out' };
  }

  // Any new message on idle (or completed after cooldown) starts welcome flow
  if (step === 'idle' || step === 'completed') {
    if (!text || isMediaPlaceholder(text)) {
      return { skipped: true, reason: 'empty_inbound' };
    }
    if (step === 'completed' && !canRestartCompleted(conversation)) {
      return { skipped: true, reason: 'restart_cooldown' };
    }
    if (step === 'completed') {
      await WhatsAppConversation.updateOne(
        { _id: conversation._id },
        {
          $set: {
            botStep: 'idle',
            botAnswers: {},
            botReaskCount: 0,
          },
        }
      );
      conversation.botStep = 'idle';
      conversation.botAnswers = {};
    }
    await startWelcomeFlow(conversation);
    return { ok: true, step: 'await_destination' };
  }

  if (isGreeting(text) && ACTIVE_STEPS.includes(step)) {
    return { skipped: true, reason: 'greeting_ignored_during_flow' };
  }

  if (!text || isMediaPlaceholder(text)) {
    if (step === 'await_destination') await maybeReask(conversation, QUESTIONS.reaskDestination);
    else if (step === 'await_travel_date') await maybeReask(conversation, QUESTIONS.reaskTravelDate);
    else if (step === 'await_adults' || step === 'await_travelers') {
      await maybeReask(conversation, QUESTIONS.reaskAdults);
    } else if (step === 'await_best_time') await maybeReask(conversation, QUESTIONS.reaskBestTime);
    return { ok: true, reasked: true };
  }

  if (step === 'await_destination') {
    await handleDestinationAnswer(conversation, text);
    return { ok: true, step: 'await_travel_date' };
  }

  if (step === 'await_travel_date') {
    await handleTravelDateAnswer(conversation, text);
    return { ok: true, step: 'await_adults' };
  }

  if (step === 'await_adults' || step === 'await_travelers') {
    await handleAdultsAnswer(conversation, text);
    return { ok: true, step: 'await_best_time' };
  }

  if (step === 'await_best_time') {
    await handleBestTimeAnswer(conversation, text);
    return { ok: true, step: 'completed' };
  }

  return { skipped: true, reason: 'unknown_step' };
}

async function pauseWhatsAppBot(conversationId) {
  if (!conversationId) return;
  await WhatsAppConversation.updateOne(
    { _id: conversationId, botStep: { $nin: ['completed'] } },
    { $set: { botStep: 'paused', botEnabled: false } }
  );
}

module.exports = {
  runWhatsAppQuestionnaireBot,
  syncBotAnswersToLead,
  pauseWhatsAppBot,
  parseTravelDate,
  parseTravelers: parseAdults,
  parseAdults,
  parseDestination,
  parseBestTime,
  isGreeting,
  QUESTIONS,
};
