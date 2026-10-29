const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const Lead = require('../models/Lead');
const EmailLog = require('../models/EmailLog');
const EmailReply = require('../models/EmailReply');
const { notifyUser } = require('./notificationService');
const channels = require('../config/channels');

const POLL_MS = Number(process.env.EMAIL_INBOX_POLL_MS || 5 * 60 * 1000);
const CRM_MAILBOX = (process.env.SMTP_USER || 'info@hindholidays.com').toLowerCase();
const MAX_MESSAGES_PER_POLL = Number(process.env.EMAIL_INBOX_MAX_MESSAGES || 50);
const LOOKBACK_DAYS = Number(process.env.EMAIL_INBOX_LOOKBACK_DAYS || 30);

let pollTimer = null;
let polling = false;

function isInboxConfigured() {
  if (!channels.email) return false;
  const host = process.env.IMAP_HOST || process.env.SMTP_HOST;
  const user = process.env.IMAP_USER || process.env.SMTP_USER;
  const pass = process.env.IMAP_PASS || process.env.SMTP_PASS;
  return !!(host && user && pass);
}

function createImapClient() {
  const host = process.env.IMAP_HOST || 'imap.hostinger.com';
  return new ImapFlow({
    host,
    port: Number(process.env.IMAP_PORT || 993),
    secure: process.env.IMAP_SECURE !== 'false',
    auth: {
      user: process.env.IMAP_USER || process.env.SMTP_USER,
      pass: process.env.IMAP_PASS || process.env.SMTP_PASS,
    },
    logger: false,
    socketTimeout: 120000,
    greetingTimeout: 30000,
    tls: {
      servername: host,
      minVersion: 'TLSv1.2',
    },
  });
}

function extractEmailAddress(value) {
  const match =
    String(value || '').match(/<([^>]+)>/) ||
    String(value || '').match(/([\w.+-]+@[\w.-]+\.\w+)/);
  return (match?.[1] || '').toLowerCase().trim();
}

function normalizeMessageId(value) {
  return String(value || '')
    .replace(/^<|>$/g, '')
    .trim()
    .toLowerCase();
}

