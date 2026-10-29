const EmailLog = require('../models/EmailLog');
const EmailReply = require('../models/EmailReply');
const Lead = require('../models/Lead');
const { withBranch } = require('../utils/branchScope');
const { getLeaderLeadScopeFilter } = require('./teamScopeService');
const {
  cacheService,
  MAILBOX_COUNTS_TTL_MS,
  MAILBOX_SCOPE_TTL_MS,
  mailboxCountsKey,
  mailboxScopeKey,
  invalidateMailboxCache,
} = require('./emailMailboxCache');

const CRM_MAIL = (process.env.SMTP_USER || 'info@hindholidays.com').toLowerCase();

const REPLY_LIST_SELECT =
  'fromEmail fromName subject snippet receivedAt leadId emailLogId createdAt';
const SENT_LIST_SELECT =
  'to subject sentBy sentByName from sentAt createdAt status category attachmentNames leadId errorMessage';

function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getExecutiveLeadIds(userId, branchId) {
  return Lead.find(withBranch({ assignedTo: userId }, branchId)).distinct('_id');
}

async function getLeaderScopeLeadIds(leaderId, branchId) {
  const squadFilter = await getLeaderLeadScopeFilter(leaderId);
  return Lead.find(withBranch(squadFilter, branchId)).distinct('_id');
}

async function resolveScopedLeadIds(req) {
  if (req.user.role === 'sales_executive') {
    const key = mailboxScopeKey(req.user._id, req.branchId, 'sales_executive');
    return cacheService.getOrSet(
      key,
      () => getExecutiveLeadIds(req.user._id, req.branchId),
      MAILBOX_SCOPE_TTL_MS
    );
  }
  if (req.user.role === 'team_leader') {
    const key = mailboxScopeKey(req.user._id, req.branchId, 'team_leader');
    return cacheService.getOrSet(
      key,
      () => getLeaderScopeLeadIds(req.user._id, req.branchId),
      MAILBOX_SCOPE_TTL_MS
    );
  }
  return null;
}

function buildLeadScopeClause(scopedLeadIds) {
  if (!scopedLeadIds) return {};
  if (!scopedLeadIds.length) return { leadId: null };
  return { leadId: { $in: scopedLeadIds } };
}

function resolveExecutiveFromLead(lead) {
  const assignee = lead?.assignedTo;
  if (assignee && typeof assignee === 'object') {
    return {
      executiveId: assignee._id ? String(assignee._id) : null,
      executiveName: assignee.name || '',
    };
  }
  return {
    executiveId: assignee ? String(assignee) : null,
    executiveName: '',
  };
}

function mapSentRow(row, leadMap) {
  const lead = leadMap.get(String(row.leadId));
  const toEmail = row.to?.[0] || '';
  return {
    id: String(row._id),
    type: 'sent',
    folder: row.status === 'failed' ? 'failed' : 'sent',
    mailAction: 'sent',
    executiveId: row.sentBy ? String(row.sentBy) : null,
    executiveName: row.sentByName || '',
    from: { name: row.sentByName || 'HindHolidays', email: row.from || CRM_MAIL },
    to: row.to || [],
    subject: row.subject,
    snippet: row.status === 'failed'
      ? row.errorMessage || 'Delivery failed'
      : `Sent to ${toEmail}${row.attachmentNames?.length ? ` · ${row.attachmentNames.length} attachment(s)` : ''}`,
    date: row.sentAt || row.createdAt,
    isRead: true,
    starred: false,
    hasAttachment: (row.attachmentNames || []).length > 0,
    status: row.status,
    category: row.category,
    leadId: row.leadId,
    leadName: lead?.name || toEmail,
    leadDestination: lead?.destination || '',
  };
}

function mapInboundRow(row, leadMap) {
  const lead = leadMap.get(String(row.leadId));
  const executive = resolveExecutiveFromLead(lead);
  return {
    id: String(row._id),
    type: 'inbound',
    folder: 'inbox',
    mailAction: 'reply',
    executiveId: executive.executiveId,
    executiveName: executive.executiveName,
    from: { name: row.fromName || row.fromEmail, email: row.fromEmail },
    to: [CRM_MAIL],
    subject: row.subject || '(No subject)',
    snippet: row.snippet || '',
    date: row.receivedAt || row.createdAt,
    isRead: false,
    starred: false,
    hasAttachment: false,
    status: 'received',
    category: 'reply',
    leadId: row.leadId,
    leadName: lead?.name || row.fromName || row.fromEmail,
    leadDestination: lead?.destination || '',
    emailLogId: row.emailLogId,
  };
}

