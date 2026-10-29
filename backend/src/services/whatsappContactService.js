const Lead = require('../models/Lead');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const ApiError = require('../utils/apiError');
const { logLeadActivity } = require('./leadActivityService');

/** Legacy seed bodies — upgraded in place when still unmodified. */
const LEGACY_TEMPLATE_BODIES = new Set([
  'Hello {{customerName}},\n\nThank you for contacting HindHolidays.\n\nHow may I assist you regarding your trip to {{destination}}?',
  'Hello {{customerName}},\n\nYour quotation is ready.\n\nPlease check and let us know if you have any questions.',
  'Hello {{customerName}},\n\nJust following up regarding your travel inquiry.\n\nPlease let us know if you would like to proceed.',
  'Namaste {{customerName}} 🙏\n\nThank you for connecting with *HindHolidays*.\n\nI am {{executiveName}}, and I will personally assist you with your travel plans for *{{destination}}*.\n\nPlease share your preferred travel dates, number of travellers, and any special requirements so I can prepare the best options for you.',
  'Dear {{customerName}},\n\nGreat news — your *{{destination}}* trip is confirmed with *HindHolidays*! 🎉\n\nWe will share your detailed itinerary and vouchers shortly. Please keep this chat saved for any assistance during travel.\n\nThank you for choosing us.\n\n— {{executiveName}}',
]);

const DEFAULT_TEMPLATES = [
  {
    name: 'Welcome',
    body:
      'Hello {{customerName}},\n\nThank you for connecting with *HindHolidays*.\n\nI am {{executiveName}}, and I will personally assist you with your travel plans for *{{destination}}*.\n\nPlease share your preferred travel dates, number of travellers, and any special requirements so I can prepare the best options for you.',
    sortOrder: 1,
  },
  {
    name: 'Trip Inquiry Received',
    body:
      'Dear {{customerName}},\n\nWe have received your inquiry for *{{destination}}*.\n\nOur team is reviewing the best packages and hotels for you. I will share curated options shortly.\n\nMeanwhile, feel free to share any preferences (budget, hotel category, or must-visit places).',
    sortOrder: 2,
  },
  {
    name: 'Quotation Ready',
    body:
      'Dear {{customerName}},\n\nYour customized quotation for *{{destination}}* is ready.\n\nPlease review the itinerary and pricing. If you would like any changes in hotels, inclusions, or dates, I will revise it immediately.\n\nLooking forward to your confirmation.',
    sortOrder: 3,
  },
  {
    name: 'Follow Up',
    body:
      'Dear {{customerName}},\n\nJust checking in regarding your *{{destination}}* trip inquiry.\n\nHave you had a chance to review the options shared earlier? I am happy to adjust the package as per your preferences.\n\nPlease let me know a convenient time to discuss.',
    sortOrder: 4,
  },
  {
    name: 'Schedule a Call',
    body:
      'Dear {{customerName}},\n\nI would love to walk you through the *{{destination}}* package details on a quick call.\n\nPlease share a convenient time today or tomorrow, and I will call you.\n\n— {{executiveName}} | HindHolidays',
    sortOrder: 5,
  },
  {
    name: 'Documents Required',
    body:
      'Dear {{customerName}},\n\nTo proceed with your *{{destination}}* booking, please share the following:\n\n1. Traveller full names (as per ID)\n2. Age / date of birth\n3. Preferred room sharing\n4. Any dietary or special requests\n\nOnce received, we will move ahead with confirmation.',
    sortOrder: 6,
  },
  {
    name: 'Payment Reminder',
    body:
      'Dear {{customerName}},\n\nA gentle reminder regarding the advance payment for your *{{destination}}* trip.\n\nOnce the payment is received, we will confirm hotels and share your booking voucher.\n\nPlease let me know if you need the payment details again.\n\n— {{executiveName}} | HindHolidays',
    sortOrder: 7,
  },
  {
    name: 'Booking Confirmed',
    body:
      'Dear {{customerName}},\n\nGreat news — your *{{destination}}* trip is confirmed with *HindHolidays*!\n\nWe will share your detailed itinerary and vouchers shortly. Please keep this chat saved for any assistance during travel.\n\nThank you for choosing us.\n\n— {{executiveName}}',
    sortOrder: 8,
  },
  {
    name: 'Thank You',
    body:
      'Dear {{customerName}},\n\nThank you for choosing *HindHolidays* for your *{{destination}}* journey.\n\nIt was a pleasure assisting you. If you need any help before or during the trip, simply reply here — I am available for you.\n\nWishing you a wonderful vacation!\n\n— {{executiveName}}',
    sortOrder: 9,
  },
];

