const path = require('path');
const fs = require('fs');
const Lead = require('../models/Lead');
const Payment = require('../models/Payment');
const Quotation = require('../models/Quotation');
const ApiError = require('../utils/apiError');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/address-proofs');
const PAYMENT_SHOT_DIR = path.join(__dirname, '../../uploads/payment-screenshots');

function ensureUploadDir(dir = UPLOAD_DIR) {
  fs.mkdirSync(dir, { recursive: true });
}

function saveBase64Upload({ leadId, base64, originalName, dir, urlPrefix, label }) {
  if (!base64) return null;
  ensureUploadDir(dir);
  const raw = String(base64).replace(/^data:[^;]+;base64,/, '');
  const buf = Buffer.from(raw, 'base64');
  if (!buf.length) return null;
  if (buf.length > 8 * 1024 * 1024) {
    throw new ApiError(400, `${label} must be under 8 MB`);
  }
  const safe = String(originalName || label).replace(/[^\w.\-]+/g, '_');
  const fileName = `${leadId}-${Date.now()}-${safe}`;
  fs.writeFileSync(path.join(dir, fileName), buf);
  return {
    url: `${urlPrefix}/${fileName}`,
    name: originalName || fileName,
  };
}

function saveAddressProofBase64({ leadId, base64, originalName }) {
  return saveBase64Upload({
    leadId,
    base64,
    originalName,
    dir: UPLOAD_DIR,
    urlPrefix: '/uploads/address-proofs',
    label: 'Address proof',
  });
}

function savePaymentScreenshotBase64({ leadId, base64, originalName }) {
  return saveBase64Upload({
    leadId,
    base64,
    originalName,
    dir: PAYMENT_SHOT_DIR,
    urlPrefix: '/uploads/payment-screenshots',
    label: 'Payment screenshot',
  });
}

/** Normalize body into [{ base64, name }] — supports multi + legacy single fields */
function collectPaymentScreenshotUploads(body = {}) {
  const list = [];
  const arr = Array.isArray(body.paymentScreenshots) ? body.paymentScreenshots : [];
  for (const item of arr) {
    if (item?.base64) {
      list.push({ base64: item.base64, name: item.name || 'payment-proof' });
    }
  }
  // Legacy single field only when multi array was not provided (avoid duplicating first image)
  if (!list.length && body.paymentScreenshotBase64) {
    list.push({
      base64: body.paymentScreenshotBase64,
      name: body.paymentScreenshotName || 'payment-proof',
    });
  }
  return list;
}

function applyPaymentScreenshotsToPayment(payment, uploads, leadId) {
  if (!uploads?.length) return payment;
  const existing = Array.isArray(payment.paymentScreenshots)
    ? [...payment.paymentScreenshots]
    : [];
  for (const item of uploads) {
    const shot = savePaymentScreenshotBase64({
      leadId,
      base64: item.base64,
      originalName: item.name,
    });
    if (shot) existing.push({ url: shot.url, name: shot.name });
  }
  payment.paymentScreenshots = existing;
  const primary = existing[0];
  if (primary) {
    payment.paymentScreenshotUrl = primary.url;
    payment.paymentScreenshotName = primary.name;
  }
  return payment;
}

function listPaymentScreenshots(payment) {
  if (!payment) return [];
  if (Array.isArray(payment.paymentScreenshots) && payment.paymentScreenshots.length) {
    return payment.paymentScreenshots
      .filter((s) => s?.url)
      .map((s) => ({ url: s.url, name: s.name || 'Payment proof' }));
  }
  if (payment.paymentScreenshotUrl) {
    return [{ url: payment.paymentScreenshotUrl, name: payment.paymentScreenshotName || 'Payment proof' }];
  }
  return [];
}

function midDate(a, b) {
  const t1 = new Date(a).getTime();
  const t2 = new Date(b).getTime();
  if (!Number.isFinite(t1)) return null;
  if (!Number.isFinite(t2)) return new Date(t1 + 3 * 86400000);
  return new Date(Math.round((t1 + t2) / 2));
}

