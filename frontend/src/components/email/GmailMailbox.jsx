import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  Inbox,
  Send,
  Star,
  AlertCircle,
  Mail,
  Search,
  RefreshCw,
  Paperclip,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  ExternalLink,
  PenSquare,
  User,
} from 'lucide-react';
import { fetchMailbox, fetchMailboxMessage, syncEmailReplies } from '../../services/emailApi';
import GmailComposeLeadPicker from './GmailComposeLeadPicker';

const PAGE_SIZE = 50;
const STARRED_STORAGE_KEY = 'crm-mailbox-starred';

function loadStarredIds() {
  try {
    const raw = localStorage.getItem(STARRED_STORAGE_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

const FOLDERS = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'starred', label: 'Starred', icon: Star },
  { id: 'sent', label: 'Sent', icon: Send },
  { id: 'failed', label: 'Failed', icon: AlertCircle },
  { id: 'all', label: 'All Mail', icon: Mail },
];

function formatGmailDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function avatarColor(email = '') {
  const hues = ['#1a73e8', '#188038', '#e37400', '#9334e6', '#d93025', '#007b83'];
  let hash = 0;
  for (let i = 0; i < email.length; i += 1) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return hues[Math.abs(hash) % hues.length];
}

function initials(name = '', email = '') {
  const src = name || email;
  const parts = src.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}

function ExecutiveBadge({ name, action, compact = false }) {
  if (!name) return null;
  const color = avatarColor(name);
  const isReply = action === 'reply';
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-0.5 rounded font-semibold ${
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'
      }`}
      style={{ backgroundColor: `${color}18`, color, border: `1px solid ${color}40` }}
      title={isReply ? `Reply on ${name}'s lead` : `Sent by ${name}`}
    >
      <User className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      {isReply ? 'Reply' : 'Sent'}
      <span className="font-bold truncate max-w-[72px]">{name.split(' ')[0]}</span>
    </span>
  );
}

function useLeadPathPrefix() {
  const { pathname } = useLocation();
  return useMemo(() => {
    if (pathname.includes('/sales-executive')) return '/sales-executive/leads';
    if (pathname.includes('/sales-manager')) return '/sales-manager/leads';
    if (pathname.includes('/team-leader')) return '/team-leader/leads';
    return '/leads';
  }, [pathname]);
}

