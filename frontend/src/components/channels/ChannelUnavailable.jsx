import { MessageCircle, Mail } from 'lucide-react';
import { CHANNELS } from '../../config/channels';

export default function ChannelUnavailable({ channel }) {
  const isWhatsApp = channel === 'whatsapp';
  const Icon = isWhatsApp ? MessageCircle : Mail;
  const title = isWhatsApp ? 'WhatsApp is not connected' : 'Email is not connected';
  const body = isWhatsApp
    ? 'WhatsApp / Meta is not connected yet. This inbox will come back after the HindHolidays WhatsApp number is added.'
    : 'Email is not connected yet. Sending will come back after the HindHolidays SMTP details are added.';

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
          <Icon className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{body}</p>
      </div>
    </div>
  );
}

export function ChannelGate({ channel, children }) {
  if (channel === 'whatsapp' && !CHANNELS.whatsapp) {
    return <ChannelUnavailable channel="whatsapp" />;
  }
  if (channel === 'email' && !CHANNELS.email) {
    return <ChannelUnavailable channel="email" />;
  }
  return children;
}