function buildInstallmentSchedule({ total, token, travelDate, returnDate }) {
  const packageTotal = Math.max(0, Number(total) || 0);
  const paid = Math.max(0, Math.min(packageTotal, Number(token) || 0));
  const remaining = Math.max(0, packageTotal - paid);
  const a50 = Math.round(remaining * 0.5);
  const a30 = Math.round(remaining * 0.3);
  const aRest = Math.max(0, remaining - a50 - a30);
  const start = travelDate ? new Date(travelDate) : null;
  const end = returnDate ? new Date(returnDate) : start;
  const due50 = start ? new Date(start.getTime() - 2 * 86400000) : null;
  const due30 = midDate(start, end);
  const dueRest = end || start;

  return [
    {
      label: 'Installment 1 — 50% after token',
      percent: remaining > 0 ? Math.round((a50 / remaining) * 100) : 50,
      amount: a50,
      dueDate: due50,
      status: 'pending',
    },
    {
      label: 'Installment 2 — 30% mid-tour',
      percent: remaining > 0 ? Math.round((a30 / remaining) * 100) : 30,
      amount: a30,
      dueDate: due30,
      status: 'pending',
    },
    {
      label: 'Installment 3 — balance on last tour day',
      percent: remaining > 0 ? Math.round((aRest / remaining) * 100) : 20,
      amount: aRest,
      dueDate: dueRest,
      status: 'pending',
    },
  ].filter((row) => row.amount > 0);
}

async function getCommercialFormDraft({ leadId, executiveId, branchId }) {
  const lead = await Lead.findOne({
    _id: leadId,
    assignedTo: executiveId,
    ...(branchId ? { branchId } : {}),
    isDeleted: { $ne: true },
  }).lean();
  if (!lead) throw new ApiError(404, 'Lead not found');
  if (lead.status !== 'converted' && lead.status !== 'booked') {
    throw new ApiError(400, 'Commercial form is available after lead is booked');
  }

  const Booking = require('../models/Booking');
  const [quotations, payment, booking] = await Promise.all([
    Quotation.find({ lead: leadId })
      .select('quoteNumber status title pricing costing packageSnapshot updatedAt')
      .sort({ updatedAt: -1 })
      .lean(),
    Payment.findOne({ lead: leadId }).sort({ createdAt: -1 }).lean(),
    Booking.findOne({ lead: leadId }).select('quotation quotationReference').sort({ createdAt: -1 }).lean(),
  ]);

  const pinnedId = booking?.quotation || payment?.quotation || null;
  const quotation =
    (pinnedId && quotations.find((q) => String(q._id) === String(pinnedId))) ||
    quotations.find((q) => q.status === 'approved') ||
    quotations[0] ||
    null;

  const total =
    Number(payment?.amount) ||
    Number(quotation?.pricing?.total) ||
    Number(quotation?.costing2?.grandTotal) ||
    Number(lead.budget) ||
    0;
  const token = Number(payment?.paidAmount) || 0;
  const gstAmount =
    Number(payment?.gstAmount) ||
    Number(quotation?.pricing?.taxes) ||
    Number(quotation?.costing2?.taxes) ||
    0;
  const packageMarginPercent =
    Number(payment?.packageMarginPercent) ||
    Number(quotation?.costing2?.markupPercent) ||
    Number(quotation?.pricing?.markupPercent) ||
    0;
  const totalCost =
    Number(payment?.totalCost) ||
    Number(quotation?.costing2?.baseCost) ||
    Math.max(0, total - Math.round((total * packageMarginPercent) / (100 + packageMarginPercent || 1)));

  const schedule =
    payment?.scheduledInstallments?.length > 0
      ? payment.scheduledInstallments
      : buildInstallmentSchedule({
          total,
          token,
          travelDate: lead.travelDate,
          returnDate: lead.returnDate,
        });

  return {
    lead: {
      _id: lead._id,
      name: lead.name,
      destination: lead.destination,
      travelDate: lead.travelDate,
      returnDate: lead.returnDate,
    },
    quotation: quotation
      ? {
          _id: quotation._id,
          quoteNumber: quotation.quoteNumber,
          packageName: quotation.packageSummary?.packageName || quotation.packageSnapshot?.name,
          costing2: quotation.costing2,
          status: quotation.status,
        }
      : null,
    availableQuotations: quotations.map((q) => ({
      _id: q._id,
      quoteNumber: q.quoteNumber,
      status: q.status,
      title: q.title,
      packageName: q.packageSnapshot?.name || q.title || '',
      amount: Number(q.pricing?.total || q.costing?.grandTotal || 0),
    })),
    selectedQuotationId: quotation?._id || null,
    paymentId: payment?._id || null,
    packageMarginPercent,
    totalCost,
    gstAmount,
    amountReceived: token,
    paymentMethod: payment?.method || 'upi',
    totalAmount: total,
    balance: Math.max(0, total - token),
    scheduledInstallments: schedule,
    addressProofUrl: payment?.addressProofUrl || '',
    addressProofName: payment?.addressProofName || '',
    paymentScreenshotUrl: payment?.paymentScreenshotUrl || '',
    paymentScreenshotName: payment?.paymentScreenshotName || '',
    paymentScreenshots: listPaymentScreenshots(payment),
    commercialCompletedAt: payment?.commercialCompletedAt || null,
  };
}

