import { useEffect, useMemo, useState } from 'react';
import {
  Eye,
  FileText,
  Mail,
  MapPin,
  Paperclip,
  Send,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import AppModal from '../ui/AppModal';
import { Button } from '../ui/button';
import { fetchEmailTemplates, sendLeadEmail } from '../../services/emailApi';
import {
  renderEmailTemplate,
  filesToAttachments,
  buildQuotationHtmlAttachment,
} from '../../lib/emailContact';
import {
  wrapEmailHtml,
  buildEmailPreviewOptions,
  getCategoryAccent,
  BRAND,
} from '../../lib/emailHtmlLayout';

const CATEGORY_LABELS = {
  quotation: 'Quotation',
  follow_up: 'Follow-up',
  booking_confirmation: 'Booking',
  payment_confirmation: 'Payment',
  welcome: 'Welcome',
  reactivation: 'Reactivation',
  custom: 'Custom',
};

const CATEGORY_ICONS = {
  quotation: '✨',
  follow_up: '💬',
  booking_confirmation: '🎉',
  payment_confirmation: '✅',
  welcome: '🌏',
  reactivation: '🔔',
  custom: '✉️',
};

const inputClass =
  'mt-1.5 w-full rounded-xl border border-subtle/80 bg-white/80 dark:bg-surface px-3.5 py-2.5 text-sm text-content-primary shadow-sm transition focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400/50';

export default function EmailComposerModal({
  open,
  onClose,
  lead,
  leadId,
  emailEndpoint = '/leads',
  quotation = null,
  defaultCategory = 'custom',
  onSent,
}) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [category, setCategory] = useState(defaultCategory);
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState([]);
  const [attachQuotation, setAttachQuotation] = useState(!!quotation);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  const accent = getCategoryAccent(category);

  const previewExtras = useMemo(
    () => ({
      executiveName: user?.name,
      quotationNumber: quotation?.quoteNumber,
      amount: quotation?.totalAmount ?? quotation?.grandTotal ?? lead?.budget,
    }),
    [user?.name, quotation, lead?.budget]
  );

  const previewHtml = useMemo(() => {
    if (!message.trim()) return '';
    return wrapEmailHtml(message, {
      subject,
      ...buildEmailPreviewOptions(lead, category, previewExtras),
    });
  }, [message, subject, lead, category, previewExtras]);

  useEffect(() => {
    if (!open) return;
    setTo(lead?.email || '');
    setCategory(defaultCategory);
    setAttachQuotation(!!quotation);
    setTemplateId('');
    setLoading(true);

    const amount = quotation?.totalAmount ?? quotation?.grandTotal ?? lead?.budget;
    const amountLabel =
      amount != null && amount !== ''
        ? `₹${Number(amount).toLocaleString('en-IN')}`
        : '';
    const destination =
      quotation?.destination || lead?.destination || 'your destination';

    if (quotation || defaultCategory === 'quotation') {
      setSubject(
        `Your HindHolidays quotation${quotation?.quoteNumber ? ` (${quotation.quoteNumber})` : ''} — ${destination}`
      );
      setMessage(
        [
          `Dear ${lead?.name || 'Guest'},`,
          '',
          `Thank you for choosing HindHolidays. Your personalised quotation for ${destination} is ready.`,
          quotation?.quoteNumber ? `Quotation reference: ${quotation.quoteNumber}` : null,
          amountLabel ? `Package amount: ${amountLabel}` : null,
          '',
          'Please review the details and reply to this email to confirm or request changes. Our team is happy to customise hotels, transfers and sightseeing for you.',
          '',
          'Warm regards,',
          user?.name || 'HindHolidays Sales Team',
        ]
          .filter(Boolean)
          .join('\n')
      );
    } else {
      setSubject('');
      setMessage('');
    }

    fetchEmailTemplates()
      .then((rows) => setTemplates((rows || []).filter((t) => t.enabled !== false)))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, [open, lead?.email, lead?.name, lead?.destination, lead?.budget, defaultCategory, quotation, user?.name]);

  const applyTemplate = (template) => {
    if (!template) return;
    setTemplateId(template._id);
    setCategory(template.category || 'custom');
    const extras = {
      executiveName: user?.name,
      quotationNumber: quotation?.quoteNumber,
      amount: quotation?.totalAmount ?? quotation?.grandTotal ?? lead?.budget,
    };
    setSubject(renderEmailTemplate(template.subject, lead, extras));
    setMessage(renderEmailTemplate(template.body, lead, extras));
  };

  const handleSend = async () => {
    if (!leadId || !to.trim()) return;
    setSubmitting(true);
    try {
      const attachments = await filesToAttachments(files);
      if (attachQuotation && quotation) {
        const qa = buildQuotationHtmlAttachment(quotation, lead);
        if (qa) attachments.push(qa);
      }

      await sendLeadEmail(
        leadId,
        {
          to,
          cc,
          bcc,
          subject,
          message,
          category,
          templateId: templateId || undefined,
          quotationId: quotation?._id,
          quotationNumber: quotation?.quoteNumber,
          amount: quotation?.totalAmount ?? quotation?.grandTotal ?? lead?.budget,
          attachments,
        },
        emailEndpoint
      );

      onSent?.();
      onClose();
      setFiles([]);
      setCc('');
      setBcc('');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredTemplates = templates.filter(
    (t) => defaultCategory === 'custom' || t.category === defaultCategory || t.category === 'custom'
  );

  return (
    <AppModal
      open={open}
      onClose={() => !submitting && onClose()}
      size="4xl"
      className="p-0 !overflow-hidden flex flex-col max-h-[min(calc(100vh-1.5rem),900px)]"
    >
      {/* Header */}
      <div
        className="relative overflow-hidden border-b border-white/10"
        style={{ background: `linear-gradient(135deg, ${accent.primary} 0%, ${accent.secondary} 100%)` }}
      >
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_20%_20%,white,transparent_45%),radial-gradient(circle_at_80%_0%,white,transparent_35%)]" />
        <div className="relative px-6 py-5 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center shadow-lg">
              <Mail className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xl font-bold text-white tracking-tight">Compose Email</h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-semibold border border-white/25">
                  <Sparkles className="w-3 h-3" />
                  Branded delivery
                </span>
              </div>
              <p className="text-sm text-white/85 mt-1">
                From <span className="font-semibold">{BRAND.email}</span> · Beautiful HTML to your customer
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="lg:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 text-white text-xs font-semibold border border-white/25"
            >
              <Eye className="w-3.5 h-3.5" />
              {showPreview ? 'Hide preview' : 'Preview'}
            </button>
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              className="w-9 h-9 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center text-white hover:bg-white/25 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {lead && (
          <div className="relative px-6 pb-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/15 text-white/95 text-xs font-medium border border-white/15">
              <User className="w-3.5 h-3.5" />
              {lead.name || 'Lead'}
            </span>
            {lead.destination && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/15 text-white/95 text-xs font-medium border border-white/15">
                <MapPin className="w-3.5 h-3.5" />
                {lead.destination}
              </span>
            )}
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-white/25 text-white"
              style={{ backgroundColor: 'rgba(0,0,0,0.12)' }}
            >
              {CATEGORY_ICONS[category] || '✉️'} {CATEGORY_LABELS[category] || category}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 overflow-hidden">
        {/* Form */}
        <div className="p-5 space-y-4 overflow-y-auto overscroll-contain border-b lg:border-b-0 lg:border-r border-subtle bg-gradient-to-b from-surface to-surface-elevated/30 min-h-0 max-h-[min(55vh,480px)] lg:max-h-none">
          {/* Template quick pick */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-content-muted mb-2 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Quick templates
            </p>
            <div className="flex flex-wrap gap-2">
              {loading && (
                <span className="text-xs text-content-muted px-3 py-2">Loading templates…</span>
              )}
              {!loading && filteredTemplates.length === 0 && (
                <span className="text-xs text-content-muted px-3 py-2">No templates — type your message below</span>
              )}
              {filteredTemplates.map((t) => (
                <button
                  key={t._id}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    templateId === t._id
                      ? 'bg-sky-500/15 border-sky-500/40 text-sky-800 shadow-sm'
                      : 'bg-white/60 border-subtle text-content-secondary hover:border-sky-300/50 hover:bg-sky-50/50'
                  }`}
                >
                  {CATEGORY_ICONS[t.category] || '✉️'} {t.name}
                </button>
              ))}
            </div>
          </div>

          <label className="block text-sm">
            <span className="text-content-muted text-[11px] font-bold uppercase tracking-wider">To *</span>
            <input type="email" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} placeholder="customer@email.com" />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-content-muted text-[11px] font-bold uppercase tracking-wider">CC</span>
              <input type="text" value={cc} onChange={(e) => setCc(e.target.value)} className={inputClass} placeholder="Optional" />
            </label>
            <label className="block text-sm">
              <span className="text-content-muted text-[11px] font-bold uppercase tracking-wider">BCC</span>
              <input type="text" value={bcc} onChange={(e) => setBcc(e.target.value)} className={inputClass} placeholder="Optional" />
            </label>
          </div>

          <label className="block text-sm">
            <span className="text-content-muted text-[11px] font-bold uppercase tracking-wider">Subject *</span>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} placeholder="Your subject line…" />
          </label>

          <label className="block text-sm">
            <span className="text-content-muted text-[11px] font-bold uppercase tracking-wider flex items-center justify-between">
              <span>Message *</span>
              <span className="font-normal normal-case text-content-muted">{message.length} chars</span>
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={7}
              className={`${inputClass} resize-y min-h-[140px] leading-relaxed`}
              placeholder="Write your message… Customers receive a beautifully designed branded email."
            />
          </label>

          <div className="rounded-2xl border border-dashed border-subtle bg-white/50 dark:bg-surface-elevated/40 p-4 space-y-3">
            {quotation && (
              <label className="flex items-center gap-3 text-sm text-content-secondary cursor-pointer group">
                <input
                  type="checkbox"
                  checked={attachQuotation}
                  onChange={(e) => setAttachQuotation(e.target.checked)}
                  className="rounded border-subtle text-sky-600 focus:ring-sky-500"
                />
                <span className="group-hover:text-content-primary transition">
                  Attach branded quotation {quotation.quoteNumber ? `(${quotation.quoteNumber})` : ''}
                </span>
              </label>
            )}
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 cursor-pointer hover:text-sky-600 transition">
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center">
                <Paperclip className="w-4 h-4" />
              </div>
              Add file attachments
              <input type="file" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
            </label>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {files.map((f) => (
                  <span key={f.name} className="text-xs px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-800 font-medium">
                    {f.name}
                  </span>
                ))}
                <button type="button" onClick={() => setFiles([])} className="text-xs text-red-600 font-medium hover:underline">
                  Clear all
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Live preview */}
        <div className={`flex flex-col min-h-0 bg-slate-100/80 dark:bg-slate-900/40 max-h-[min(55vh,480px)] lg:max-h-none ${showPreview ? 'flex' : 'hidden lg:flex'}`}>
          <div className="px-5 py-3 border-b border-subtle/80 flex items-center justify-between bg-white/60 dark:bg-surface/60 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-sky-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-content-muted">Customer preview</span>
            </div>
            <span className="text-[10px] font-medium text-content-muted px-2 py-0.5 rounded-full bg-surface border border-subtle">
              Live
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto max-w-[420px]">
              {/* Phone frame */}
              <div className="rounded-[28px] border-[6px] border-slate-800/90 bg-slate-800/90 shadow-2xl overflow-hidden">
                <div className="h-6 bg-slate-800 flex items-center justify-center">
                  <div className="w-16 h-1 rounded-full bg-slate-600" />
                </div>
                <div className="bg-white min-h-[380px] max-h-[420px] overflow-y-auto">
                  {previewHtml ? (
                    <iframe
                      title="Email preview"
                      srcDoc={previewHtml}
                      className="w-full min-h-[380px] border-0"
                      sandbox=""
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center min-h-[380px] text-center p-8 text-content-muted">
                      <Mail className="w-10 h-10 mb-3 opacity-30" />
                      <p className="text-sm font-medium">Start typing to see the branded email</p>
                      <p className="text-xs mt-1 opacity-70">Your customer receives a premium HindHolidays design</p>
                    </div>
                  )}
                </div>
              </div>
              <p className="text-center text-[10px] text-content-muted mt-3">
                Actual email may vary slightly in Gmail / Outlook
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 px-5 py-4 border-t border-subtle flex flex-wrap items-center justify-between gap-3 bg-surface-elevated/60 backdrop-blur-sm">
        <p className="text-[11px] text-content-muted max-w-sm">
          Sent asynchronously · Branded HTML wrapper applied automatically
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting} className="rounded-xl">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSend}
            disabled={submitting || !to.trim() || !subject.trim() || !message.trim()}
            className="gap-2 rounded-xl px-5 text-white bg-green-800 hover:bg-green-700 shadow-lg shadow-green-900/25 border-0"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Sending…' : 'Send Email'}
          </Button>
        </div>
      </div>
    </AppModal>
  );
}
