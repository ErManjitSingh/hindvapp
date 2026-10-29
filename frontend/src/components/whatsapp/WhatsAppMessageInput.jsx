import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Smile,
  Paperclip,
  Send,
  X,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  LayoutTemplate,
  Search,
  Eye,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { detectWhatsAppMediaType, fileToDataUrl } from './whatsappUtils';
import {
  fetchWhatsAppTemplates,
  fetchMetaWhatsAppTemplates,
} from '../../services/whatsappTemplatesApi';
import { renderWhatsAppTemplate } from '../../lib/whatsappContact';

const ATTACH_OPTIONS = [
  { accept: 'image/*', label: 'Photo', icon: ImageIcon, kind: 'image' },
  { accept: 'video/*', label: 'Video', icon: Film, kind: 'video' },
  { accept: 'audio/*', label: 'Audio', icon: Music, kind: 'audio' },
  { accept: '.pdf,.doc,.docx,.xls,.xlsx,application/pdf', label: 'Document', icon: FileText, kind: 'document' },
];

const MAX_BYTES = 12 * 1024 * 1024;

function autoResize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
}

function fillMetaBody(bodyText, params = []) {
  let out = String(bodyText || '');
  params.forEach((val, i) => {
    out = out.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), val || `{{${i + 1}}}`);
  });
  return out;
}

