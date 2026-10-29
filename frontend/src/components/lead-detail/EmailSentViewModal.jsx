import { useEffect, useMemo, useState } from 'react';
import { Eye, Loader2, Mail, Paperclip, X } from 'lucide-react';
import AppModal from '../ui/AppModal';
import { Button } from '../ui/button';
import { fetchMailboxMessage } from '../../services/emailApi';
import { wrapEmailHtml, getCategoryAccent } from '../../lib/emailHtmlLayout';

function looksLikeHtml(text = '') {
  return /<\/?[a-z][\s\S]*>/i.test(String(text));
}

export default function EmailSentViewModal({ open, onClose, emailLogId, fallbackSubject = '' }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!open || !emailLogId) {
      setMessage(null);
      setError('');
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    fetchMailboxMessage('sent', emailLogId)
      .then((data) => {
        if (!cancelled) setMessage(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setMessage(null);
          setError(err?.response?.data?.message || 'Could not load this email');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, emailLogId]);

  const previewHtml = useMemo(() => {
    if (!message) return '';
    if (message.bodyHtml) return message.bodyHtml;
    const body = String(message.bodyText || '').trim();
    if (!body) return '';
    if (looksLikeHtml(body)) return body;
    return wrapEmailHtml(body, {
      subject: message.subject || fallbackSubject,
      category: message.category || 'custom',
      customerName: message.leadName || '',
      destination: message.leadDestination || '',
    });
  }, [message, fallbackSubject]);

  const accent = getCategoryAccent(message?.category || 'custom');

  return (
    <AppModal open={open} onClose={onClose} size="3xl" className="p-0 overflow-hidden" panelClassName="max-w-[720px]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: accent.primary }}
          >
            <Mail className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">
              {message?.subject || fallbackSubject || 'Sent email'}
            </p>
            <p className="text-[11px] text-slate-500">
              {message?.category ? String(message.category).replace(/_/g, ' ') : 'Email'} · what was sent
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-[min(75dvh,640px)] overflow-y-auto px-5 py-4">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading email…
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </div>
        )}

        {!loading && !error && message && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-[12px] space-y-1.5">
              <p>
                <span className="font-semibold text-slate-500">To:</span>{' '}
                <span className="text-slate-800">{(message.to || []).join(', ') || '—'}</span>
              </p>
              {(message.cc || []).length > 0 && (
                <p>
                  <span className="font-semibold text-slate-500">Cc:</span>{' '}
                  <span className="text-slate-800">{message.cc.join(', ')}</span>
                </p>
              )}
              <p>
                <span className="font-semibold text-slate-500">From:</span>{' '}
                <span className="text-slate-800">
                  {message.from?.name || 'HindHolidays'}
                  {message.from?.email ? ` <${message.from.email}>` : ''}
                </span>
              </p>
              {message.status && (
                <p>
                  <span className="font-semibold text-slate-500">Status:</span>{' '}
                  <span className="capitalize text-slate-800">{message.status}</span>
                  {message.errorMessage ? ` — ${message.errorMessage}` : ''}
                </p>
              )}
              {(message.hasAttachment || (message.attachmentNames || []).length > 0) && (
                <p className="flex flex-wrap items-center gap-1.5 pt-1">
                  <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                  {(message.attachmentNames || ['Attachment']).map((name) => (
                    <span
                      key={name}
                      className="inline-flex rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200"
                    >
                      {name}
                    </span>
                  ))}
                </p>
              )}
            </div>

            {previewHtml ? (
              <iframe
                title="Email body"
                srcDoc={previewHtml}
                className="w-full min-h-[320px] rounded-xl border border-slate-200 bg-white"
                sandbox=""
              />
            ) : (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                Full message body is not stored for this email (older sends).
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end border-t border-slate-100 px-5 py-3">
        <Button type="button" variant="outline" onClick={onClose} className="rounded-xl gap-1.5">
          <Eye className="h-3.5 w-3.5" />
          Close
        </Button>
      </div>
    </AppModal>
  );
}
