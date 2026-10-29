const Lead = require('../models/Lead');
const EmailTemplate = require('../models/EmailTemplate');
const EmailLog = require('../models/EmailLog');
const EmailReply = require('../models/EmailReply');
const ApiError = require('../utils/apiError');
const { getLeaderLeadScopeFilter } = require('./teamScopeService');
const { invalidateMailboxCache } = require('./emailMailboxCache');
const { isEmailConfigured, normalizeRecipients } = require('./emailService');
const { enqueueEmailJob } = require('./emailQueueService');
const { renderEmailTemplate } = require('./emailTemplateService');
const { wrapEmailHtml } = require('../utils/emailHtmlLayout');

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

  if (req.user.role === 'team_leader') {
    const squadFilter = await getLeaderLeadScopeFilter(req.user._id);
    const inScope = await Lead.exists({
      _id: leadId,
      ...squadFilter,
      ...(req.branchId ? { branchId: req.branchId } : {}),
    });
    if (!inScope) throw new ApiError(403, 'Lead is outside your team');
  }

  return lead;
}

function formatAmount(amount) {
  if (amount == null || amount === '') return '';
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

function formatTravelDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function buildClientEmailHtml(bodyText, { lead, category, subject, payload, user }) {
  return wrapEmailHtml(bodyText, {
    subject,
    category,
    customerName: lead.name,
    destination: lead.destination,
    quotationNumber: payload.quotationNumber,
    amount: formatAmount(payload.amount ?? lead.budget),
    travelDate: formatTravelDate(lead.travelDate),
    executiveName: user?.name || 'HindHolidays Sales Team',
  });
}

async function queueLeadEmail({ req, leadId, payload }) {
  if (!isEmailConfigured()) {
    throw new ApiError(503, 'Email service is not configured. Contact your administrator.');
  }

  const lead = await assertCanAccessLead(req, leadId);
  const {
    to,
    cc,
    bcc,
    subject,
    message,
    html,
    category = 'custom',
    templateId,
    quotationId,
    attachments = [],
  } = payload;

  let resolvedSubject = subject?.trim() || '';
  let resolvedBody = message?.trim() || html?.trim() || '';

  if (templateId) {
    const template = await EmailTemplate.findOne({
      _id: templateId,
      enabled: true,
      ...(req.branchId ? { branchId: req.branchId } : {}),
    }).lean();
    if (!template) throw new ApiError(404, 'Email template not found');

    const context = {
      customerName: lead.name,
      destination: lead.destination,
      travelDate: lead.travelDate,
      executiveName: req.user.name,
      quotationNumber: payload.quotationNumber,
      amount: payload.amount ?? lead.budget,
    };
    if (!resolvedSubject) resolvedSubject = renderEmailTemplate(template.subject, context);
    if (!resolvedBody) resolvedBody = renderEmailTemplate(template.body, context);
  }

  if (!resolvedSubject) throw new ApiError(400, 'Subject is required');
  if (!resolvedBody) throw new ApiError(400, 'Message is required');

  const recipients = normalizeRecipients(to || lead.email);
  if (!recipients.length) throw new ApiError(400, 'Recipient email is required');

  const attachmentNames = (attachments || []).map((a) => a.filename).filter(Boolean);

  const log = await EmailLog.create({
    leadId: lead._id,
    quotationId: quotationId || null,
    branchId: lead.branchId || req.branchId || null,
    category,
    to: recipients,
    cc: normalizeRecipients(cc),
    bcc: normalizeRecipients(bcc),
    subject: resolvedSubject,
    status: 'queued',
    sentBy: req.user._id,
    sentByName: req.user.name,
    attachmentNames,
    bodyText: resolvedBody.slice(0, 50000),
    templateId: templateId || null,
  });

  invalidateMailboxCache().catch(() => {});

  enqueueEmailJob({
    logId: log._id,
    leadId: lead._id,
    branchId: lead.branchId,
    category,
    to: recipients,
    cc: normalizeRecipients(cc),
    bcc: normalizeRecipients(bcc),
    subject: resolvedSubject,
    html: html || buildClientEmailHtml(resolvedBody, {
      lead,
      category,
      subject: resolvedSubject,
      payload,
      user: req.user,
    }),
    text: resolvedBody,
    attachments,
    actor: req.user,
  });

  return {
    emailLogId: log._id,
    status: 'queued',
    subject: resolvedSubject,
    to: recipients,
  };
}

async function getLeadEmailHistory(leadId, { branchId, limit = 30 } = {}) {
  const cap = Math.min(limit, 50);
  const filter = { leadId, ...(branchId ? { branchId } : {}) };

  const [sentRows, replyRows] = await Promise.all([
    EmailLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(cap)
      .select('to cc bcc subject status sentByName sentAt createdAt category errorMessage attachmentNames')
      .lean(),
    EmailReply.find(filter)
      .sort({ receivedAt: -1 })
      .limit(cap)
      .select('fromEmail fromName subject snippet receivedAt emailLogId')
      .lean(),
  ]);

  const sent = sentRows.map((row) => ({
    _id: row._id,
    direction: 'outbound',
    to: row.to,
    cc: row.cc,
    bcc: row.bcc,
    subject: row.subject,
    status: row.status,
    sentBy: row.sentByName,
    sentAt: row.sentAt || row.createdAt,
    category: row.category,
    errorMessage: row.errorMessage,
    attachments: row.attachmentNames,
    replies: replyRows
      .filter((r) => String(r.emailLogId) === String(row._id))
      .map((r) => ({
        _id: r._id,
        fromEmail: r.fromEmail,
        fromName: r.fromName,
        subject: r.subject,
        snippet: r.snippet,
        receivedAt: r.receivedAt,
      })),
  }));

  const orphanReplies = replyRows
    .filter((r) => !r.emailLogId || !sentRows.some((s) => String(s._id) === String(r.emailLogId)))
    .map((r) => ({
      _id: r._id,
      direction: 'inbound',
      fromEmail: r.fromEmail,
      fromName: r.fromName,
      subject: r.subject,
      snippet: r.snippet,
      status: 'received',
      sentAt: r.receivedAt,
      sentBy: r.fromName || r.fromEmail,
    }));

  return [...sent, ...orphanReplies].sort(
    (a, b) => new Date(b.sentAt) - new Date(a.sentAt)
  );
}

module.exports = { queueLeadEmail, getLeadEmailHistory, assertCanAccessLead };