function normalizeCustomInstallments(rows, { total, token }) {
  const packageTotal = Math.max(0, Number(total) || 0);
  const paid = Math.max(0, Math.min(packageTotal, Number(token) || 0));
  const remaining = Math.max(0, packageTotal - paid);
  if (!Array.isArray(rows) || !rows.length) return null;

  const cleaned = rows
    .map((row, index) => {
      const amount = Math.max(0, Math.round(Number(row.amount) || 0));
      if (amount <= 0) return null;
      const due = row.dueDate ? new Date(row.dueDate) : null;
      return {
        label: String(row.label || `Installment ${index + 1}`).trim() || `Installment ${index + 1}`,
        percent: remaining > 0 ? Math.round((amount / remaining) * 100) : 0,
        amount,
        dueDate: due && Number.isFinite(due.getTime()) ? due : null,
        status: ['pending', 'paid', 'waived'].includes(row.status) ? row.status : 'pending',
      };
    })
    .filter(Boolean);

  if (!cleaned.length) return null;

  const sum = cleaned.reduce((s, r) => s + r.amount, 0);
  if (Math.abs(sum - remaining) > 5) {
    const err = new ApiError(
      400,
      `Installment amounts (₹${sum.toLocaleString('en-IN')}) must equal remaining balance (₹${remaining.toLocaleString('en-IN')})`
    );
    throw err;
  }
  return cleaned;
}

async function syncPaymentReminders({ lead, payment, user, schedule }) {
  const FollowUp = require('../models/FollowUp');
  const assignee = lead.assignedTo || user?._id;
  if (!assignee || !Array.isArray(schedule) || !schedule.length) return;

  // Clear prior auto payment reminders for this lead
  await FollowUp.updateMany(
    {
      lead: lead._id,
      status: 'pending',
      type: 'other',
      notes: { $regex: /^Payment reminder:/i },
    },
    {
      $set: {
        status: 'completed',
        completedAt: new Date(),
        outcome: 'auto_replaced_payment_plan',
      },
    }
  );

  const createRows = schedule.filter(
    (row) => row.amount > 0 && row.status !== 'paid' && row.status !== 'waived' && row.dueDate
  );

  for (const row of createRows) {
    const due = new Date(row.dueDate);
    if (!Number.isFinite(due.getTime())) continue;
    // Reminder at 10:00 AM on due date (local server time)
    due.setHours(10, 0, 0, 0);
    await FollowUp.create({
      lead: lead._id,
      branchId: lead.branchId || null,
      type: 'other',
      category: 'warm',
      scheduledAt: due,
      status: 'pending',
      priority: 'high',
      notes: `Payment reminder: ${row.label} — ₹${Number(row.amount || 0).toLocaleString('en-IN')} due`,
      outcome: 'payment_due',
      assignedTo: assignee,
      createdBy: user?._id || assignee,
    });
  }

  const { syncLeadFollowUpDates } = require('../utils/followUpHelpers');
  await syncLeadFollowUpDates(lead._id);
}

