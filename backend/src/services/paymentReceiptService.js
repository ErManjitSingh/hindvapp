const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const Lead = require('../models/Lead');
const Quotation = require('../models/Quotation');
const EmailLog = require('../models/EmailLog');
const ApiError = require('../utils/apiError');
const { enqueueEmailJob } = require('./emailQueueService');
const { isEmailConfigured, normalizeRecipients } = require('./emailService');
const { invalidateMailboxCache } = require('./emailMailboxCache');
const company = require('../config/company');
const { resolveAgentContact } = require('../utils/agentContact');

/** Bump when HTML layout changes so stored receipts regenerate. */
const RECEIPT_TEMPLATE_VERSION = 12;

const COMPANY = {
  ...company,
  cgstRate: 2.5,
  sgstRate: 2.5,
};

function formatINR(amount) {
  const n = Number(amount) || 0;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 1 })}`;
}

function formatAmount(amount, decimals = 2) {
  const n = Number(amount) || 0;
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatInvoiceDate(date) {
  if (!date) return '—';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const year = d.getFullYear();
  return `${day}-${mon}-${year}`;
}

function formatDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(date) {
  if (!date) return '—';
  const d = new Date(date);
  const day = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${day} · ${time}`;
}

function formatWeekday(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-IN', { weekday: 'long' });
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function methodLabel(method) {
  const map = {
    cash: 'Cash',
    upi: 'UPI',
    card: 'Card',
    bank_transfer: 'Bank Transfer',
    cheque: 'Cheque',
  };
  return map[method] || method || '—';
}

function leadBadge(leadId) {
  const digits = String(leadId || '').replace(/\D/g, '').slice(-4).padStart(4, '0');
  return `Lead ${digits}`;
}

/** Advance is GST-inclusive — do not add CGST/SGST on top. */
function computeTokenGst(tokenAmount) {
  const grandTotal = Math.round((Number(tokenAmount) || 0) * 100) / 100;
  return { subTotal: grandTotal, cgst: 0, sgst: 0, grandTotal, gstInclusive: true };
}

function buildVoucherPayload({ lead, payment, booking, quotation, agent }) {
  const total = Number(payment.amount) || 0;
  const advance = Number(payment.paidAmount) || 0;
  const balance = Math.max(0, total - advance);
  const receiptNo = payment.receiptNumber || payment.invoiceNumber || '—';
  const paidAtRaw = payment.paidAt || payment.updatedAt || new Date();
  const travelRaw = lead?.travelDate || booking?.travelDate;
  const dest = lead?.destination || booking?.destination || '—';
  const destParts = String(dest).split(',').map((s) => s.trim()).filter(Boolean);
  const gst = computeTokenGst(advance);

  return {
    receiptNumber: receiptNo,
    invoiceNumber: payment.invoiceNumber || receiptNo,
    invoiceDate: formatInvoiceDate(paidAtRaw),
    invoiceGeneratedOn: formatDate(payment.createdAt || paidAtRaw),
    bookingNumber: booking?.bookingNumber || '—',
    quoteNumber: quotation?.quoteNumber || booking?.quotationReference || '—',
    customerName: lead?.name || payment.customerName || 'Customer',
    customerPhone: lead?.phone || '—',
    customerEmail: lead?.email || '',
    customerGstin: lead?.gstin || lead?.gstNo || '',
    leadBadge: leadBadge(lead?._id),
    destination: destParts[0] || dest,
    destinationSub: destParts[1] || lead?.state || '',
    travelDate: formatDate(travelRaw),
    travelWeekday: formatWeekday(travelRaw),
    paymentMethod: methodLabel(payment.method),
    paymentRef: payment.notes || payment.transactionRef || '',
    paidAtLabel: formatDateTime(paidAtRaw),
    paidAt: paidAtRaw,
    totalAmount: total,
    advanceReceived: advance,
    balanceDue: balance,
    totalLabel: formatINR(total),
    advanceLabel: formatINR(advance),
    balanceLabel: formatINR(balance),
    hsn: COMPANY.hsn,
    subTotal: gst.subTotal,
    cgst: gst.cgst,
    sgst: gst.sgst,
    grandTotal: gst.grandTotal,
    cgstRate: COMPANY.cgstRate,
    sgstRate: COMPANY.sgstRate,
    company: { ...COMPANY, phone: agent?.phone || COMPANY.phone },
    agentName: agent?.name || '',
    agentPhone: agent?.phone || '',
  };
}

/**
 * Advance / Token Receipt — card layout matching CRM voucher modal.
 */
function buildPaymentReceiptHtml({
  lead,
  payment,
  booking,
  quotation,
  actor,
  agent,
}) {
  const v = buildVoucherPayload({ lead, payment, booking, quotation, agent });
  const executive = agent?.name || actor?.name || booking?.executiveName || 'HindHolidays Sales';
  const agentPhone = agent?.phone || '';
  const quoteOrBooking = v.quoteNumber !== '—' ? v.quoteNumber : v.bookingNumber;
  const refLine = v.paymentRef ? `Ref: ${escapeHtml(v.paymentRef)}` : 'Confirmed';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Payment Voucher ${escapeHtml(v.receiptNumber)}</title>
<meta name="receipt-template" content="v${RECEIPT_TEMPLATE_VERSION}"/>
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:12px;background:#e8eef3;font-family:Inter,Segoe UI,Arial,Helvetica,sans-serif;color:#0f172a;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sheet{max-width:720px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,.12)}
  .hero{position:relative;background:linear-gradient(135deg,#059669 0%,#047857 55%,#0f766e 100%);color:#fff;padding:18px 22px;overflow:hidden}
  .hero:before{content:"";position:absolute;width:200px;height:200px;right:-50px;top:-90px;border-radius:50%;background:rgba(255,255,255,.08);pointer-events:none}
  .hero-inner{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:14px}
  .brand{margin:0;font-size:10px;letter-spacing:.14em;text-transform:uppercase;opacity:.9;font-weight:700}
  .title{margin:5px 0 0;font-size:22px;font-weight:800;letter-spacing:-.02em;line-height:1.15}
  .sub{margin:5px 0 0;font-size:12px;opacity:.92}
  .status{background:#fff;border-radius:12px;padding:10px 12px;min-width:150px;box-shadow:0 6px 16px rgba(0,0,0,.12)}
  .status-row{display:flex;align-items:center;gap:8px}
  .check{width:24px;height:24px;border-radius:50%;background:#10b981;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex-shrink:0}
  .status strong{display:block;color:#059669;font-size:13px;font-weight:800}
  .status span{display:block;color:#64748b;font-size:10px;margin-top:1px}
  .body{padding:14px 20px 16px}
  .company{display:grid;grid-template-columns:1.3fr .7fr;gap:10px}
  .panel{border:1px solid #e8eef3;border-radius:12px;padding:10px 12px;background:#f8fafc}
  .panel h3{margin:0 0 5px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:800}
  .panel p{margin:0 0 3px;font-size:11px;line-height:1.4;color:#334155}
  .panel strong{color:#0f172a}
  .grid{display:grid;grid-template-columns:1fr 1fr 1fr;border:1px solid #e8eef3;border-radius:12px;overflow:hidden;margin-top:12px}
  .cell{padding:10px 12px;border-right:1px solid #eef2f6;border-bottom:1px solid #eef2f6}
  .cell:nth-child(3n){border-right:none}
  .cell:nth-child(n+4){border-bottom:none}
  .lbl{margin:0 0 3px;font-size:10px;color:#94a3b8;font-weight:600}
  .val{margin:0;font-size:13px;font-weight:800;color:#0f172a;line-height:1.3;word-break:break-word}
  .meta{margin:3px 0 0;font-size:11px;color:#64748b;line-height:1.3}
  .badge{display:inline-block;margin-top:4px;padding:2px 8px;border-radius:999px;background:#d1fae5;color:#047857;font-size:10px;font-weight:700}
  .amounts{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:12px 0}
  .amt{border-radius:12px;padding:12px}
  .amt span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin-bottom:5px}
  .amt strong{display:block;font-size:18px;font-weight:800;letter-spacing:-.02em}
  .total{background:#ecfdf5}.total span{color:#047857}.total strong{color:#064e3b}
  .advance{background:#d1fae5}.advance span{color:#047857}.advance strong{color:#064e3b}
  .balance{background:#ffedd5}.balance span{color:#c2410c}.balance strong{color:#9a3412}
  .tax{margin-top:0;border:1px solid #e8eef3;border-radius:12px;overflow:hidden}
  .tax table{width:100%;border-collapse:collapse;font-size:11px}
  .tax th,.tax td{padding:7px 12px;border-bottom:1px solid #eef2f6}
  .tax th{text-align:left;background:#f8fafc;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
  .tax td.tar{text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
  .tax tr:last-child td{border-bottom:none;background:#ecfdf5;font-weight:800;font-size:12px;color:#064e3b}
  .bank{margin-top:10px;border-radius:12px;padding:10px 12px;background:#fefce8;border:1px solid #fde68a}
  .bank h3{margin:0 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#a16207;font-weight:800}
  .bank p{margin:0;font-size:11px;line-height:1.4;color:#713f12;font-weight:600}
  .terms{margin-top:10px;border-radius:12px;padding:10px 12px;background:#fffbeb;border:1px solid #fde68a}
  .terms h3{margin:0 0 5px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#a16207;font-weight:800}
  .terms ol{margin:0;padding-left:17px}
  .terms li{margin:2px 0;font-size:10px;line-height:1.35;color:#57534e}
  .note{display:flex;gap:10px;align-items:flex-start;background:#eff6ff;border-radius:12px;padding:10px 12px;margin-top:10px}
  .note-ico{width:20px;height:20px;border-radius:50%;background:#3b82f6;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;font-weight:800}
  .note strong{display:block;color:#1d4ed8;font-size:12px;margin-bottom:2px}
  .note p{margin:0;font-size:11px;line-height:1.4;color:#475569}
  .foot{margin-top:10px;padding-top:8px;border-top:1px solid #e8eef3;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between;gap:10px}
  @media print{
    @page{size:A4;margin:8mm}
    body{background:#fff;padding:0}
    .sheet{box-shadow:none;border-radius:0;max-width:none}
  }
</style></head>
<body>
<!-- receipt-template-v${RECEIPT_TEMPLATE_VERSION} -->
<div class="sheet">
  <div class="hero">
    <div class="hero-inner">
      <div>
        <p class="brand">HINDHOLIDAYS</p>
        <h1 class="title">Advance / Token Receipt</h1>
        <p class="sub">Voucher ID: ${escapeHtml(v.receiptNumber)} · ${escapeHtml(v.paidAtLabel)}</p>
      </div>
      <div class="status">
        <div class="status-row">
          <div class="check">✓</div>
          <div>
            <strong>Payment Received</strong>
            <span>Thank you for your payment</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="body">
    <div class="company">
      <div class="panel">
        <h3>Company</h3>
        <p><strong>${escapeHtml(COMPANY.name)}</strong>${COMPANY.tagline ? ` · ${escapeHtml(COMPANY.tagline)}` : ''}</p>
        <p>${escapeHtml(COMPANY.address)}</p>
        ${COMPANY.gstin || COMPANY.pan ? `<p>${COMPANY.gstin ? `<strong>GSTIN:</strong> ${escapeHtml(COMPANY.gstin)}` : ''}${COMPANY.gstin && COMPANY.pan ? ' · ' : ''}${COMPANY.pan ? `<strong>PAN:</strong> ${escapeHtml(COMPANY.pan)}` : ''}</p>` : ''}
        <p><strong>HSN:</strong> ${escapeHtml(COMPANY.hsn)} · Original for Recipient${v.company.phone ? ` · <strong>Phone:</strong> ${escapeHtml(v.company.phone)}` : ''}</p>
      </div>
      <div class="panel">
        <h3>Guest</h3>
        <p><strong>${escapeHtml(v.customerName)}</strong></p>
        <p><strong>Phone:</strong> ${escapeHtml(v.customerPhone)}</p>
        ${v.customerEmail ? `<p><strong>Email:</strong> ${escapeHtml(v.customerEmail)}</p>` : ''}
        ${v.leadBadge ? `<p><span class="badge">${escapeHtml(v.leadBadge)}</span></p>` : ''}
      </div>
    </div>

    <div class="grid">
      <div class="cell">
        <p class="lbl">Customer</p>
        <p class="val">${escapeHtml(v.customerName)}</p>
        <p class="meta">${escapeHtml(v.customerPhone)}</p>
      </div>
      <div class="cell">
        <p class="lbl">Destination</p>
        <p class="val">${escapeHtml(v.destination)}</p>
        ${v.destinationSub ? `<p class="meta">${escapeHtml(v.destinationSub)}</p>` : ''}
      </div>
      <div class="cell">
        <p class="lbl">Travel Date</p>
        <p class="val">${escapeHtml(v.travelDate)}</p>
        ${v.travelWeekday ? `<p class="meta">${escapeHtml(v.travelWeekday)}</p>` : ''}
      </div>
      <div class="cell">
        <p class="lbl">Booking / Quote</p>
        <p class="val">${escapeHtml(quoteOrBooking)}</p>
      </div>
      <div class="cell">
        <p class="lbl">Invoice No.</p>
        <p class="val">${escapeHtml(v.invoiceNumber)}</p>
        <p class="meta">Generated on ${escapeHtml(v.invoiceGeneratedOn)}</p>
      </div>
      <div class="cell">
        <p class="lbl">Payment Mode</p>
        <p class="val">${escapeHtml(v.paymentMethod)}</p>
        <p class="meta">${refLine}</p>
      </div>
    </div>

    <div class="amounts">
      <div class="amt total">
        <span>Package Total</span>
        <strong>${escapeHtml(v.totalLabel)}</strong>
      </div>
      <div class="amt advance">
        <span>Advance Received</span>
        <strong>${escapeHtml(v.advanceLabel)}</strong>
      </div>
      <div class="amt balance">
        <span>Balance Due</span>
        <strong>${escapeHtml(v.balanceLabel)}</strong>
      </div>
    </div>

    <div class="tax">
      <table>
        <tr><th style="width:70%">Particulars</th><th class="tar" style="text-align:right;width:30%">Amount (₹)</th></tr>
        <tr><td>Advance / Token (GST included)</td><td class="tar">${escapeHtml(formatAmount(v.advanceReceived))}</td></tr>
        <tr><td>Grand Total</td><td class="tar">${escapeHtml(formatAmount(v.advanceReceived))}</td></tr>
      </table>
    </div>

    <div class="bank">
      <h3>Bank Details</h3>
      <p>${escapeHtml(COMPANY.bankName)} · A/C: ${escapeHtml(COMPANY.accountNo)} · IFSC: ${escapeHtml(COMPANY.ifsc)}</p>
    </div>

    <div class="terms">
      <h3>Terms &amp; Conditions</h3>
      <ol>
        <li>All payments made to HindHolidays are valid only against an official receipt issued by the company.</li>
        <li>Late payment charges of 18% p.a. may apply to overdue outstanding amounts.</li>
        <li>Any discrepancy regarding this receipt should be communicated in writing within 3 days of receipt.</li>
        <li>The remaining balance must be paid before the travel date, as per the agreed booking terms.</li>
        <li>This is a computer-generated receipt and does not require a physical signature.</li>
        <li>All disputes shall be subject to the jurisdiction of Shimla, Himachal Pradesh.</li>
      </ol>
    </div>

    <div class="note">
      <div class="note-ico">i</div>
      <div>
        <strong>Important Note</strong>
        <p>This is an advance receipt for the above booking. Balance payment is required before the travel date.</p>
      </div>
    </div>

    <div class="foot">
      <span>Prepared by ${escapeHtml(executive)}${agentPhone ? ` · ${escapeHtml(agentPhone)}` : ''}</span>
      <span>${escapeHtml(COMPANY.email || '')}${COMPANY.website ? ` · ${escapeHtml(COMPANY.website)}` : ''}</span>
    </div>
  </div>
</div>
</body></html>`;
}

async function nextReceiptNumber() {
  const count = await Payment.countDocuments({ receiptNumber: { $exists: true, $ne: '' } });
  const year = new Date().getFullYear();
  return `PV-${year}-${String(count + 1).padStart(4, '0')}`;
}

async function generateAndStoreReceipt({ lead, payment, booking, quotation, actor }) {
  if (!payment) return null;

  let receiptNumber = payment.receiptNumber;
  if (!receiptNumber) {
    receiptNumber = await nextReceiptNumber();
  }

  const agent = await resolveAgentContact({ lead, quotation, user: actor });
  const html = buildPaymentReceiptHtml({
    lead,
    payment: { ...payment.toObject?.() || payment, receiptNumber },
    booking,
    quotation,
    actor,
    agent,
  });

  const updated = await Payment.findByIdAndUpdate(
    payment._id,
    { receiptNumber, receiptHtml: html },
    { new: true }
  );

  return updated;
}

async function sendReceiptToCustomer({ lead, payment, actor }) {
  if (!payment?.receiptHtml) return { sent: false, reason: 'no_receipt' };
  if (!isEmailConfigured()) return { sent: false, reason: 'email_not_configured' };

  const recipients = normalizeRecipients(lead?.email || payment.receiptSentTo);
  if (!recipients.length) return { sent: false, reason: 'no_email' };

  const total = Number(payment.amount) || 0;
  const advance = Number(payment.paidAmount) || 0;
  const balance = Math.max(0, total - advance);
  const subject = `HindHolidays — Payment voucher ${payment.receiptNumber || ''}`.trim();
  const text = [
    `Dear ${lead?.name || payment.customerName || 'Customer'},`,
    '',
    `Thank you for choosing HindHolidays for your trip to ${lead?.destination || 'your destination'}.`,
    '',
    `Package total: ${formatINR(total)}`,
    `Advance / token received: ${formatINR(advance)}`,
    `Balance still due: ${formatINR(balance)}`,
    '',
    'Please find your advance / token receipt in this email.',
    '',
    `Warm regards,`,
    actor?.name || 'HindHolidays Sales Team',
  ].join('\n');

  const log = await EmailLog.create({
    leadId: lead._id,
    quotationId: payment.quotation || null,
    branchId: lead.branchId || null,
    category: 'payment_confirmation',
    to: recipients,
    cc: [],
    bcc: [],
    subject,
    status: 'queued',
    sentBy: actor?._id,
    sentByName: actor?.name || 'System',
    attachmentNames: [`${payment.receiptNumber || 'payment-voucher'}.html`],
    bodyText: text.slice(0, 50000),
  });

  invalidateMailboxCache().catch(() => {});

  enqueueEmailJob({
    logId: log._id,
    leadId: lead._id,
    branchId: lead.branchId,
    category: 'payment_confirmation',
    to: recipients,
    cc: [],
    bcc: [],
    subject,
    html: payment.receiptHtml,
    text,
    attachments: [
      {
        filename: `${payment.receiptNumber || 'payment-voucher'}.html`,
        content: Buffer.from(payment.receiptHtml, 'utf8').toString('base64'),
        encoding: 'base64',
        contentType: 'text/html',
      },
    ],
    actor,
  });

  await Payment.findByIdAndUpdate(payment._id, {
    receiptSentAt: new Date(),
    receiptSentTo: recipients.join(', '),
  });

  return { sent: true, to: recipients, emailLogId: log._id };
}

function summarizePayment(payment, booking) {
  if (!payment && !booking) return null;
  const total = Number(payment?.amount ?? booking?.totalAmount) || 0;
  const advance = Number(payment?.paidAmount ?? booking?.advanceReceived) || 0;
  const balance = Math.max(0, Number(booking?.pendingAmount ?? total - advance) || 0);
  return {
    paymentId: payment?._id || null,
    bookingId: booking?._id || null,
    invoiceNumber: payment?.invoiceNumber || null,
    receiptNumber: payment?.receiptNumber || null,
    bookingNumber: booking?.bookingNumber || null,
    method: payment?.method || null,
    status: payment?.status || booking?.paymentStatus || null,
    totalAmount: total,
    advanceReceived: advance,
    balanceDue: balance,
    dueDate: payment?.dueDate || null,
    receiptSentAt: payment?.receiptSentAt || null,
    receiptSentTo: payment?.receiptSentTo || null,
    hasReceipt: Boolean(payment?.receiptNumber || payment?.receiptHtml),
    paidAt: payment?.paidAt || null,
    bookingCreatedAt: booking?.createdAt || null,
    paymentScreenshotUrl: payment?.paymentScreenshotUrl || null,
    paymentScreenshotName: payment?.paymentScreenshotName || null,
    paymentScreenshots: (() => {
      if (Array.isArray(payment?.paymentScreenshots) && payment.paymentScreenshots.length) {
        return payment.paymentScreenshots
          .filter((s) => s?.url)
          .map((s) => ({ url: s.url, name: s.name || 'Payment proof' }));
      }
      if (payment?.paymentScreenshotUrl) {
        return [{ url: payment.paymentScreenshotUrl, name: payment.paymentScreenshotName || 'Payment proof' }];
      }
      return [];
    })(),
    addressProofUrl: payment?.addressProofUrl || null,
  };
}

function formatOpsLabel(value) {
  return String(value || 'pending').replace(/_/g, ' ');
}

/** Slim ops + installment snapshot for sales (no vendor emails / internal notes). */
function resolveHotelStatus(h, hotelConfirmation) {
  if (h?.status && h.status !== 'pending') return h.status;
  if (hotelConfirmation === 'confirmed') return 'confirmed';
  return h?.status || 'pending';
}

function resolveCabStatus(t, cabConfirmation) {
  if (t?.status && t.status !== 'pending') return t.status;
  if (cabConfirmation === 'confirmed') return 'confirmed';
  return t?.status || 'pending';
}

function hotelsFromBookingOrItinerary(booking) {
  const hotelConfirmation = booking?.hotelConfirmation || 'pending';
  const assigned = (booking?.hotels || []).map((h) => ({
    id: h._id,
    name: h.hotelName || 'Hotel',
    day: h.day || null,
    nights: h.nights || null,
    roomType: h.roomType || '',
    mealPlan: h.mealPlan || '',
    checkIn: h.checkIn || null,
    checkOut: h.checkOut || null,
    status: resolveHotelStatus(h, hotelConfirmation),
    confirmationNumber: h.confirmationNumber || '',
    voucherSent: Boolean(h.voucherSentAt),
  }));
  if (assigned.length) return assigned;

  const stays = [];
  for (const day of booking?.itinerary || []) {
    const name = day?.dayHotel?.hotelName || day?.accommodation || '';
    if (!name) continue;
    const dayNum = Number(day.day) || stays.length + 1;
    const prev = stays[stays.length - 1];
    if (prev && String(prev.name).toLowerCase() === String(name).toLowerCase()) {
      prev.nights = (Number(prev.nights) || 1) + 1;
      continue;
    }
    stays.push({
      id: null,
      name,
      day: dayNum,
      nights: 1,
      roomType: day?.dayHotel?.roomType || '',
      mealPlan: day?.dayHotel?.mealPlan || day?.meals || '',
      checkIn: day?.date || null,
      checkOut: null,
      status: resolveHotelStatus(null, hotelConfirmation),
      confirmationNumber: '',
      voucherSent: false,
    });
  }
  return stays;
}

function transportFromBookingOrItinerary(booking) {
  const cabConfirmation = booking?.cabConfirmation || 'pending';
  const assigned = (booking?.transport || []).map((t) => ({
    id: t._id,
    vehicleType: t.vehicleType || 'cab',
    day: t.day || null,
    days: t.days || [],
    driverName: t.driverName || '',
    driverPhone: t.driverPhone || '',
    vehicleNumber: t.vehicleNumber || '',
    pickupLocation: t.pickupLocation || '',
    dropLocation: t.dropLocation || '',
    pickupDate: t.pickupDate || null,
    status: resolveCabStatus(t, cabConfirmation),
    voucherSent: Boolean(t.voucherSentAt),
  }));
  if (assigned.length) return assigned;

  const seen = new Set();
  const rows = [];
  for (const day of booking?.itinerary || []) {
    const vehicleRaw = day?.dayCab?.vehicleType || day?.transport || '';
    if (!vehicleRaw) continue;
    const vehicleType = String(vehicleRaw).toLowerCase().replace(/\s+/g, '_');
    const key = `${vehicleType}|${day?.dayCab?.pickupLocation || ''}|${day?.day || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      id: null,
      vehicleType,
      day: day?.day || null,
      days: [],
      driverName: day?.dayCab?.driverName || '',
      driverPhone: day?.dayCab?.driverPhone || '',
      vehicleNumber: day?.dayCab?.vehicleNumber || '',
      pickupLocation: day?.dayCab?.pickupLocation || '',
      dropLocation: day?.dayCab?.dropLocation || '',
      pickupDate: day?.date || null,
      status: resolveCabStatus(null, cabConfirmation),
      voucherSent: false,
    });
  }
  return rows;
}

function buildOpsFulfillment(payment, booking) {
  if (!booking && !payment) return null;

  const hotels = hotelsFromBookingOrItinerary(booking);
  const transport = transportFromBookingOrItinerary(booking);

  const activities = (booking?.activities || []).map((a) => ({
    id: a._id,
    name: a.name || 'Activity',
    scheduledAt: a.scheduledAt || null,
    status: a.status || 'pending',
  }));

  const itinerary = (booking?.itinerary || []).map((d) => ({
    day: d.day || null,
    title: d.title || (d.day ? `Day ${d.day}` : 'Day'),
    description: d.description || '',
    meals: d.meals || '',
    accommodation: d.accommodation || d.dayHotel?.hotelName || '',
    transport: d.transport || d.dayCab?.vehicleType || '',
    activities: d.activities || '',
    date: d.date || null,
  }));

  const scheduledInstallments = (payment?.scheduledInstallments || []).map((row) => ({
    label: row.label || 'Installment',
    percent: Number(row.percent) || 0,
    amount: Number(row.amount) || 0,
    dueDate: row.dueDate || null,
    status: row.status || 'pending',
  }));

  const receivedInstallments = (payment?.installments || []).map((row) => ({
    amount: Number(row.amount) || 0,
    receivedAt: row.receivedAt || null,
    method: row.method || '',
    reference: row.reference || '',
    note: row.note || '',
  }));

  const hotelConfirmed = hotels.filter((h) => h.status === 'confirmed').length;
  const cabConfirmed = transport.filter((t) => t.status === 'confirmed' || t.status === 'completed').length;
  const installmentsPaid = scheduledInstallments.filter((r) => r.status === 'paid').length;

  return {
    packageName: booking?.packageName || '',
    destination: booking?.destination || '',
    travelDate: booking?.travelDate || null,
    returnDate: booking?.returnDate || null,
    adults: booking?.adults ?? null,
    children: booking?.children ?? null,
    quotationReference: booking?.quotationReference || '',
    bookingNumber: booking?.bookingNumber || payment?.bookingNumber || '',
    bookingStatus: booking?.status || null,
    bookingStatusLabel: formatOpsLabel(booking?.status),
    hotelConfirmation: booking?.hotelConfirmation || 'pending',
    cabConfirmation: booking?.cabConfirmation || 'pending',
    activityConfirmation: booking?.activityConfirmation || 'pending',
    voucherStatus: booking?.voucherStatus || 'pending',
    hotels,
    transport,
    activities,
    itinerary,
    scheduledInstallments,
    receivedInstallments,
    counts: {
      hotelsTotal: hotels.length,
      hotelsConfirmed: hotelConfirmed,
      cabsTotal: transport.length,
      cabsConfirmed: cabConfirmed,
      activitiesTotal: activities.length,
      installmentsTotal: scheduledInstallments.length,
      installmentsPaid,
    },
  };
}

/**
 * Batch-attach payment/booking summary for converted lead list rows.
 */
async function attachPaymentSummariesToLeads(leads = []) {
  if (!Array.isArray(leads) || !leads.length) return leads;

  const ids = leads.map((l) => l._id).filter(Boolean);
  if (!ids.length) return leads;

  const [payments, bookings] = await Promise.all([
    Payment.find({ lead: { $in: ids } })
      .select(
        'lead amount paidAmount status method receiptNumber invoiceNumber dueDate receiptSentAt receiptSentTo paidAt createdAt'
      )
      .sort({ createdAt: -1 })
      .lean(),
    Booking.find({ lead: { $in: ids } })
      .select(
        'lead totalAmount advanceReceived pendingAmount paymentStatus bookingNumber createdAt'
      )
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const paymentByLead = new Map();
  for (const p of payments) {
    const key = String(p.lead);
    if (!paymentByLead.has(key)) paymentByLead.set(key, p);
  }
  const bookingByLead = new Map();
  for (const b of bookings) {
    const key = String(b.lead);
    if (!bookingByLead.has(key)) bookingByLead.set(key, b);
  }

  return leads.map((lead) => {
    const key = String(lead._id);
    const paymentSummary = summarizePayment(paymentByLead.get(key), bookingByLead.get(key));
    return paymentSummary ? { ...lead, paymentSummary } : lead;
  });
}

async function ensureBookingFulfillment(booking) {
  if (!booking?._id) return booking;
  const needs =
    !booking.packageName ||
    !(booking.hotels || []).length ||
    !(booking.transport || []).length ||
    !(booking.itinerary || []).length;
  if (!needs) return booking;

  try {
    const { syncBookingFromQuotation } = require('./operationsQuotationSyncService');
    const result = await syncBookingFromQuotation(booking._id, { force: false });
    return result?.booking || booking;
  } catch {
    return booking;
  }
}

async function getLeadPaymentSummary(leadId) {
  const [payment, bookingRaw] = await Promise.all([
    Payment.findOne({ lead: leadId }).sort({ createdAt: -1 }).lean(),
    Booking.findOne({ lead: leadId }).sort({ createdAt: -1 }).lean(),
  ]);
  const booking = await ensureBookingFulfillment(bookingRaw);
  const summary = summarizePayment(payment, booking);
  if (!summary) return null;
  return {
    ...summary,
    ops: buildOpsFulfillment(payment, booking),
  };
}

async function getLeadPaymentReceipt(leadId, { branchId, extraFilter = {}, refreshHtml = false } = {}) {
  const lead = await Lead.findOne({
    _id: leadId,
    isDeleted: { $ne: true },
    ...(branchId ? { branchId } : {}),
    ...extraFilter,
  }).lean();
  if (!lead) throw new ApiError(404, 'Lead not found');

  let payment = await Payment.findOne({ lead: leadId }).sort({ createdAt: -1 });
  if (!payment) throw new ApiError(404, 'No payment found for this lead');

  const booking = await Booking.findOne({ lead: leadId }).sort({ createdAt: -1 }).lean();
  const quotation = payment.quotation
    ? await Quotation.findById(payment.quotation).lean()
    : null;

  const needsRefresh =
    refreshHtml ||
    !payment.receiptHtml ||
    !String(payment.receiptHtml).includes(`receipt-template-v${RECEIPT_TEMPLATE_VERSION}`);

  if (needsRefresh) {
    payment = await generateAndStoreReceipt({
      lead,
      payment,
      booking,
      quotation,
      actor: { name: booking?.executiveName || 'HindHolidays' },
    });
  }

  const paymentObj = payment.toObject?.() || payment;
  const agent = await resolveAgentContact({
    lead,
    quotation,
    user: { name: booking?.executiveName || '' },
  });
  const voucher = buildVoucherPayload({ lead, payment: paymentObj, booking, quotation, agent });

  return {
    summary: summarizePayment(paymentObj, booking),
    voucher,
    html: payment.receiptHtml,
    lead: {
      _id: lead._id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      destination: lead.destination,
      state: lead.state,
    },
  };
}

module.exports = {
  formatINR,
  buildPaymentReceiptHtml,
  buildVoucherPayload,
  generateAndStoreReceipt,
  sendReceiptToCustomer,
  summarizePayment,
  getLeadPaymentSummary,
  getLeadPaymentReceipt,
  attachPaymentSummariesToLeads,
  COMPANY,
};