function collectReferenceIds(inReplyTo, references) {
  const raw = [inReplyTo, references].filter(Boolean).join(' ');
  return [...new Set(
    raw
      .split(/\s+/)
      .map((part) => part.replace(/^<|>$/g, '').trim())
      .filter(Boolean)
  )];
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSnippet(text, html) {
  const raw = (text || stripHtml(html) || '').trim();
  return raw.slice(0, 500);
}

function isReplySubject(subject) {
  return /^(re|fwd|fw)\s*:/i.test(String(subject || '').trim());
}

function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findEmailLogByReferences(refIds) {
  if (!refIds.length) return null;

  const variants = new Set();
  for (const id of refIds) {
    const normalized = normalizeMessageId(id);
    variants.add(id);
    variants.add(normalized);
    variants.add(`<${normalized}>`);
  }

  const direct = await EmailLog.findOne({
    messageId: { $in: [...variants] },
    status: 'sent',
  }).lean();
  if (direct) return direct;

  const recentLogs = await EmailLog.find({
    messageId: { $exists: true, $ne: '' },
    status: 'sent',
  })
    .select('_id leadId messageId subject sentAt')
    .sort({ sentAt: -1 })
    .limit(300)
    .lean();

  const refSet = new Set(refIds.map(normalizeMessageId));
  return recentLogs.find((row) => refSet.has(normalizeMessageId(row.messageId))) || null;
}

async function findLeadByEmail(fromEmail) {
  if (!fromEmail) return null;
  return Lead.findOne({
    email: new RegExp(`^${escapeRegex(fromEmail)}$`, 'i'),
    isDeleted: { $ne: true },
  })
    .select('_id assignedTo branchId name email')
    .lean();
}

async function findLeadByRecentSentTo(fromEmail) {
  if (!fromEmail) return { lead: null, emailLog: null };
  const emailLog = await EmailLog.findOne({
    status: 'sent',
    to: { $elemMatch: { $regex: new RegExp(`^${escapeRegex(fromEmail)}$`, 'i') } },
  })
    .sort({ sentAt: -1 })
    .lean();
  if (!emailLog?.leadId) return { lead: null, emailLog: null };

  const lead = await Lead.findOne({
    _id: emailLog.leadId,
    isDeleted: { $ne: true },
  })
    .select('_id assignedTo branchId name email')
    .lean();

  return { lead, emailLog: lead ? emailLog : null };
}

async function matchLeadAndLog(fromEmail, subject, inReplyTo, references) {
  const refIds = collectReferenceIds(inReplyTo, references);

  const emailLogFromRef = await findEmailLogByReferences(refIds);
  if (emailLogFromRef?.leadId) {
    const lead = await Lead.findOne({
      _id: emailLogFromRef.leadId,
      isDeleted: { $ne: true },
    })
      .select('_id assignedTo branchId name email')
      .lean();
    if (lead) return { lead, emailLog: emailLogFromRef };
  }

  const lead = await findLeadByEmail(fromEmail);
  if (lead) {
    let emailLog = emailLogFromRef;

    if (!emailLog && isReplySubject(subject)) {
      const baseSubject = String(subject).replace(/^(re|fwd|fw)\s*:\s*/i, '').trim();
      emailLog = await EmailLog.findOne({
        leadId: lead._id,
        subject: new RegExp(escapeRegex(baseSubject), 'i'),
        status: 'sent',
      })
        .sort({ sentAt: -1 })
        .lean();
    }

    if (!emailLog) {
      emailLog = await EmailLog.findOne({ leadId: lead._id, status: 'sent' })
        .sort({ sentAt: -1 })
        .lean();
    }

    return { lead, emailLog };
  }

  return findLeadByRecentSentTo(fromEmail);
}

async function processInboundMessage(parsed, messageId) {
  const fromEmail = extractEmailAddress(parsed.from?.text || parsed.from?.value?.[0]?.address);
  if (!fromEmail || fromEmail === CRM_MAILBOX) return null;

  const subject = parsed.subject || '';
  const bodyText = (parsed.text || stripHtml(parsed.html) || '').trim().slice(0, 50000);
  const bodyHtml = String(parsed.html || '').slice(0, 100000);
  const snippet = buildSnippet(parsed.text, parsed.html);
  if (!snippet && !subject) return null;

  const { lead, emailLog } = await matchLeadAndLog(
    fromEmail,
    subject,
    parsed.inReplyTo,
    parsed.references
  );

  if (!lead) {
    console.log('[EmailInbox] No lead match for reply from', fromEmail, 'subject:', subject?.slice(0, 80));
    return null;
  }

  const exists = await EmailReply.findOne({ messageId }).lean();
  if (exists) return null;

  const reply = await EmailReply.create({
    messageId,
    leadId: lead._id,
    emailLogId: emailLog?._id || null,
    branchId: lead.branchId || null,
    fromEmail,
    fromName: parsed.from?.value?.[0]?.name || lead.name || '',
    subject,
    snippet,
    bodyText,
    bodyHtml: bodyHtml || undefined,
    receivedAt: parsed.date || new Date(),
  });

  console.log('[EmailInbox] Stored reply from', fromEmail, 'lead:', lead.name || lead._id);

  if (lead.assignedTo) {
    await notifyUser(lead.assignedTo, {
      type: 'email_reply',
      title: 'Client replied to your email',
      message: `${lead.name || fromEmail}: ${snippet.slice(0, 120)}${snippet.length > 120 ? '…' : ''}`,
      branchId: lead.branchId,
      meta: { leadId: lead._id, emailReplyId: reply._id },
    });
    await EmailReply.findByIdAndUpdate(reply._id, { notifiedUser: lead.assignedTo });
  }

  return reply;
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function pollInboxOnce() {
  if (!isInboxConfigured()) {
    return { ok: false, reason: 'not_configured' };
  }
  if (polling) {
    return { ok: false, reason: 'already_polling' };
  }

  polling = true;
  const stats = { scanned: 0, imported: 0, skipped: 0, errors: [] };
  const client = createImapClient();

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const since = new Date();
      since.setDate(since.getDate() - LOOKBACK_DAYS);

      let uids = await client.search({ since }, { uid: true });
      if (!Array.isArray(uids) || !uids.length) {
        uids = await client.search({ all: true }, { uid: true });
      }

      const sorted = [...(uids || [])].sort((a, b) => b - a).slice(0, MAX_MESSAGES_PER_POLL);
      const batches = chunk(sorted, 5);

      for (const batch of batches) {
        try {
          for await (const msg of client.fetch(batch.join(','), { envelope: true, source: true, uid: true }, { uid: true })) {
            stats.scanned += 1;
            const messageId = msg.envelope?.messageId;
            if (!messageId) {
              stats.skipped += 1;
              continue;
            }

            const known = await EmailReply.findOne({ messageId }).select('_id').lean();
            if (known) {
              stats.skipped += 1;
              continue;
            }

            const parsed = await simpleParser(msg.source);
            const reply = await processInboundMessage(parsed, messageId);
            if (reply) stats.imported += 1;
            else stats.skipped += 1;
          }
        } catch (batchErr) {
          stats.errors.push(batchErr.message);
          console.error('[EmailInbox] Batch fetch failed:', batchErr.message);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
    console.log('[EmailInbox] Poll complete', stats);
    return { ok: true, ...stats };
  } catch (err) {
    console.error('[EmailInbox] Poll failed:', err.message);
    stats.errors.push(err.message);
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
    return { ok: false, ...stats, error: err.message };
  } finally {
    polling = false;
  }
}

function startEmailInboxPoller() {
  if (!isInboxConfigured()) {
    console.log('[EmailInbox] IMAP not configured — reply tracking disabled');
    return;
  }
  if (pollTimer) return;
  console.log('[EmailInbox] Starting reply poller');
  pollInboxOnce().catch((err) => console.error('[EmailInbox] Initial poll failed:', err.message));
  pollTimer = setInterval(() => {
    pollInboxOnce().catch((err) => console.error('[EmailInbox] Scheduled poll failed:', err.message));
  }, POLL_MS);
}

module.exports = {
  isInboxConfigured,
  pollInboxOnce,
  startEmailInboxPoller,
  processInboundMessage,
  matchLeadAndLog,
};
