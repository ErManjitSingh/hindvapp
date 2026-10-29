const company = require('../config/company');

const BRAND = {
  name: company.name,
  tagline: company.tagline,
  email: company.email,
  phone: company.phone,
  website: company.websiteUrl,
};

const CATEGORY_ACCENT = {
  quotation: { primary: '#4f46e5', secondary: '#818cf8', label: 'Travel Quotation' },
  follow_up: { primary: '#0284c7', secondary: '#38bdf8', label: 'Follow-up' },
  booking_confirmation: { primary: '#059669', secondary: '#34d399', label: 'Booking Confirmed' },
  payment_confirmation: { primary: '#d97706', secondary: '#fbbf24', label: 'Payment Received' },
  welcome: { primary: '#7c3aed', secondary: '#a78bfa', label: 'Welcome' },
  reactivation: { primary: '#e11d48', secondary: '#fb7185', label: 'We miss you' },
  custom: { primary: '#0ea5e9', secondary: '#67e8f9', label: 'Message from HindHolidays' },
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
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#334155;font-family:Georgia,'Times New Roman',serif;">${escapeHtml(line)}</p>`
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
        <tr>
          <td style="padding:10px 0;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;font-family:Arial,sans-serif;width:38%;">${escapeHtml(label)}</td>
          <td style="padding:10px 0;font-size:15px;font-weight:700;color:#0f172a;font-family:Arial,sans-serif;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join('');

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 28px;background:linear-gradient(135deg,#f8fafc 0%,#f1f5f9 100%);border:1px solid #e2e8f0;border-radius:16px;">
      <tr>
        <td style="padding:20px 24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${cells}</table>
        </td>
      </tr>
    </table>`;
}

function wrapEmailHtml(bodyText, options = {}) {
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>${escapeHtml(subject || BRAND.name)}</title>
</head>
<body style="margin:0;padding:0;background:#eef2ff;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(180deg,#e0f2fe 0%,#eef2ff 45%,#f8fafc 100%);padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;">
          <tr>
            <td style="padding-bottom:20px;text-align:center;">
              <div style="display:inline-block;padding:8px 18px;border-radius:999px;background:rgba(255,255,255,0.85);border:1px solid #cbd5e1;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${accent.primary};">
                ${escapeHtml(accent.label)}
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 25px 50px -12px rgba(15,23,42,0.18);border:1px solid #e2e8f0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="background:linear-gradient(135deg,${accent.primary} 0%,${accent.secondary} 100%);padding:36px 32px;text-align:center;">
                    <div style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;font-family:Arial,sans-serif;">✈ ${BRAND.name}</div>
                    <div style="margin-top:8px;font-size:13px;color:rgba(255,255,255,0.92);letter-spacing:0.06em;text-transform:uppercase;">${BRAND.tagline}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:36px 32px 12px;">
                    <p style="margin:0 0 20px;font-size:18px;font-weight:700;color:#0f172a;font-family:Arial,sans-serif;">${greeting}</p>
                    ${highlight}
                    ${paragraphs}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 32px 36px;text-align:center;">
                    <a href="${BRAND.website}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,${accent.primary},${accent.secondary});color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:12px;box-shadow:0 10px 25px -8px ${accent.primary};font-family:Arial,sans-serif;">
                      Explore HindHolidays
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                    <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#0f172a;font-family:Arial,sans-serif;">${escapeHtml(executiveName || 'HindHolidays Sales Team')}</p>
                    <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;font-family:Arial,sans-serif;">
                      📧 <a href="mailto:${BRAND.email}" style="color:${accent.primary};text-decoration:none;">${BRAND.email}</a>
                      &nbsp;·&nbsp; 📞 ${BRAND.phone}<br/>
                      🌐 <a href="${BRAND.website}" style="color:${accent.primary};text-decoration:none;">${company.website}</a>
                      &nbsp;·&nbsp; <a href="${company.instagram}" style="color:${accent.primary};text-decoration:none;">Instagram</a>
                      &nbsp;·&nbsp; <a href="${company.facebook}" style="color:${accent.primary};text-decoration:none;">Facebook</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 12px 8px;text-align:center;font-size:11px;line-height:1.6;color:#94a3b8;font-family:Arial,sans-serif;">
              You received this email because you enquired about travel with ${BRAND.name}.<br/>
              © ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function wrapQuotationAttachmentHtml(quote = {}, lead = {}) {
  const quoteNo = quote.quoteNumber || '—';
  const customer = quote.lead?.name || quote.customerName || lead.name || 'Customer';
  const destination = quote.destination || quote.lead?.destination || lead.destination || '—';
  const amount = quote.totalAmount ?? quote.grandTotal ?? 0;
  const amountStr = `₹${Number(amount).toLocaleString('en-IN')}`;
  const travelDate = quote.travelDate
    ? new Date(quote.travelDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

  const body = `Thank you for choosing HindHolidays. Your personalised quotation is ready for review.

Our travel experts have prepared this package based on your requirements. Please review the summary below and reach out if you'd like any changes.

We look forward to making your journey memorable!`;

  return wrapEmailHtml(body, {
    subject: `Quotation ${quoteNo}`,
    category: 'quotation',
    customerName: customer,
    destination,
    quotationNumber: quoteNo,
    amount: amountStr,
    travelDate,
    executiveName: 'HindHolidays Sales Team',
  });
}

module.exports = {
  BRAND,
  CATEGORY_ACCENT,
  escapeHtml,
  wrapEmailHtml,
  wrapQuotationAttachmentHtml,
};
