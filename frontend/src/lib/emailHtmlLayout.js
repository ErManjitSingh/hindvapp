import { COMPANY_INFO } from '../config/branding';

const BRAND = {
  name: COMPANY_INFO.name,
  tagline: COMPANY_INFO.tagline,
  email: COMPANY_INFO.email,
  website: COMPANY_INFO.websiteUrl,
};

const CATEGORY_ACCENT = {
  quotation: { primary: '#4f46e5', secondary: '#818cf8', label: 'Travel Quotation', ring: 'ring-indigo-500/30' },
  follow_up: { primary: '#0284c7', secondary: '#38bdf8', label: 'Follow-up', ring: 'ring-sky-500/30' },
  booking_confirmation: { primary: '#059669', secondary: '#34d399', label: 'Booking Confirmed', ring: 'ring-emerald-500/30' },
  payment_confirmation: { primary: '#d97706', secondary: '#fbbf24', label: 'Payment Received', ring: 'ring-amber-500/30' },
  welcome: { primary: '#7c3aed', secondary: '#a78bfa', label: 'Welcome', ring: 'ring-violet-500/30' },
  reactivation: { primary: '#e11d48', secondary: '#fb7185', label: 'We miss you', ring: 'ring-rose-500/30' },
  custom: { primary: '#0ea5e9', secondary: '#67e8f9', label: 'Message', ring: 'ring-sky-500/30' },
};

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textToParagraphs(text) {
  return String(text || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(
      (line) =>
        `<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#334155;">${escapeHtml(line)}</p>`
    )
    .join('');
}

function buildHighlightCard(meta = {}) {
  const rows = [];
  if (meta.destination) rows.push(['Destination', meta.destination]);
  if (meta.quotationNumber) rows.push(['Quotation', meta.quotationNumber]);
  if (meta.amount) rows.push(['Amount', meta.amount]);
  if (meta.travelDate && meta.travelDate !== '—') rows.push(['Travel date', meta.travelDate]);
  if (!rows.length) return '';

  const cells = rows
    .map(
      ([label, value]) => `
        <div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #e2e8f0;">
          <span style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;">${escapeHtml(label)}</span>
          <span style="font-size:13px;font-weight:700;color:#0f172a;text-align:right;">${escapeHtml(value)}</span>
        </div>`
    )
    .join('');

  return `<div style="margin:0 0 20px;padding:16px;background:linear-gradient(135deg,#f8fafc,#f1f5f9);border:1px solid #e2e8f0;border-radius:12px;">${cells}</div>`;
}

export function wrapEmailHtml(bodyText, options = {}) {
  const {
    subject = '',
    category = 'custom',
    customerName = 'Customer',
    destination,
    quotationNumber,
    amount,
    travelDate,
    executiveName,
  } = options;

  const accent = CATEGORY_ACCENT[category] || CATEGORY_ACCENT.custom;
  const paragraphs = textToParagraphs(bodyText);
  const highlight = buildHighlightCard({ destination, quotationNumber, amount, travelDate });
  const greeting = customerName ? `Dear ${escapeHtml(customerName)},` : 'Hello,';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef2ff;font-family:Arial,sans-serif;">
  <div style="padding:20px 12px;background:linear-gradient(180deg,#e0f2fe,#eef2ff);">
    <div style="max-width:520px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:12px;">
        <span style="display:inline-block;padding:6px 14px;border-radius:999px;background:#fff;border:1px solid #cbd5e1;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${accent.primary};">${escapeHtml(accent.label)}</span>
      </div>
      <div style="background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 20px 40px -12px rgba(15,23,42,0.2);border:1px solid #e2e8f0;">
        <div style="padding:28px 24px;text-align:center;background:linear-gradient(135deg,${accent.primary},${accent.secondary});">
          <div style="font-size:22px;font-weight:800;color:#fff;">✈ ${BRAND.name}</div>
          <div style="margin-top:6px;font-size:11px;color:rgba(255,255,255,0.9);letter-spacing:0.06em;text-transform:uppercase;">${BRAND.tagline}</div>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#0f172a;">${greeting}</p>
          ${highlight}
          ${paragraphs}
          <div style="text-align:center;margin-top:20px;">
            <span style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,${accent.primary},${accent.secondary});color:#fff;font-weight:700;font-size:13px;border-radius:10px;">Explore HindHolidays</span>
          </div>
        </div>
        <div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
          <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#0f172a;">${escapeHtml(executiveName || 'HindHolidays Sales Team')}</p>
          <p style="margin:0;font-size:12px;color:#64748b;">
            ${BRAND.email} · ${COMPANY_INFO.phone}<br/>
            <a href="${COMPANY_INFO.instagram}" style="color:#64748b;">Instagram</a>
            &nbsp;·&nbsp;
            <a href="${COMPANY_INFO.facebook}" style="color:#64748b;">Facebook</a>
            &nbsp;·&nbsp;
            <a href="${BRAND.website}" style="color:#64748b;">${COMPANY_INFO.website}</a>
          </p>
        </div>
      </div>
    </div>
  </div>
</body></html>`;
}

export function buildEmailPreviewOptions(lead, category, extras = {}) {
  const amount = extras.amount ?? lead?.budget;
  const formattedAmount =
    amount != null && amount !== '' ? `₹${Number(amount).toLocaleString('en-IN')}` : '';
  const travelDate = lead?.travelDate
    ? new Date(lead.travelDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  return {
    category,
    customerName: lead?.name || 'Customer',
    destination: lead?.destination,
    quotationNumber: extras.quotationNumber || extras.quoteNumber,
    amount: formattedAmount,
    travelDate,
    executiveName: extras.executiveName || 'HindHolidays Sales Team',
  };
}

export function getCategoryAccent(category) {
  return CATEGORY_ACCENT[category] || CATEGORY_ACCENT.custom;
}

export { BRAND, CATEGORY_ACCENT };