async function saveCommercialForm({ leadId, executiveId, branchId, body }) {
  const draft = await getCommercialFormDraft({ leadId, executiveId, branchId });
  const payment = draft.paymentId
    ? await Payment.findById(draft.paymentId)
    : await Payment.findOne({ lead: leadId }).sort({ createdAt: -1 });

  if (!payment) {
    throw new ApiError(404, 'Payment record not found — convert lead with advance first');
  }

  const lead = await Lead.findById(leadId);
  if (!lead) throw new ApiError(404, 'Lead not found');

  const totalAmount = Number(body.totalAmount ?? draft.totalAmount) || 0;
  const amountReceived = Number(body.amountReceived ?? draft.amountReceived) || 0;
  const packageMarginPercent = Number(body.packageMarginPercent ?? draft.packageMarginPercent) || 0;
  const totalCost = Number(body.totalCost ?? draft.totalCost) || 0;
  const gstAmount = Number(body.gstAmount ?? draft.gstAmount) || 0;
  const method = ['cash', 'upi', 'card', 'bank_transfer', 'cheque'].includes(body.paymentMethod)
    ? body.paymentMethod
    : payment.method;

  payment.amount = totalAmount;
  payment.paidAmount = amountReceived;
  payment.method = method;
  payment.packageMarginPercent = packageMarginPercent;
  payment.totalCost = totalCost;
  payment.gstAmount = gstAmount;

  // Keep installment history complete so ops payment list shows every receipt.
  payment.installments = payment.installments || [];
  if (amountReceived > 0) {
    const sum = payment.installments.reduce((s, row) => s + (Number(row.amount) || 0), 0);
    if (!payment.installments.length) {
      payment.installments.push({
        amount: amountReceived,
        receivedAt: payment.paidAt || new Date(),
        method,
        reference: '',
        note: 'Advance / Token',
        recordedBy: executiveId,
      });
    } else if (amountReceived > sum + 1) {
      payment.installments[0].amount = Number(payment.installments[0].amount || 0) + (amountReceived - sum);
      payment.installments[0].note = payment.installments[0].note || 'Advance / Token';
    } else if (Math.abs(amountReceived - sum) > 1 && payment.installments.length === 1) {
      payment.installments[0].amount = amountReceived;
      payment.installments[0].method = method;
      payment.installments[0].note = payment.installments[0].note || 'Advance / Token';
    }
  }

  const customSchedule = normalizeCustomInstallments(body.scheduledInstallments, {
    total: totalAmount,
    token: amountReceived,
  });
  payment.scheduledInstallments =
    customSchedule ||
    buildInstallmentSchedule({
      total: totalAmount,
      token: amountReceived,
      travelDate: draft.lead.travelDate,
      returnDate: draft.lead.returnDate,
    });

  payment.status =
    amountReceived <= 0 ? 'pending' : amountReceived >= totalAmount && totalAmount > 0 ? 'paid' : 'partial';
  payment.commercialCompletedAt = new Date();

  // Earliest pending installment becomes payment.dueDate
  const nextDue = (payment.scheduledInstallments || [])
    .filter((r) => r.status === 'pending' && r.dueDate)
    .map((r) => new Date(r.dueDate))
    .filter((d) => Number.isFinite(d.getTime()))
    .sort((a, b) => a - b)[0];
  if (nextDue) payment.dueDate = nextDue;

  if (body.addressProofBase64) {
    const saved = saveAddressProofBase64({
      leadId,
      base64: body.addressProofBase64,
      originalName: body.addressProofName,
    });
    if (saved) {
      payment.addressProofUrl = saved.url;
      payment.addressProofName = saved.name;
    }
  }

  if (body.paymentScreenshotBase64 || (Array.isArray(body.paymentScreenshots) && body.paymentScreenshots.length)) {
    applyPaymentScreenshotsToPayment(
      payment,
      collectPaymentScreenshotUploads(body),
      leadId
    );
  }

  const preferredQuoteId = body.quotationId || body.quoteId || null;
  if (preferredQuoteId) {
    const owned = await Quotation.findOne({ _id: preferredQuoteId, lead: leadId }).select('_id quoteNumber').lean();
    if (!owned) throw new ApiError(400, 'Selected quotation does not belong to this lead');
    payment.quotation = owned._id;
  }

  await payment.save();

  // Keep advance voucher HTML in sync with edited commercial amounts
  try {
    const { generateAndStoreReceipt } = require('./paymentReceiptService');
    const Booking = require('../models/Booking');
    const booking = await Booking.findOne({ lead: leadId }).sort({ createdAt: -1 }).lean();
    const quotation = payment.quotation
      ? await Quotation.findById(payment.quotation).lean()
      : null;
    if (booking && quotation) {
      const { pinQuotationToOpsBooking } = require('./leadConversionService');
      await pinQuotationToOpsBooking(booking, quotation, { _id: executiveId });
    }
    await generateAndStoreReceipt({
      lead,
      payment,
      booking,
      quotation,
      actor: { _id: executiveId, name: 'HindHolidays' },
    });
  } catch (err) {
    console.error('[saveCommercialForm] receipt refresh failed:', err.message);
  }

  if (body.createPaymentReminders !== false) {
    await syncPaymentReminders({
      lead,
      payment,
      user: { _id: executiveId },
      schedule: payment.scheduledInstallments,
    }).catch((err) => {
      console.error('[saveCommercialForm] payment reminders failed:', err.message);
    });
  }

  return getCommercialFormDraft({ leadId, executiveId, branchId });
}