export default function GmailMailbox() {
  const leadPathPrefix = useLeadPathPrefix();
  const [folder, setFolder] = useState('inbox');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [starred, setStarred] = useState(loadStarredIds);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [messageBody, setMessageBody] = useState(null);
  const [bodyLoading, setBodyLoading] = useState(false);
  const [data, setData] = useState({ items: [], counts: {}, mailbox: 'info@hindholidays.com' });

  const load = useCallback(() => {
    setLoading(true);
    const apiFolder = folder === 'starred' ? 'all' : folder;
    fetchMailbox({
      folder: apiFolder,
      search: query,
      page: folder === 'starred' ? 1 : page,
      limit: folder === 'starred' ? 200 : PAGE_SIZE,
    })
      .then(setData)
      .catch(() => setData({ items: [], counts: {}, mailbox: 'info@hindholidays.com', total: 0 }))
      .finally(() => setLoading(false));
  }, [folder, query, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    localStorage.setItem(STARRED_STORAGE_KEY, JSON.stringify([...starred]));
  }, [starred]);

  const items = useMemo(() => {
    let rows = data.items || [];
    if (folder === 'starred') rows = rows.filter((m) => starred.has(m.id));
    return rows;
  }, [data.items, folder, starred]);

  const selected = items.find((m) => m.id === selectedId) || null;

  useEffect(() => {
    if (!selected) {
      setMessageBody(null);
      return;
    }

    setBodyLoading(true);
    fetchMailboxMessage(selected.type, selected.id)
      .then(setMessageBody)
      .catch(() => setMessageBody(null))
      .finally(() => setBodyLoading(false));
  }, [selected?.id, selected?.type]);

  const toggleStar = (id, e) => {
    e?.stopPropagation();
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncEmailReplies({ silent: false });
      load();
    } finally {
      setSyncing(false);
    }
  };

  const folderCount = (id) => {
    if (id === 'starred') return starred.size;
    return data.counts?.[id] ?? 0;
  };

  const showExecutive = data.showExecutive === true;
  const totalMessages = folder === 'starred' ? items.length : (data.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalMessages / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rangeStart = totalMessages === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = folder === 'starred'
    ? items.length
    : Math.min(safePage * PAGE_SIZE, totalMessages);
  const canPaginate = folder !== 'starred' && totalMessages > PAGE_SIZE;

  return (
    <div className="h-full flex flex-col bg-[#f6f8fc] text-[#202124] text-[13px] leading-tight overflow-hidden rounded-lg border border-[#dadce0]">
      {/* Top bar */}
      <div className="shrink-0 flex items-center gap-1.5 px-2 py-1 bg-[#f6f8fc] border-b border-[#dadce0]/80">
        <button
          type="button"
          className="lg:hidden p-1 rounded-full hover:bg-[#e8eaed]"
          onClick={() => setMobileSidebar((v) => !v)}
        >
          <Menu className="w-4 h-4 text-[#5f6368]" />
        </button>
        <div className="flex items-center gap-1.5 min-w-[90px]">
          <Mail className="w-5 h-5 text-[#ea4335]" />
          <span className="text-[15px] text-[#5f6368] font-normal hidden sm:inline">Mail</span>
        </div>
        <div className="flex-1 max-w-2xl mx-auto">
          <div className="flex items-center bg-[#eaf1fb] hover:bg-[#e8f0fe] focus-within:bg-white focus-within:shadow-sm rounded-full px-3 h-8 transition-all border border-transparent focus-within:border-[#dadce0]">
            <Search className="w-3.5 h-3.5 text-[#5f6368] shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setQuery(search.trim());
                  setPage(1);
                  setSelectedId(null);
                }
              }}
              placeholder="Search mail"
              className="flex-1 bg-transparent border-0 outline-none text-[12px] px-2 text-[#202124] placeholder:text-[#5f6368]"
            />
            {search && (
              <button type="button" onClick={() => { setSearch(''); setQuery(''); setPage(1); setSelectedId(null); }} className="p-0.5 rounded-full hover:bg-[#dadce0]/50">
                <X className="w-3 h-3 text-[#5f6368]" />
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="p-1.5 rounded-full hover:bg-[#e8eaed] text-[#5f6368]"
          title="Sync inbox"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex flex-1 min-h-0 relative">
        {/* Sidebar */}
        <aside
          className={`${
            mobileSidebar ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0 absolute lg:relative z-20 lg:z-auto w-[188px] shrink-0 h-full bg-[#f6f8fc] border-r border-[#dadce0]/60 flex flex-col transition-transform duration-200`}
        >
          <div className="px-2 py-2">
            <button
              type="button"
              onClick={() => setComposeOpen(true)}
              className="flex items-center gap-2 w-full px-4 py-2 rounded-2xl bg-[#c2e7ff] hover:shadow-sm text-[#001d35] font-medium text-[12px] transition-shadow"
            >
              <PenSquare className="w-4 h-4" />
              Compose
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-1">
            {FOLDERS.map(({ id, label, icon: Icon }) => {
              const active = folder === id;
              const count = folderCount(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setFolder(id);
                    setPage(1);
                    setSelectedId(null);
                    setMobileSidebar(false);
                  }}
                  className={`w-full flex items-center gap-2.5 pl-3 pr-2 py-1 rounded-r-full text-[12px] transition-colors ${
                    active
                      ? 'bg-[#d3e3fd] text-[#001d35] font-semibold'
                      : 'text-[#202124] hover:bg-[#e8eaed]'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#001d35]' : 'text-[#5f6368]'}`} />
                  <span className="flex-1 text-left truncate">{label}</span>
                  {count > 0 && (
                    <span className={`text-[10px] tabular-nums ${active ? 'text-[#001d35]' : 'text-[#5f6368]'}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="px-2 py-2 border-t border-[#dadce0]/60">
            <p className="text-[10px] font-semibold text-[#5f6368] uppercase tracking-wide">Account</p>
            <p className="text-[11px] text-[#5f6368] truncate mt-0.5">{data.mailbox}</p>
          </div>
        </aside>

        {mobileSidebar && (
          <button
            type="button"
            className="lg:hidden fixed inset-0 bg-black/30 z-10"
            onClick={() => setMobileSidebar(false)}
            aria-label="Close sidebar"
          />
        )}

        {/* List + reading pane */}
        <div className="flex flex-1 min-w-0 min-h-0 bg-white">
          {/* Message list */}
          <div
            className={`${
              selected ? 'hidden md:flex' : 'flex'
            } flex-col min-h-0 ${
              selected
                ? 'w-full md:w-[280px] lg:w-[300px] shrink-0 border-r border-[#dadce0]/80'
                : 'w-full flex-1'
            }`}
          >
            <div className="shrink-0 flex items-center justify-between px-2 py-1 border-b border-[#dadce0]/60 text-[11px] text-[#5f6368]">
              <span>
                {loading
                  ? 'Loading…'
                  : totalMessages === 0
                    ? 'No messages'
                    : `${rangeStart}–${rangeEnd} of ${totalMessages}`}
              </span>
              {canPaginate && (
                <div className="flex items-center">
                  <button
                    type="button"
                    disabled={safePage <= 1 || loading}
                    onClick={() => { setPage((p) => Math.max(1, p - 1)); setSelectedId(null); }}
                    className="p-1 rounded hover:bg-[#f1f3f4] disabled:opacity-40 disabled:pointer-events-none"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= totalPages || loading}
                    onClick={() => { setPage((p) => p + 1); setSelectedId(null); }}
                    className="p-1 rounded hover:bg-[#f1f3f4] disabled:opacity-40 disabled:pointer-events-none"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {!loading && items.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center p-4 text-[#5f6368]">
                  <Inbox className="w-10 h-10 mb-2 opacity-30" />
                  <p className="text-[13px]">No messages</p>
                  <p className="text-[11px] mt-0.5">Your {folder} is empty</p>
                </div>
              )}

              {items.map((msg) => {
                const isSelected = selectedId === msg.id;
                const isStarred = starred.has(msg.id);
                const sender = msg.type === 'inbound' ? msg.from?.name || msg.from?.email : msg.to?.[0] || msg.leadName;
                const senderEmail = msg.type === 'inbound' ? msg.from?.email : msg.to?.[0];
                const unread = msg.type === 'inbound' && !msg.isRead;

                return (
                  <div
                    key={msg.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(msg.id)}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedId(msg.id)}
                    className={`w-full text-left flex items-center gap-2 px-2 py-1.5 border-b border-[#f1f3f4] cursor-pointer ${
                      isSelected ? 'bg-[#c2dbff]' : unread ? 'bg-[#f2f6fc]' : 'hover:bg-[#f5f5f5]'
                    }`}
                  >
                    <div
                      className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-[10px] font-semibold"
                      style={{ backgroundColor: avatarColor(senderEmail) }}
                    >
                      {initials(sender, senderEmail)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 min-w-0">
                        {showExecutive && (
                          <ExecutiveBadge name={msg.executiveName} action={msg.mailAction} compact />
                        )}
                        <span className={`truncate text-[12px] ${unread ? 'font-bold' : 'font-medium'}`}>
                          {sender}
                        </span>
                        <span className="ml-auto shrink-0 text-[10px] text-[#5f6368] tabular-nums">
                          {formatGmailDate(msg.date)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 min-w-0">
                        <span className={`truncate text-[11px] ${unread ? 'font-semibold text-[#202124]' : 'text-[#5f6368]'}`}>
                          {msg.subject}
                        </span>
                        {msg.hasAttachment && <Paperclip className="w-3 h-3 text-[#5f6368] shrink-0" />}
                        <span className="truncate text-[11px] text-[#5f6368] hidden xl:inline"> — {msg.snippet}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => toggleStar(msg.id, e)}
                      className="shrink-0 p-0.5"
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${isStarred ? 'fill-[#f4b400] text-[#f4b400]' : 'text-[#dadce0] hover:text-[#5f6368]'}`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reading pane — only after clicking a mail */}
          <div className={`${selected ? 'flex' : 'hidden'} flex-col flex-1 min-w-0 min-h-0`}>
            {selected && (
              <>
                <div className="shrink-0 flex items-center gap-1 px-2 py-1 border-b border-[#dadce0]/60 bg-white md:hidden">
                  <button type="button" onClick={() => setSelectedId(null)} className="p-1 rounded-full hover:bg-[#f1f3f4]">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[12px] font-medium truncate">{selected.subject}</span>
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-2 md:px-4 md:py-3">
                  {showExecutive && selected.executiveName && (
                    <div
                      className="mb-2 flex items-center gap-2 px-2.5 py-1.5 rounded-md border"
                      style={{
                        backgroundColor: `${avatarColor(selected.executiveName)}12`,
                        borderColor: `${avatarColor(selected.executiveName)}35`,
                      }}
                    >
                      <ExecutiveBadge name={selected.executiveName} action={selected.mailAction} />
                      <span className="text-[11px] text-[#5f6368] truncate">
                        {selected.mailAction === 'reply'
                          ? `Client replied on ${selected.executiveName}'s lead`
                          : `${selected.executiveName} sent this email`}
                      </span>
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h1 className="text-[15px] font-normal text-[#202124] leading-snug flex-1 min-w-0">
                      {selected.subject}
                    </h1>
                    <button type="button" onClick={(e) => toggleStar(selected.id, e)} className="p-1 shrink-0">
                      <Star className={`w-4 h-4 ${starred.has(selected.id) ? 'fill-[#f4b400] text-[#f4b400]' : 'text-[#dadce0]'}`} />
                    </button>
                  </div>

                  <div className="flex items-start gap-2 mb-3 pb-2 border-b border-[#f1f3f4]">
                    <div
                      className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-white text-[10px] font-semibold"
                      style={{ backgroundColor: avatarColor(selected.from?.email) }}
                    >
                      {initials(selected.from?.name, selected.from?.email)}
                    </div>
                    <div className="min-w-0 flex-1 text-[11px] leading-snug">
                      <div className="flex flex-wrap items-baseline gap-x-1.5">
                        <span className="font-semibold text-[#202124]">
                          {selected.type === 'inbound' ? selected.from?.name : 'HindHolidays Sales'}
                        </span>
                        <span className="text-[#5f6368] truncate">
                          &lt;{selected.type === 'inbound' ? selected.from?.email : selected.from?.email}&gt;
                        </span>
                      </div>
                      <div className="text-[#5f6368]">
                        to {selected.type === 'inbound' ? 'me' : (selected.to || []).join(', ')}
                        {' · '}
                        {new Date(selected.date).toLocaleString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="text-[12px] text-[#202124] leading-relaxed">
                    {bodyLoading && (
                      <p className="text-[11px] text-[#5f6368]">Loading message…</p>
                    )}

                    {!bodyLoading && messageBody?.bodyHtml && (
                      <iframe
                        title="Email body"
                        srcDoc={messageBody.bodyHtml}
                        className="w-full min-h-[240px] border border-[#dadce0]/60 rounded bg-white"
                        sandbox=""
                      />
                    )}

                    {!bodyLoading && !messageBody?.bodyHtml && (messageBody?.bodyText || selected.snippet) && (
                      <div className="whitespace-pre-wrap text-[12px]">{messageBody?.bodyText || selected.snippet}</div>
                    )}

                    {!bodyLoading && !messageBody?.bodyHtml && !messageBody?.bodyText && !selected.snippet && (
                      <p className="text-[11px] text-[#5f6368]">No message content available.</p>
                    )}
                  </div>

                  {selected.type === 'sent' && !messageBody?.bodyText && (
                    <p className="mt-2 text-[10px] text-[#5f6368] italic">
                      Full message body is not stored for older sent emails.
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-1.5 pt-2 border-t border-[#f1f3f4]">
                    {showExecutive && selected.executiveName && (
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                        style={{
                          backgroundColor: `${avatarColor(selected.executiveName)}18`,
                          color: avatarColor(selected.executiveName),
                        }}
                      >
                        <User className="w-3 h-3" />
                        {selected.executiveName}
                      </span>
                    )}
                    {selected.leadId && (
                      <Link
                        to={`${leadPathPrefix}/${selected.leadId}${leadPathPrefix.includes('executive') || leadPathPrefix.includes('manager') || leadPathPrefix.includes('leader') ? '/view' : ''}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[#dadce0] text-[11px] text-[#1a73e8] hover:bg-[#f6f8fc] font-medium"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {selected.leadName}
                      </Link>
                    )}
                    {selected.leadDestination && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#f1f3f4] text-[11px] text-[#5f6368]">
                        {selected.leadDestination}
                      </span>
                    )}
                    {selected.status === 'failed' && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#fce8e6] text-[11px] text-[#d93025]">
                        Failed
                      </span>
                    )}
                    {selected.category && selected.category !== 'reply' && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#e8f0fe] text-[11px] text-[#1a73e8] capitalize">
                        {String(selected.category).replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <GmailComposeLeadPicker
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSent={load}
      />
    </div>
  );
}