function renderTemplate(body, lead, user) {
  return String(body || '')
    .replace(/\{\{customerName\}\}/g, lead?.name || 'Customer')
    .replace(/\{\{destination\}\}/g, lead?.destination || 'your destination')
    .replace(/\{\{executiveName\}\}/g, user?.name || 'HindHolidays')
    .replace(/\{\{quoteNumber\}\}/g, lead?.quoteNumber || '');
}

/**
 * Seed professional templates for a branch.
 * - Inserts any missing catalog templates by name
 * - Upgrades unmodified legacy seed bodies to the new professional copy
 */
async function ensureDefaultTemplates(branchId, userId) {
  const filter = branchId ? { branchId } : { branchId: null };
  const existing = await WhatsAppTemplate.find(filter).lean();
  const byName = new Map(existing.map((t) => [String(t.name).trim().toLowerCase(), t]));

  const ops = [];

  for (const seed of DEFAULT_TEMPLATES) {
    const key = seed.name.trim().toLowerCase();
    const current = byName.get(key);
    if (!current) {
      ops.push({
        insertOne: {
          document: {
            ...seed,
            enabled: true,
            branchId: branchId || null,
            createdBy: userId || null,
          },
        },
      });
      continue;
    }

    const body = String(current.body || '').trim();
    if (LEGACY_TEMPLATE_BODIES.has(body) && body !== seed.body) {
      ops.push({
        updateOne: {
          filter: { _id: current._id },
          update: {
            $set: {
              body: seed.body,
              sortOrder: seed.sortOrder,
            },
          },
        },
      });
    } else if (!current.sortOrder && seed.sortOrder) {
      ops.push({
        updateOne: {
          filter: { _id: current._id },
          update: { $set: { sortOrder: seed.sortOrder } },
        },
      });
    }
  }

  if (ops.length) {
    await WhatsAppTemplate.bulkWrite(ops, { ordered: false });
  }
}

async function listTemplates({ branchId, includeDisabled = false } = {}) {
  const filter = { ...(branchId ? { branchId } : {}) };
  if (!includeDisabled) filter.enabled = true;
  return WhatsAppTemplate.find(filter).sort({ sortOrder: 1, createdAt: 1 }).lean();
}

async function assertCanAccessLead(req, leadId) {
  const lead = await Lead.findOne({
    _id: leadId,
    isDeleted: { $ne: true },
    ...(req.branchId ? { branchId: req.branchId } : {}),
  });
  if (!lead) throw new ApiError(404, 'Lead not found');

  if (req.user.role === 'sales_executive') {
    if (String(lead.assignedTo) !== String(req.user._id)) {
      throw new ApiError(403, 'Lead not assigned to you');
    }
  }

  return lead;
}

async function recordWhatsAppContact({ req, leadId, templateId = null }) {
  const lead = await assertCanAccessLead(req, leadId);
  const now = new Date();
  let templateName = '';

  if (templateId) {
    const template = await WhatsAppTemplate.findOne({
      _id: templateId,
      enabled: true,
      ...(req.branchId ? { branchId: req.branchId } : {}),
    }).lean();
    if (!template) throw new ApiError(404, 'Template not found');
    templateName = template.name;
  }

  lead.lastContactedAt = now;
  lead.lastContactMethod = 'whatsapp';
  lead.lastContactedBy = req.user._id;
  if (!lead.firstContactAt) lead.firstContactAt = now;
  await lead.save();

  await logLeadActivity({
    leadId: lead._id,
    branchId: lead.branchId,
    type: 'whatsapp_contact_initiated',
    title: 'WhatsApp Contact Initiated',
    description: templateName
      ? `WhatsApp opened · Template: ${templateName}`
      : 'WhatsApp opened to contact customer',
    actor: req.user,
    meta: {
      method: 'whatsapp',
      templateId: templateId || null,
      templateName: templateName || null,
    },
  });

  return {
    leadId: lead._id,
    lastContactedAt: lead.lastContactedAt,
    lastContactMethod: lead.lastContactMethod,
    lastContactedBy: req.user._id,
    contactedByName: req.user.name,
  };
}

module.exports = {
  DEFAULT_TEMPLATES,
  renderTemplate,
  ensureDefaultTemplates,
  listTemplates,
  recordWhatsAppContact,
  assertCanAccessLead,
};
