const EmailTemplate = require('../models/EmailTemplate');

const DEFAULT_TEMPLATES = [
  {
    name: 'Quotation',
    category: 'quotation',
    subject: '✨ Your dream trip to {{destination}} — Quotation {{quotationNumber}}',
    body:
      'Thank you for trusting HindHolidays with your travel plans!\n\nWe have carefully crafted a personalised quotation for your journey to {{destination}}. Your quote reference is {{quotationNumber}} with a package value of {{amount}}.\n\nYour preferred travel date: {{travelDate}}.\n\nPlease review the attached quotation at your convenience. Our team is ready to customise every detail — hotels, transfers, sightseeing, and more.\n\nReply to this email or call us anytime to confirm or request changes.',
    sortOrder: 1,
  },
  {
    name: 'Follow-up',
    category: 'follow_up',
    subject: 'Still thinking about {{destination}}? We are here to help ✈️',
    body:
      'We hope you are doing well!\n\nWe wanted to gently follow up on your travel enquiry for {{destination}}. Our travel experts have some wonderful options that match your preferences.\n\nWhether you need more details, a revised itinerary, or help with dates — we are just a message away.\n\nLet us know a convenient time to connect, and we will make planning effortless for you.',
    sortOrder: 2,
  },
  {
    name: 'Booking Confirmation',
    category: 'booking_confirmation',
    subject: '🎉 Booking confirmed! Your {{destination}} adventure awaits',
    body:
      'Wonderful news — your booking is confirmed!\n\nWe are thrilled to be part of your upcoming trip to {{destination}}. Your travel date is {{travelDate}}.\n\nOur operations team is now finalising every detail to ensure a seamless, memorable experience.\n\nYou will receive your vouchers and itinerary shortly. Thank you for choosing HindHolidays — where every journey becomes a story.',
    sortOrder: 3,
  },
  {
    name: 'Payment Confirmation',
    category: 'payment_confirmation',
    subject: '✅ Payment received — {{amount}} | HindHolidays',
    body:
      'Thank you! We have successfully received your payment of {{amount}}.\n\nYour transaction has been recorded and our team is processing the next steps for your travel arrangements.\n\nIf you need a receipt or have any questions, simply reply to this email.\n\nWe appreciate your trust in HindHolidays.',
    sortOrder: 4,
  },
  {
    name: 'Welcome',
    category: 'welcome',
    subject: 'Welcome aboard, {{customerName}}! 🌏 Your journey starts here',
    body:
      'Welcome to the HindHolidays family!\n\nWe are delighted to have you with us. Your enquiry for {{destination}} has been received and assigned to our dedicated travel specialist.\n\nFrom curated itineraries to handpicked stays — we craft experiences, not just trips.\n\nSit back and relax — we will be in touch shortly with exciting options tailored just for you.',
    sortOrder: 5,
  },
  {
    name: 'Reactivation',
    category: 'reactivation',
    subject: '{{customerName}}, your {{destination}} trip is still waiting for you ✨',
    body:
      'We noticed you were exploring a trip to {{destination}} — and we would love to bring that plan back to life!\n\nTravel trends, seasonal offers, and fresh itineraries change often. Our team can share updated packages that may suit you even better than before.\n\nReply to this email or give us a call — let us help you take the next step toward an unforgettable journey.',
    sortOrder: 6,
  },
];

function formatCurrency(amount) {
  const n = Number(amount) || 0;
  return `₹${n.toLocaleString('en-IN')}`;
}

function formatTravelDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function renderEmailTemplate(text, context = {}) {
  const vars = {
    customerName: context.customerName || context.name || 'Customer',
    destination: context.destination || 'your destination',
    quotationNumber: context.quotationNumber || context.quoteNumber || '',
    amount: context.amount != null ? formatCurrency(context.amount) : '',
    travelDate: formatTravelDate(context.travelDate),
    executiveName: context.executiveName || 'HindHolidays',
  };

  return String(text || '').replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

async function ensureDefaultEmailTemplates(branchId, userId) {
  const filter = branchId ? { branchId } : { branchId: null };
  const count = await EmailTemplate.countDocuments(filter);
  if (count > 0) return;

  await EmailTemplate.insertMany(
    DEFAULT_TEMPLATES.map((t) => ({
      ...t,
      enabled: true,
      branchId: branchId || null,
      createdBy: userId || null,
    }))
  );
}

module.exports = {
  DEFAULT_TEMPLATES,
  renderEmailTemplate,
  ensureDefaultEmailTemplates,
};
