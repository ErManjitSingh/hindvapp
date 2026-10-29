import { useCallback, useEffect, useState } from 'react';
import { Mail, Plus, Pencil, Trash2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/button';
import Switch from '../../components/ui/switch';
import AppModal from '../../components/ui/AppModal';
import { fetchEmailTemplates } from '../../services/emailApi';
import {
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
} from '../../services/emailTemplatesApi';
import { usePermissions } from '../../hooks/usePermissions';
import { CHANNELS } from '../../config/channels';
import ChannelUnavailable from '../../components/channels/ChannelUnavailable';

const CATEGORIES = [
  { value: 'quotation', label: 'Quotation' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'booking_confirmation', label: 'Booking Confirmation' },
  { value: 'payment_confirmation', label: 'Payment Confirmation' },
  { value: 'welcome', label: 'Welcome' },
  { value: 'reactivation', label: 'Reactivation' },
  { value: 'custom', label: 'Custom' },
];

const EMPTY_FORM = {
  name: '',
  subject: '',
  body: '',
  category: 'custom',
  enabled: true,
  sortOrder: 0,
};

export default function EmailTemplatesPage() {
  if (!CHANNELS.email) return <ChannelUnavailable channel="email" />;
  const { can } = usePermissions();
  const canManage = can('email', 'manage');
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return fetchEmailTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (canManage) load();
  }, [canManage, load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (template) => {
    setEditing(template);
    setForm({
      name: template.name,
      subject: template.subject,
      body: template.body,
      category: template.category || 'custom',
      enabled: template.enabled !== false,
      sortOrder: template.sortOrder || 0,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) return;
    setSaving(true);
    try {
      if (editing) await updateEmailTemplate(editing._id, form);
      else await createEmailTemplate(form);
      setModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this email template?')) return;
    await deleteEmailTemplate(id);
    await load();
  };

  const toggleEnabled = async (template) => {
    await updateEmailTemplate(template._id, { enabled: !template.enabled });
    await load();
  };

  if (!canManage) {
    return (
      <div className="rounded-2xl border border-subtle bg-surface p-12 text-center text-content-muted">
        You do not have permission to manage email templates.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Email Templates"
          description="Manage templates sent from info@hindholidays.com"
          breadcrumbs={['Settings', 'Email Templates']}
        />
        <Button onClick={openCreate} className="rounded-xl gap-2 bg-sky-600 hover:bg-sky-500 text-white border-0">
          <Plus className="w-4 h-4" /> New Template
        </Button>
      </div>

      <div className="rounded-2xl border border-subtle bg-surface overflow-hidden">
        {loading ? (
          <p className="p-12 text-center text-content-muted">Loading templates…</p>
        ) : templates.length === 0 ? (
          <p className="p-12 text-center text-content-muted">No templates yet</p>
        ) : (
          <div className="divide-y divide-subtle">
            {templates.map((template) => (
              <div key={template._id} className="p-5 flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5 text-sky-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-content-primary">{template.name}</h3>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-700 capitalize">
                        {(template.category || 'custom').replace(/_/g, ' ')}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${template.enabled ? 'bg-emerald-500/10 text-emerald-700' : 'bg-slate-500/10 text-slate-600'}`}>
                        {template.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-content-secondary mt-2">{template.subject}</p>
                    <p className="text-sm text-content-muted mt-2 whitespace-pre-line line-clamp-4">{template.body}</p>
                    <p className="text-[11px] text-content-muted mt-2">
                      Variables: {'{{customerName}}'}, {'{{destination}}'}, {'{{quotationNumber}}'}, {'{{amount}}'}, {'{{travelDate}}'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={Boolean(template.enabled)}
                    size="sm"
                    tone="emerald"
                    aria-label={template.enabled ? 'Disable template' : 'Enable template'}
                    onCheckedChange={() => toggleEnabled(template)}
                  />
                  <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => openEdit(template)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="rounded-lg text-rose-600" onClick={() => handleDelete(template._id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AppModal open={modalOpen} onClose={() => !saving && setModalOpen(false)} size="lg" className="p-6">
        <h3 className="text-lg font-bold text-content-primary mb-4">
          {editing ? 'Edit Email Template' : 'Create Email Template'}
        </h3>
        <div className="space-y-4">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Template name"
            className="w-full rounded-xl border border-subtle bg-surface-elevated p-3 text-sm"
          />
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="w-full rounded-xl border border-subtle bg-surface-elevated p-3 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <input
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            placeholder="Email subject with {{customerName}}…"
            className="w-full rounded-xl border border-subtle bg-surface-elevated p-3 text-sm"
          />
          <textarea
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            rows={8}
            placeholder="Email body…"
            className="w-full rounded-xl border border-subtle bg-surface-elevated p-3 text-sm"
          />
          <label className="flex items-center gap-2 text-sm text-content-secondary">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            />
            Enabled
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.subject.trim() || !form.body.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </AppModal>
    </div>
  );
}