async function fetchLeadMap(ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  const leads = await Lead.find({ _id: { $in: unique } })
    .select('name destination email assignedTo')
    .populate('assignedTo', 'name')
    .lean();
  return new Map(leads.map((l) => [String(l._id), l]));
}

function matchesSearch(item, q) {
  if (!q) return true;
  const hay = [
    item.subject,
    item.snippet,
    item.from?.name,
    item.from?.email,
    item.leadName,
    item.leadDestination,
    item.executiveName,
    ...(item.to || []),
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function prefetchForSearch(pageSize) {
  return Math.max(pageSize * 2, 40);
}

function applySearchFilters(replyFilter, sentFilter, searchRegex) {
  if (!searchRegex) return;
  replyFilter.$or = [
    { subject: searchRegex },
    { snippet: searchRegex },
    { fromEmail: searchRegex },
    { fromName: searchRegex },
  ];
  sentFilter.$or = [
    { subject: searchRegex },
    { sentByName: searchRegex },
    { to: searchRegex },
    { errorMessage: searchRegex },
    { from: searchRegex },
  ];
}

async function fetchMailboxCounts(req, replyFilter, sentFilter) {
  const key = mailboxCountsKey(req.user._id, req.branchId, req.user.role);
  return cacheService.getOrSet(
    key,
    () =>
      Promise.all([
        EmailLog.countDocuments({ ...sentFilter, status: 'sent' }),
        EmailLog.countDocuments({ ...sentFilter, status: 'failed' }),
        EmailReply.countDocuments(replyFilter),
      ]).then(([sentTotal, failedTotal, inboxTotal]) => ({
        inbox: inboxTotal,
        sent: sentTotal,
        failed: failedTotal,
        all: inboxTotal + sentTotal + failedTotal,
      })),
    MAILBOX_COUNTS_TTL_MS
  );
}

async function listMailboxMessages(req, { folder = 'inbox', search = '', page = 1, limit = 50 } = {}) {
  const branchFilter = withBranch({}, req.branchId);
  const scopedLeadIds = await resolveScopedLeadIds(req);
  const leadScope = buildLeadScopeClause(scopedLeadIds);
  const sentScope =
    req.user.role === 'sales_executive' ? { sentBy: req.user._id, ...branchFilter } : { ...branchFilter };

  const searchRegex = search.trim()
    ? new RegExp(escapeRegex(search.trim()), 'i')
    : null;

  // Counts must ignore search filters (cache key has no search)
  const countReplyFilter = { ...branchFilter, ...leadScope };
  const countSentFilter = { ...sentScope, ...leadScope };

  const replyFilter = { ...branchFilter, ...leadScope };
  const sentFilter = { ...sentScope, ...leadScope };
  applySearchFilters(replyFilter, sentFilter, searchRegex);

  const safePage = Math.max(1, page);
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const skip = (safePage - 1) * safeLimit;

  async function fetchFolderItems() {
    if (folder === 'inbox') {
      const replies = await EmailReply.find(replyFilter)
        .select(REPLY_LIST_SELECT)
        .sort({ receivedAt: -1 })
        .skip(searchRegex ? 0 : skip)
        .limit(searchRegex ? Math.min(prefetchForSearch(safeLimit), 200) : safeLimit)
        .lean();
      const leadMap = await fetchLeadMap(replies.map((r) => r.leadId));
      let rows = replies.map((r) => mapInboundRow(r, leadMap));
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        rows = rows.filter((item) => matchesSearch(item, q));
        return rows.slice(skip, skip + safeLimit);
      }
      return rows;
    }

    if (folder === 'sent') {
      const sentRows = await EmailLog.find({ ...sentFilter, status: 'sent' })
        .select(SENT_LIST_SELECT)
        .sort({ sentAt: -1 })
        .skip(searchRegex ? 0 : skip)
        .limit(searchRegex ? Math.min(prefetchForSearch(safeLimit), 200) : safeLimit)
        .lean();
      const leadMap = await fetchLeadMap(sentRows.map((r) => r.leadId));
      let rows = sentRows.map((r) => mapSentRow(r, leadMap));
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        rows = rows.filter((item) => matchesSearch(item, q));
        return rows.slice(skip, skip + safeLimit);
      }
      return rows;
    }

    if (folder === 'failed') {
      const failedRows = await EmailLog.find({ ...sentFilter, status: 'failed' })
        .select(SENT_LIST_SELECT)
        .sort({ createdAt: -1 })
        .skip(searchRegex ? 0 : skip)
        .limit(searchRegex ? Math.min(prefetchForSearch(safeLimit), 200) : safeLimit)
        .lean();
      const leadMap = await fetchLeadMap(failedRows.map((r) => r.leadId));
      let rows = failedRows.map((r) => mapSentRow(r, leadMap));
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        rows = rows.filter((item) => matchesSearch(item, q));
        return rows.slice(skip, skip + safeLimit);
      }
      return rows;
    }

    if (folder === 'all') {
      const perSource = Math.min(safeLimit + skip, 60);
      const [replies, sentRows, failedRows] = await Promise.all([
        EmailReply.find(replyFilter)
          .select(REPLY_LIST_SELECT)
          .sort({ receivedAt: -1 })
          .limit(perSource)
          .lean(),
        EmailLog.find({ ...sentFilter, status: 'sent' })
          .select(SENT_LIST_SELECT)
          .sort({ sentAt: -1 })
          .limit(perSource)
          .lean(),
        EmailLog.find({ ...sentFilter, status: 'failed' })
          .select(SENT_LIST_SELECT)
          .sort({ createdAt: -1 })
          .limit(perSource)
          .lean(),
      ]);
      const leadMap = await fetchLeadMap([
        ...replies.map((r) => r.leadId),
        ...sentRows.map((r) => r.leadId),
        ...failedRows.map((r) => r.leadId),
      ]);
      let merged = [
        ...replies.map((r) => mapInboundRow(r, leadMap)),
        ...sentRows.map((r) => mapSentRow(r, leadMap)),
        ...failedRows.map((r) => mapSentRow(r, leadMap)),
      ];
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        merged = merged.filter((item) => matchesSearch(item, q));
      }
      merged.sort((a, b) => new Date(b.date) - new Date(a.date));
      return merged.slice(skip, skip + safeLimit);
    }

    return [];
  }

  const totalByFolder = {
    inbox: 'inbox',
    sent: 'sent',
    failed: 'failed',
    all: 'all',
  };

  const [counts, items] = await Promise.all([
    fetchMailboxCounts(req, countReplyFilter, countSentFilter),
    fetchFolderItems(),
  ]);

  const totalKey = totalByFolder[folder] || 'inbox';

  return {
    items,
    total: counts[totalKey] ?? 0,
    page: safePage,
    limit: safeLimit,
    counts,
    mailbox: CRM_MAIL,
    showExecutive: ['team_leader', 'sales_manager', 'admin'].includes(req.user.role),
  };
}