export default function WhatsAppMessageInput({ onSend, disabled, lead, user, sessionClosed = false }) {
  const [text, setText] = useState('');
  const [showAttach, setShowAttach] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  /** 'meta' = Cloud templates (new leads); 'crm' = saved quick replies */
  const [templateMode, setTemplateMode] = useState(sessionClosed ? 'meta' : 'crm');
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateDraft, setTemplateDraft] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);
  const previewRef = useRef(null);
  const fileRef = useRef(null);
  const acceptRef = useRef('image/*');

  useEffect(() => {
    setTemplateMode(sessionClosed ? 'meta' : 'crm');
  }, [sessionClosed]);

  useEffect(() => {
    if (!showTemplates || templateDraft) return;
    let cancelled = false;
    setTemplatesLoading(true);
    const loader =
      templateMode === 'meta' ? fetchMetaWhatsAppTemplates() : fetchWhatsAppTemplates();
    loader
      .then((rows) => {
        if (cancelled) return;
        if (templateMode === 'meta') {
          setTemplates(rows || []);
        } else {
          setTemplates((rows || []).filter((t) => t.enabled !== false));
        }
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showTemplates, templateDraft, templateMode]);

  useEffect(() => {
    if (templateDraft && templateDraft.source !== 'meta') {
      requestAnimationFrame(() => {
        autoResize(previewRef.current);
        previewRef.current?.focus();
      });
    }
  }, [templateDraft?.name, templateDraft?.source]);

  useEffect(() => {
    autoResize(inputRef.current);
  }, [text]);

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => {
      const hay = `${t.name || ''} ${t.body || ''} ${t.bodyText || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [templates, templateSearch]);

  const clearPending = () => {
    if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl);
    setPendingFile(null);
  };

  const openPicker = (accept) => {
    acceptRef.current = accept;
    setShowAttach(false);
    if (fileRef.current) {
      fileRef.current.accept = accept;
      fileRef.current.value = '';
      fileRef.current.click();
    }
  };

  const onFilePicked = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      window.alert('File too large. Max 12 MB.');
      return;
    }
    const type = detectWhatsAppMediaType(file);
    const previewUrl = type === 'image' || type === 'video' ? URL.createObjectURL(file) : null;
    setPendingFile({ file, type, previewUrl });
  };

  const openCrmTemplatePreview = (template) => {
    const rendered = renderWhatsAppTemplate(template.body, lead || {}, user || {});
    setTemplateDraft({
      source: 'crm',
      id: template._id,
      name: template.name,
      text: rendered,
    });
    setTemplateSearch('');
  };

  const openMetaTemplatePreview = (template) => {
    const count = Number(template.bodyParamCount) || 0;
    const customerName = String(lead?.name || '').trim() || 'there';
    const executiveName = String(user?.name || '').trim() || 'HindHolidays';
    const destination = String(lead?.destination || '').trim() || 'your trip';
    const defaults = [customerName, executiveName, destination];
    const bodyParams = Array.from({ length: count }, (_, i) => defaults[i] || '');
    const body = fillMetaBody(template.bodyText, bodyParams);
    const header = template.headerText ? `${template.headerText}\n\n` : '';
    setTemplateDraft({
      source: 'meta',
      name: template.name,
      language: template.language || 'en_US',
      bodyText: template.bodyText || '',
      headerText: template.headerText || '',
      bodyParamCount: count,
      bodyParams,
      text: `${header}${body}`.trim(),
    });
    setTemplateSearch('');
  };

  const updateMetaParam = (index, value) => {
    setTemplateDraft((d) => {
      if (!d || d.source !== 'meta') return d;
      const bodyParams = [...(d.bodyParams || [])];
      bodyParams[index] = value;
      const body = fillMetaBody(d.bodyText, bodyParams);
      const header = d.headerText ? `${d.headerText}\n\n` : '';
      return {
        ...d,
        bodyParams,
        text: `${header}${body}`.trim(),
      };
    });
  };

  const closeTemplateFlow = () => {
    setShowTemplates(false);
    setTemplateDraft(null);
    setTemplateSearch('');
  };

  const sendTemplateDraft = async () => {
    if (disabled || uploading || !templateDraft) return;

    if (templateDraft.source === 'meta') {
      const missing = (templateDraft.bodyParams || []).some((p) => !String(p || '').trim());
      if (templateDraft.bodyParamCount > 0 && missing) {
        window.alert('Please fill all template variables before sending.');
        return;
      }
      await onSend({
        text: templateDraft.text,
        type: 'text',
        templateName: templateDraft.name,
        templateLanguage: templateDraft.language,
        templateBodyParams: templateDraft.bodyParams || [],
      });
      setText('');
      closeTemplateFlow();
      return;
    }

    const trimmed = String(templateDraft.text || '').trim();
    if (!trimmed) return;
    if (sessionClosed) {
      window.alert(
        'Session is closed. Free-text quick replies will not deliver. Switch to Meta templates to message this lead.'
      );
      setTemplateMode('meta');
      setTemplateDraft(null);
      return;
    }
    await onSend({ text: trimmed, type: 'text' });
    setText('');
    closeTemplateFlow();
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (disabled || uploading) return;
    if (!pendingFile && !trimmed) return;

    if (sessionClosed && !pendingFile) {
      setShowTemplates(true);
      setTemplateMode('meta');
      window.alert(
        'Customer has not messaged in 24h. Use a Meta template (template icon) to start the chat.'
      );
      return;
    }

    if (!pendingFile) {
      onSend({ text: trimmed, type: 'text' });
      setText('');
      inputRef.current?.focus();
      return;
    }

    if (sessionClosed) {
      window.alert('Media cannot be sent until the customer replies, or use a Meta template first.');
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(pendingFile.file);
      await onSend({
        text: trimmed,
        type: pendingFile.type,
        mediaBase64: dataUrl,
        mediaMimeType: pendingFile.file.type || 'application/octet-stream',
        mediaFileName: pendingFile.file.name,
        attachment: {
          name: pendingFile.file.name,
          mimeType: pendingFile.file.type,
          previewUrl: pendingFile.previewUrl,
        },
      });
      setText('');
      clearPending();
    } finally {
      setUploading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = Boolean(text.trim() || pendingFile) && !disabled && !uploading;
  const canSendTemplate =
    !disabled &&
    !uploading &&
    (templateDraft?.source === 'meta'
      ? Boolean(templateDraft.name)
      : Boolean(String(templateDraft?.text || '').trim()));

  const toggleTemplates = () => {
    setShowAttach(false);
    if (showTemplates) {
      closeTemplateFlow();
      return;
    }
    setTemplateDraft(null);
    setTemplateMode(sessionClosed ? 'meta' : templateMode);
    setShowTemplates(true);
  };

  const toggleAttach = () => {
    setShowTemplates(false);
    setTemplateDraft(null);
    setShowAttach((s) => !s);
  };

  return (
    <div className="shrink-0 px-3 sm:px-4 py-3 bg-white border-t border-slate-200/80">
      {sessionClosed && (
        <p className="mb-2 text-[11px] text-amber-800/90">
          Session closed — free text will not deliver. Tap{' '}
          <span className="font-semibold">Meta template</span> to message this lead first.
        </p>
      )}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept={acceptRef.current}
        onChange={onFilePicked}
      />

      {showTemplates && templateDraft && (
        <div className="mb-3 overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-md">
          <div className="flex items-center justify-between gap-2 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#25D366]/15 text-[#128C7E]">
                <Eye className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800">
                  {templateDraft.source === 'meta' ? 'Meta template' : 'Preview before send'}
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  {templateDraft.name}
                  {templateDraft.language ? ` · ${templateDraft.language}` : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTemplateDraft(null)}
              className="rounded-full p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              aria-label="Back to templates"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {templateDraft.source === 'meta' && templateDraft.bodyParamCount > 0 && (
            <div className="space-y-2 border-b border-slate-100 px-3 py-2.5">
              {templateDraft.bodyParams.map((val, i) => (
                <label key={i} className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Variable {`{{${i + 1}}}`}
                  </span>
                  <input
                    value={val}
                    onChange={(e) => updateMetaParam(i, e.target.value)}
                    className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                    placeholder={`Value for {{${i + 1}}}`}
                  />
                </label>
              ))}
            </div>
          )}

          <div className="bg-[#e5ddd5] px-3 py-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Customer will receive
            </p>
            <div className="ml-auto max-w-[92%] rounded-2xl rounded-tr-md bg-[#dcf8c6] px-3 py-2.5 shadow-sm">
              {templateDraft.source === 'meta' ? (
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800">
                  {templateDraft.text}
                </p>
              ) : (
                <textarea
                  ref={previewRef}
                  value={templateDraft.text}
                  onChange={(e) => {
                    setTemplateDraft((d) => ({ ...d, text: e.target.value }));
                    autoResize(e.target);
                  }}
                  rows={6}
                  className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-slate-800 outline-none whitespace-pre-wrap"
                />
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-3 py-2.5">
            <button
              type="button"
              onClick={() => setTemplateDraft(null)}
              className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={sendTemplateDraft}
              disabled={!canSendTemplate}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#1ebe5d] disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
              {templateDraft.source === 'meta' ? 'Send Meta template' : 'Send message'}
            </button>
          </div>
        </div>
      )}

      {showTemplates && !templateDraft && (
        <div className="mb-3 overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/80 to-white shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-emerald-100 px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#25D366]/15 text-[#128C7E]">
                <LayoutTemplate className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800">Select template</p>
                <p className="text-[10px] text-slate-500 truncate">
                  {templateMode === 'meta'
                    ? 'Meta approved — works for new leads'
                    : 'CRM quick replies — only inside 24h session'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeTemplateFlow}
              className="rounded-full p-1.5 text-slate-400 hover:bg-white hover:text-slate-600"
              aria-label="Close templates"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex gap-1 px-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setTemplateMode('meta');
                setTemplates([]);
              }}
              className={cn(
                'rounded-full px-3 py-1 text-[11px] font-semibold transition-colors',
                templateMode === 'meta'
                  ? 'bg-[#25D366] text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200'
              )}
            >
              Meta (new leads)
            </button>
            <button
              type="button"
              onClick={() => {
                setTemplateMode('crm');
                setTemplates([]);
              }}
              className={cn(
                'rounded-full px-3 py-1 text-[11px] font-semibold transition-colors',
                templateMode === 'crm'
                  ? 'bg-[#25D366] text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200'
              )}
            >
              CRM quick replies
            </button>
          </div>

          <div className="relative px-3 py-2">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              placeholder="Search templates..."
              className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
            />
          </div>

          <div className="max-h-52 overflow-y-auto px-2 pb-2">
            {templatesLoading && (
              <p className="px-2 py-6 text-center text-xs text-slate-400">Loading templates…</p>
            )}
            {!templatesLoading && filteredTemplates.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-slate-400">
                {templateMode === 'meta'
                  ? 'No Meta templates yet. Connect the new HindHolidays WhatsApp number to load templates.'
                  : 'No CRM templates. Add some in Settings → WhatsApp Templates.'}
              </p>
            )}
            {!templatesLoading &&
              filteredTemplates.map((template) => {
                if (templateMode === 'meta') {
                  return (
                    <button
                      key={`${template.name}:${template.language}`}
                      type="button"
                      onClick={() => openMetaTemplatePreview(template)}
                      className="group mb-1.5 flex w-full flex-col gap-1 rounded-xl border border-transparent bg-white px-3 py-2.5 text-left shadow-sm ring-1 ring-slate-100 transition hover:border-emerald-200 hover:ring-emerald-200/60"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-800">{template.name}</span>
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                          {template.language || 'en'}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-500 whitespace-pre-line">
                        {template.headerText ? `${template.headerText} — ` : ''}
                        {template.bodyText}
                      </p>
                    </button>
                  );
                }
                const preview = renderWhatsAppTemplate(template.body, lead || {}, user || {});
                return (
                  <button
                    key={template._id}
                    type="button"
                    onClick={() => openCrmTemplatePreview(template)}
                    className="group mb-1.5 flex w-full flex-col gap-1 rounded-xl border border-transparent bg-white px-3 py-2.5 text-left shadow-sm ring-1 ring-slate-100 transition hover:border-emerald-200 hover:ring-emerald-200/60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-800">{template.name}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 opacity-0 transition group-hover:opacity-100">
                        <Eye className="h-3 w-3" />
                        Preview
                      </span>
                    </div>
                    <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-500 whitespace-pre-line">
                      {preview}
                    </p>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {showAttach && (
        <div className="flex gap-3 mb-3 px-1">
          {ATTACH_OPTIONS.map(({ accept, label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => openPicker(accept)}
              className="flex flex-col items-center gap-1.5 group"
            >
              <div className="w-11 h-11 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center group-hover:bg-violet-50 group-hover:border-violet-200 transition-colors">
                <Icon className="w-5 h-5 text-slate-500 group-hover:text-violet-600" />
              </div>
              <span className="text-[10px] text-slate-400">{label}</span>
            </button>
          ))}
        </div>
      )}

      {pendingFile && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          {pendingFile.type === 'image' && pendingFile.previewUrl ? (
            <img
              src={pendingFile.previewUrl}
              alt="Preview"
              className="w-12 h-12 rounded-lg object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
              <FileText className="w-5 h-5 text-slate-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-800 truncate">{pendingFile.file.name}</p>
            <p className="text-[10px] text-slate-400 capitalize">{pendingFile.type} ready to send</p>
          </div>
          <button
            type="button"
            onClick={clearPending}
            className="p-1.5 rounded-full hover:bg-white text-slate-400"
            aria-label="Remove attachment"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {!templateDraft && (
        <>
          <div className="flex items-end gap-1.5 sm:gap-2">
            <button
              type="button"
              className="mb-0.5 p-2 rounded-full hover:bg-slate-50 text-slate-400 shrink-0"
              aria-label="Emoji"
            >
              <Smile className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={toggleTemplates}
              className={cn(
                'mb-0.5 p-2 rounded-full hover:bg-emerald-50 shrink-0 transition-colors',
                showTemplates || sessionClosed ? 'text-[#128C7E] bg-emerald-50' : 'text-slate-400'
              )}
              aria-label="Select template"
              title="Select template"
            >
              <LayoutTemplate className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={toggleAttach}
              disabled={sessionClosed}
              className={cn(
                'mb-0.5 p-2 rounded-full hover:bg-slate-50 shrink-0 transition-colors',
                showAttach ? 'text-violet-600' : 'text-slate-400',
                sessionClosed && 'opacity-40'
              )}
              aria-label="Attach"
            >
              {showAttach ? <X className="w-5 h-5" /> : <Paperclip className="w-5 h-5" />}
            </button>

            <div className="flex-1 min-w-0">
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  autoResize(e.target);
                }}
                onKeyDown={handleKeyDown}
                disabled={disabled || uploading}
                rows={1}
                placeholder={
                  sessionClosed
                    ? 'Use Meta template to message new leads…'
                    : pendingFile
                      ? 'Add a caption...'
                      : 'Type a message...'
                }
                className="w-full max-h-40 resize-none rounded-2xl px-4 py-2.5 bg-slate-50 border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300"
              />
            </div>

            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className="shrink-0 w-11 h-11 rounded-full bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center shadow-lg shadow-violet-600/30 disabled:opacity-40 transition-colors"
              aria-label="Send"
            >
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          </div>

          {!showTemplates && (
            <button
              type="button"
              onClick={toggleTemplates}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors"
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
              {sessionClosed ? 'Send Meta template' : 'Select template'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
