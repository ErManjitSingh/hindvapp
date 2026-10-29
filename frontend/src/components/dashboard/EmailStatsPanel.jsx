import { Mail, CheckCircle2, XCircle, FileText, Clock } from 'lucide-react';
import DashboardPanel from './DashboardPanel';

export default function EmailStatsPanel({ stats }) {
  if (!stats) return null;

  const cards = [
    { label: 'Emails Sent Today', value: stats.sentToday ?? 0, icon: CheckCircle2, tone: 'text-emerald-600 bg-emerald-500/10' },
    { label: 'Failed Emails', value: stats.failedToday ?? 0, icon: XCircle, tone: 'text-red-600 bg-red-500/10' },
    { label: 'Quotation Emails', value: stats.quotationEmails ?? 0, icon: FileText, tone: 'text-indigo-600 bg-indigo-500/10' },
    { label: 'Follow-up Emails', value: stats.followUpEmails ?? 0, icon: Clock, tone: 'text-sky-600 bg-sky-500/10' },
  ];

  return (
    <DashboardPanel title="Email Activity" subtitle="Today · info@hindholidays.com">
      {!stats.configured && (
        <p className="text-sm text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 mb-4">
          SMTP is not configured on the server. Set SMTP_HOST, SMTP_USER, and SMTP_PASS to enable sending.
        </p>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-xl border border-subtle bg-surface-elevated/50 p-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${card.tone}`}>
                <Icon className="w-4 h-4" />
              </div>
              <p className="text-2xl font-bold text-content-primary tabular-nums">{card.value}</p>
              <p className="text-xs text-content-muted mt-1">{card.label}</p>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-content-muted mt-4 flex items-center gap-1.5">
        <Mail className="w-3.5 h-3.5" /> Emails are queued and sent asynchronously — message bodies are not stored.
      </p>
    </DashboardPanel>
  );
}