async function assertMessageAccess(req, leadId) {
  const ApiError = require('../utils/apiError');
  if (!leadId) return;
  if (['admin', 'sales_manager'].includes(req.user.role)) return;

  const branchClause = req.branchId ? { branchId: req.branchId } : {};

  if (req.user.role === 'sales_executive') {
    const allowed = await Lead.exists({ _id: leadId, assignedTo: req.user._id, ...branchClause });
    if (!allowed) throw new ApiError(403, 'You do not have access to this message');
    return;
  }

  if (req.user.role === 'team_leader') {
    const squadFilter = await getLeaderLeadScopeFilter(req.user._id);
    const allowed = await Lead.exists({
      _id: leadId,
      ...squadFilter,
      ...branchClause,
    });
    if (!allowed) throw new ApiError(403, 'You do not have access to this message');
  }
}

async function getMailboxMessage(req, { type, id }) {
  const ApiError = require('../utils/apiError');
  const branchFilter = withBranch({}, req.branchId);

  if (type === 'inbound') {
    const row = await EmailReply.findOne({ _id: id, ...branchFilter })
      .select(`${REPLY_LIST_SELECT} bodyText bodyHtml`)
      .lean();
    if (!row) throw new ApiError(404, 'Message not found');
    await assertMessageAccess(req, row.leadId);

    const leadMap = await fetchLeadMap([row.leadId]);
    const item = mapInboundRow(row, leadMap);
    return {
      ...item,
      bodyText: row.bodyText || row.snippet || '',
      bodyHtml: row.bodyHtml || '',
      cc: [],
      bcc: [],
    };
  }

  if (type === 'sent') {
    const row = await EmailLog.findOne({
      _id: id,
      ...branchFilter,
      status: { $in: ['sent', 'failed', 'queued'] },
    })
      .select(`${SENT_LIST_SELECT} bodyText cc bcc`)
      .lean();
    if (!row) throw new ApiError(404, 'Message not found');
    await assertMessageAccess(req, row.leadId);

    const leadMap = await fetchLeadMap([row.leadId]);
    const item = mapSentRow(row, leadMap);
    return {
      ...item,
      bodyText: row.bodyText || item.snippet || '',
      bodyHtml: '',
      cc: row.cc || [],
      bcc: row.bcc || [],
      attachmentNames: row.attachmentNames || [],
      errorMessage: row.errorMessage || '',
    };
  }

  throw new ApiError(400, 'Invalid message type');
}

module.exports = { listMailboxMessages, getMailboxMessage, invalidateMailboxCache };
