import { Link } from 'react-router-dom';
import { MessageCircle, Mail, ChevronRight, Thermometer } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../../context/AuthContext';
import { CHANNELS } from '../../config/channels';

export default function SettingsPage() {
  const { can } = usePermissions();
  const { user } = useAuth();
  const canManageWhatsApp = CHANNELS.whatsapp && can('whatsapp', 'manage');
  const canManageEmail = CHANNELS.email && can('email', 'manage');
  const isAdmin = user?.role === 'admin';

  const items = [
    isAdmin && {
      to: '/settings/lead-statuses',
      icon: Thermometer,
      title: 'Lead Temperature Labels',
      description: 'Customize Hot / Warm / Cold reason labels (pipeline stages are fixed)',
      color: 'text-orange-600 bg-orange-500/10',
    },
    canManageWhatsApp && {
      to: '/settings/whatsapp-templates',
      icon: MessageCircle,
      title: 'WhatsApp Templates',
      description: 'Manage predefined WhatsApp messages for sales team',
      color: 'text-green-600 bg-green-500/10',
    },
    canManageEmail && {
      to: '/settings/email-templates',
      icon: Mail,
      title: 'Email Templates',
      description: 'Manage email templates for info@hindholidays.com',
      color: 'text-sky-600 bg-sky-500/10',
    },
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="CRM configuration and integrations" breadcrumbs={['Settings']} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className="group rounded-2xl border border-subtle bg-surface p-5 hover:border-brand-500/30 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${item.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <ChevronRight className="w-5 h-5 text-content-muted group-hover:text-brand-600 transition-colors" />
              </div>
              <h3 className="font-semibold text-content-primary mt-4">{item.title}</h3>
              <p className="text-sm text-content-muted mt-1">{item.description}</p>
            </Link>
          );
        })}
      </div>

      {!items.length && (
        <p className="text-sm text-content-muted">No settings available for your role.</p>
      )}
    </div>
  );
}