/**
 * Apply a newly received amount against pending scheduled installments (FIFO).
 * Fully covered rows → paid; partial cover reduces remaining amount on that row.
 */
function applyAmountToScheduledInstallments(schedule, amountToApply) {
  let left = Math.max(0, Math.round(Number(amountToApply) || 0));
  const next = (Array.isArray(schedule) ? schedule : []).map((row) => {
    const plain = row?.toObject ? row.toObject() : { ...row };
    return {
      label: plain.label || '',
      percent: Number(plain.percent) || 0,
      amount: Math.max(0, Number(plain.amount) || 0),
      dueDate: plain.dueDate || null,
      status: ['pending', 'paid', 'waived'].includes(plain.status) ? plain.status : 'pending',
    };
  });

  for (const row of next) {
    if (left <= 0) break;
    if (row.status === 'paid' || row.status === 'waived') continue;
    const due = row.amount;
    if (due <= 0) {
      row.status = 'paid';
      continue;
    }
    if (due <= left) {
      row.status = 'paid';
      left -= due;
    } else {
      row.amount = due - left;
      left = 0;
    }
  }
  return next;
}

/**
 * Record an additional client payment on an existing lead payment
 * (amount + optional screenshots). Updates pending installment schedule.
 */
async function recordAdditionalLeadPayment({
  leadId,
  userId,
  branchId,
  body = {},
  requireAssignee = false,
}) {
  const leadFilter = {
    _id: leadId,
    isDeleted: { $ne: true },
    ...(branchId ? { branchId } : {}),
  };
  if (requireAssignee) leadFilter.assignedTo = userId;

  const lead = await Lead.findOne(leadFilter);
  if (!lead) throw new ApiError(404, 'Lead not found');
  if (lead.status !== 'converted' && lead.status !== 'booked') {
    throw new ApiError(400, 'Payment can be added after the lead is booked');
  }

  const payment = await Payment.findOne({ lead: leadId }).sort({ createdAt: -1 });
  if (!payment) {
    throw new ApiError(404, 'Payment record not found — save advance / commercial form first');
  }

  const addAmount = Math.round(Number(body.amount) || 0);
  if (addAmount <= 0) throw new ApiError(400, 'Enter a valid payment amount');

  const packageTotal = Math.max(0, Number(payment.amount) || 0);
  const previousPaid = Math.max(0, Number(payment.paidAmount) || 0);
  const remainingBefore = Math.max(0, packageTotal - previousPaid);
  if (addAmount > remainingBefore + 1) {
    throw new ApiError(
      400,
      `Amount exceeds pending balance (₹${remainingBefore.toLocaleString('en-IN')})`
    );
  }

  const method = ['cash', 'upi', 'card', 'bank_transfer', 'cheque'].includes(body.paymentMethod)
    ? body.paymentMethod
    : payment.method || 'upi';

  const nextPaid =
    packageTotal > 0 ? Math.min(packageTotal, previousPaid + addAmount) : previousPaid + addAmount;
  payment.paidAmount = nextPaid;
  payment.method = method;
  payment.paidAt = body.paidAt ? new Date(body.paidAt) : new Date();
  payment.status =
    packageTotal > 0 && nextPaid >= packageTotal ? 'paid' : nextPaid > 0 ? 'partial' : 'pending';

  payment.installments = payment.installments || [];
  // If token was only on paidAmount (no installment rows), seed it so ledger shows every payment.
  const installmentSum = (payment.installments || []).reduce(
    (sum, row) => sum + (Number(row.amount) || 0),
    0
  );
  if (previousPaid > installmentSum + 1) {
    payment.installments.unshift({
      amount: previousPaid - installmentSum,
      receivedAt: payment.createdAt || payment.paidAt || new Date(),
      method: payment.method || method,
      reference: '',
      note: 'Advance / Token',
      recordedBy: userId,
    });
  }
  payment.installments.push({
    amount: addAmount,
    receivedAt: payment.paidAt,
    method,
    reference: String(body.reference || '').trim(),
    note: String(body.notes || body.note || 'Additional payment').trim() || 'Additional payment',
    recordedBy: userId,
  });

  payment.scheduledInstallments = applyAmountToScheduledInstallments(
    payment.scheduledInstallments,
    addAmount
  );

  const nextDue = (payment.scheduledInstallments || [])
    .filter((r) => r.status === 'pending' && r.dueDate)
    .map((r) => new Date(r.dueDate))
    .filter((d) => Number.isFinite(d.getTime()))
    .sort((a, b) => a - b)[0];
  if (nextDue) payment.dueDate = nextDue;

  if (body.paymentScreenshotBase64 || (Array.isArray(body.paymentScreenshots) && body.paymentScreenshots.length)) {
    applyPaymentScreenshotsToPayment(payment, collectPaymentScreenshotUploads(body), leadId);
  }

  await payment.save();

  // Keep ops booking totals in sync
  try {
    const { createBookingFromPayment } = require('./operationsService');
    await createBookingFromPayment(payment._id, { _id: userId });
  } catch (err) {
    console.error('[recordAdditionalLeadPayment] booking sync failed:', err.message);
  }

  try {
    const { generateAndStoreReceipt } = require('./paymentReceiptService');
    const Booking = require('../models/Booking');
    const booking = await Booking.findOne({ lead: leadId }).sort({ createdAt: -1 }).lean();
    const quotation = payment.quotation
      ? await Quotation.findById(payment.quotation).lean()
      : null;
    await generateAndStoreReceipt({
      lead,
      payment,
      booking,
      quotation,
      actor: { _id: userId, name: 'HindHolidays' },
    });
  } catch (err) {
    console.error('[recordAdditionalLeadPayment] receipt refresh failed:', err.message);
  }

  await syncPaymentReminders({
    lead,
    payment,
    user: { _id: userId },
    schedule: payment.scheduledInstallments,
  }).catch((err) => {
    console.error('[recordAdditionalLeadPayment] reminders failed:', err.message);
  });

  const { getLeadPaymentSummary } = require('./paymentReceiptService');
  const paymentSummary = await getLeadPaymentSummary(leadId);
  return {
    paymentId: payment._id,
    amountAdded: addAmount,
    paidAmount: payment.paidAmount,
    totalAmount: payment.amount,
    balanceDue: Math.max(0, Number(payment.amount || 0) - Number(payment.paidAmount || 0)),
    status: payment.status,
    paymentSummary,
  };
}

module.exports = {
  buildInstallmentSchedule,
  normalizeCustomInstallments,
  getCommercialFormDraft,
  saveCommercialForm,
  recordAdditionalLeadPayment,
  applyAmountToScheduledInstallments,
  syncPaymentReminders,
  savePaymentScreenshotBase64,
  saveAddressProofBase64,
  collectPaymentScreenshotUploads,
  applyPaymentScreenshotsToPayment,
  listPaymentScreenshots,
};
