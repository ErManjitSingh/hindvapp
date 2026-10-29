import { CalendarDays, ChevronDown, MapPin, Plane, Sparkles, Star } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { COMPANY_INFO } from '../../config/branding';

function timeGreeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function formatChip(filters) {
  if (filters?.dateFrom && filters.dateFrom === filters.dateTo) {
    const d = new Date(`${filters.dateFrom}T12:00:00`);
    return `Today: ${d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })}`;
  }
  const d = new Date();
  return `Today: ${d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })}`;
}

const PILLS = [
  { icon: Plane, label: 'More Destinations' },
  { icon: Sparkles, label: 'Happier Customers' },
  { icon: Star, label: 'Bigger Stories' },
];

export default function ScenicDashboardBanner({ filters, onOpenFilters }) {
  const { user } = useAuth();
  const firstName = (user?.name || 'Admin').split(' ')[0];
  const chip = formatChip(filters);
  const place = COMPANY_INFO.website || 'hindholidays.com';

  return (
    <div className="relative overflow-hidden rounded-[22px] min-h-[168px] shadow-sm">
      <img
        src="/login-himalaya-bg.png"
        alt="Traveler overlooking a Himalayan valley at sunrise"
        className="absolute inset-0 h-full w-full object-cover object-[78%_42%]"
      />
      <div className="absolute inset-0 bg-slate-900/10" />
      <div className="absolute inset-y-0 left-0 w-[62%] bg-gradient-to-r from-white via-white/88 to-transparent" />
      <div className="absolute inset-y-0 right-0 w-[38%] bg-gradient-to-l from-black/35 via-black/10 to-transparent" />

      <div className="relative z-[1] flex min-h-[168px] items-center justify-between gap-4 px-5 py-4 sm:px-6">
        <div className="min-w-0 max-w-xl">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-slate-900 sm:text-[26px]">
            {timeGreeting()},{' '}
            <span className="font-[Caveat,cursive] text-[30px] font-semibold text-slate-900 sm:text-[34px]">
              {firstName}!
            </span>{' '}
            <span aria-hidden>👋</span>
          </h1>
          <p className="mt-0.5 max-w-md text-[13px] text-slate-600">
            Let&apos;s turn travel dreams into memorable journeys.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {PILLS.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm ring-1 ring-slate-200/80 backdrop-blur"
              >
                <Icon className="h-3 w-3 text-orange-500" />
                {label}
              </span>
            ))}
            <button
              type="button"
              onClick={onOpenFilters}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm sm:hidden"
            >
              <CalendarDays className="h-3 w-3 text-slate-400" />
              {chip}
            </button>
          </div>
        </div>

        <div className="hidden shrink-0 flex-col items-end gap-2 sm:flex">
          <button
            type="button"
            onClick={onOpenFilters}
            className="inline-flex items-center gap-2 rounded-xl border border-white/70 bg-white/90 px-3 py-1.5 text-[12px] font-medium text-slate-700 shadow-sm backdrop-blur hover:bg-white"
          >
            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
            {chip}
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>
          <p className="inline-flex items-center gap-1 text-[11px] font-medium text-white drop-shadow">
            <MapPin className="h-3.5 w-3.5" />
            {place}
          </p>
        </div>
      </div>
    </div>
  );
}
