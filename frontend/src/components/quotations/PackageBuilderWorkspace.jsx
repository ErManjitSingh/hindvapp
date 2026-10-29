import { useMemo, useState, useCallback } from 'react';
import {
  ArrowLeft,
  Car,
  Hotel,
  Moon,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  FileText,
  Users,
  CalendarDays,
  MapPin,
  Leaf,
  Route,
  ListChecks,
  X,
} from 'lucide-react';
import { getPackageTypeConfig, formatINR } from './quotationUtils';
import { shiftYmd, toYmd } from './quotePdfHelpers';
import { clampExtraMattresses } from './partyCosting';
import PackageBuilderDayTimeline from './PackageBuilderDayTimeline';
import PackageBuilderPriceSidebar from './PackageBuilderPriceSidebar';
import MobileQuotationActionBar from './MobileQuotationActionBar';
import InclusionExclusionEditor from './InclusionExclusionEditor';
import QuotationPdfOverlay from './QuotationPdfOverlay';
import PackageResourcePickerDrawer from './PackageResourcePickerDrawer';
import EmailComposerModal from '../email/EmailComposerModal';
import { openWhatsApp } from '../../lib/whatsappContact';
import { toast } from '../../context/ToastContext';
import { cn } from '../../lib/utils';
import { mealPlanFromCode, normalizeMealPlanKey, resolveExtraBedNightRate } from '../../lib/mealPlanDefaults';

function buildQuotationShareText({ lead, pkg, pricing, nights, daysCount, quoteNumber }) {
  const total = formatINR(pricing?.total || 0);
  const guest = lead?.name || 'Guest';
  const destination = pkg?.routing || pkg?.destination || lead?.destination || '';
  const duration =
    nights != null || daysCount
      ? `${nights ?? Math.max(0, (daysCount || 1) - 1)}N / ${daysCount || (nights || 0) + 1}D`
      : '';

  return [
    `Hello ${guest},`,
    '',
    'Your customised travel quotation from HindHolidays is ready:',
    '',
    pkg?.name ? `📦 Package: ${pkg.name}` : null,
    destination ? `📍 Destination: ${destination}` : null,
    duration ? `🗓️ Duration: ${duration}` : null,
    `💰 Total: ${total}`,
    quoteNumber ? `🔖 Ref: ${quoteNumber}` : null,
    '',
    'Please reply to confirm or request any changes.',
    'Thank you — HindHolidays',
  ]
    .filter(Boolean)
    .join('\n');
}

function parseDestinationStops(pkg, lead) {
  const raw =
    pkg?.route ||
    pkg?.destinations ||
    pkg?.cities ||
    (pkg?.destination ? String(pkg.destination).split(/→|->|,|\|/).map((s) => s.trim()).filter(Boolean) : null) ||
    (lead?.destination ? String(lead.destination).split(/→|->|,|\|/).map((s) => s.trim()).filter(Boolean) : []);

  const list = Array.isArray(raw) ? raw : [];
  return list.map((item, i) => ({
    id: `dest-${i}-${typeof item === 'string' ? item : item.name || item}`,
    name: typeof item === 'string' ? item : item.name || String(item),
  }));
}

function hotelIdentityKey(hotelLike) {
  if (!hotelLike) return '';
  const id = hotelLike.id || hotelLike.hotelId || hotelLike._id || '';
  const slug = String(hotelLike.slug || '').trim().toLowerCase();
  const name = String(hotelLike.name || '').trim().toLowerCase();
  if (id) return `id:${String(id)}`;
  if (slug) return `slug:${slug}`;
  if (name) return `name:${name}`;
  return '';
}

function isSameHotel(a, b) {
  const ka = hotelIdentityKey(a);
  const kb = hotelIdentityKey(b);
  if (!ka || !kb) return false;
  return ka === kb;
}

/** Extra rooms must stay on the day's selected hotel — keep room/meal from pick, hotel from primary. */
function bindOptionToHotel(option, hotel) {
  if (!option || !hotel) return option;
  if (isSameHotel(option, hotel)) return option;
  return {
    ...option,
    id: hotel.id || hotel.hotelId || option.id,
    hotelId: hotel.hotelId || hotel.id || option.hotelId,
    name: hotel.name || option.name,
    slug: hotel.slug || option.slug,
    image: hotel.image || option.image,
    images: hotel.images || option.images,
    starRating: hotel.starRating || hotel.starCategory || option.starRating,
    location: hotel.location || option.location,
    city: hotel.city || option.city,
  };
}

/** Resolve current day hotel so Add room opens that hotel's room list directly. */
function resolveDayHotelForAddRoom(day, dayWiseHotels = []) {
  if (!day) return null;
  const primary =
    (dayWiseHotels || []).find(
      (h) => Number(h.day) === Number(day.day) && Number(h.roomSlot || 1) === 1
    ) || (dayWiseHotels || []).find((h) => Number(h.day) === Number(day.day));
  const meta = day.hotelMeta || null;
  const options = Array.isArray(day.hotelOptions) ? day.hotelOptions : [];

  const id =
    meta?.id ||
    meta?.hotelId ||
    primary?.hotel?.id ||
    primary?.hotel?.hotelId ||
    null;
  const name = meta?.name || primary?.hotel?.name || day.hotel || '';
  const slug = meta?.slug || primary?.hotel?.slug || '';
  const city = meta?.city || primary?.hotel?.city || '';

  const matched =
    options.find((o) => id && String(o.id || o.hotelId) === String(id)) ||
    options.find(
      (o) =>
        name && String(o.name || '').toLowerCase() === String(name).toLowerCase()
    ) ||
    options.find(
      (o) => slug && String(o.slug || '').toLowerCase() === String(slug).toLowerCase()
    );

  if (matched) {
    return {
      ...matched,
      room: matched.room || meta?.room || primary?.room || null,
      tierName:
        matched.tierName ||
        meta?.tierName ||
        meta?.room?.name ||
        primary?.room?.name ||
        matched.room?.name,
      mealPlan: matched.mealPlan || meta?.mealPlan || primary?.mealPlan || null,
      mealPlanKey:
        matched.mealPlanKey ||
        meta?.mealPlanKey ||
        primary?.mealPlan?.key ||
        null,
      absolutePerNight:
        Number(
          matched.absolutePerNight ??
            meta?.absolutePerNight ??
            primary?.absolutePerNight ??
            0
        ) || matched.absolutePerNight,
      includedRate:
        Number(matched.includedRate ?? meta?.includedRate ?? primary?.includedRate ?? 0) ||
        matched.includedRate,
      priceDelta:
        Number(matched.priceDelta ?? meta?.priceDelta ?? primary?.perNight ?? 0) || 0,
    };
  }

  if (!name && !id) return null;

  return {
    id: id || name,
    hotelId: id || name,
    name,
    image: meta?.image || meta?.images?.[0] || primary?.hotel?.image || '',
    images: meta?.images || primary?.hotel?.images || [],
    starRating: meta?.starRating || primary?.hotel?.starRating || primary?.hotel?.starCategory || 0,
    location: meta?.location || primary?.hotel?.location || '',
    city,
    slug,
    startingPrice:
      Number(meta?.startingPrice ?? primary?.hotel?.startingPrice ?? primary?.absolutePerNight ?? 0) ||
      0,
    tierName: meta?.tierName || meta?.room?.name || primary?.room?.name || 'Deluxe',
    meals: meta?.meals || primary?.mealPlan?.label || primary?.meals || '',
    mealPlanKey: meta?.mealPlanKey || primary?.mealPlan?.key || null,
    mealPlan: meta?.mealPlan || primary?.mealPlan || null,
    room: meta?.room || primary?.room || null,
    priceDelta: Number(meta?.priceDelta ?? primary?.perNight ?? 0) || 0,
    absolutePerNight: Number(meta?.absolutePerNight ?? primary?.absolutePerNight ?? 0) || 0,
    includedRate: Number(meta?.includedRate ?? primary?.includedRate ?? 0) || 0,
    isDefault: true,
  };
}

export function stripHtml(input = '') {
  return String(input || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n')
    .replace(/<\/\s*div\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<\/\s*li\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

const SECTION_TONES = {
  package: {
    wrap: 'border-slate-200/90 bg-gradient-to-br from-slate-50 via-white to-teal-50/50 shadow-slate-200/50',
    bar: 'from-slate-800 to-teal-600',
    badge: 'bg-slate-900 text-white',
    iconWrap: 'bg-slate-900 text-teal-200',
  },
  route: {
    wrap: 'border-amber-200/90 bg-gradient-to-br from-amber-50 via-white to-orange-50 shadow-amber-100/60',
    bar: 'from-amber-500 to-orange-500',
    badge: 'bg-amber-500 text-white',
    iconWrap: 'bg-amber-100 text-amber-700',
  },
  travel: {
    wrap: 'border-sky-200/90 bg-gradient-to-br from-sky-50 via-white to-cyan-50 shadow-sky-100/60',
    bar: 'from-sky-500 to-cyan-500',
    badge: 'bg-sky-600 text-white',
    iconWrap: 'bg-sky-100 text-sky-700',
  },
  stay: {
    wrap: 'border-teal-200/90 bg-gradient-to-br from-teal-50 via-white to-emerald-50 shadow-teal-100/60',
    bar: 'from-teal-500 to-emerald-500',
    badge: 'bg-teal-600 text-white',
    iconWrap: 'bg-teal-100 text-teal-700',
  },
  itinerary: {
    wrap: 'border-teal-200/90 bg-gradient-to-br from-teal-50 via-cyan-50/40 to-white shadow-teal-100/60',
    bar: 'from-teal-500 to-emerald-500',
    badge: 'bg-teal-600 text-white',
    iconWrap: 'bg-teal-100 text-teal-700',
  },
  policy: {
    wrap: 'border-emerald-200/90 bg-gradient-to-br from-emerald-50 via-white to-orange-50 shadow-emerald-100/50',
    bar: 'from-emerald-500 to-orange-400',
    badge: 'bg-emerald-600 text-white',
    iconWrap: 'bg-emerald-100 text-emerald-700',
  },
  preview: {
    wrap: 'border-slate-300 bg-gradient-to-br from-slate-100 via-white to-teal-50 shadow-slate-200/50',
    bar: 'from-slate-700 to-teal-500',
    badge: 'bg-slate-800 text-white',
    iconWrap: 'bg-slate-200 text-slate-700',
  },
};

function SectionShell({
  tone = 'package',
  step,
  title,
  subtitle,
  icon: Icon,
  children,
  className,
  action,
}) {
  const t = SECTION_TONES[tone] || SECTION_TONES.package;
  return (
    <section
      className={cn(
        'rounded-2xl border overflow-hidden shadow-md relative',
        t.wrap,
        className
      )}
    >
      <div className={cn('h-1.5 w-full bg-gradient-to-r', t.bar)} />
      {(title || step) && (
        <div className="px-4 sm:px-5 pt-3.5 pb-3 sm:pt-4 flex flex-wrap items-start justify-between gap-2.5 sm:gap-3 border-b border-black/5">
          <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
            {Icon && (
              <span className={cn('w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0', t.iconWrap)}>
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
              </span>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {step != null && (
                  <span className={cn('text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md', t.badge)}>
                    Step {step}
                  </span>
                )}
                {title && <h3 className="text-sm sm:text-base font-bold text-slate-900">{title}</h3>}
              </div>
              {subtitle && <p className="text-[11px] sm:text-xs text-slate-600 mt-0.5 line-clamp-2">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function PackageDescription({ text, fallback }) {
  const [expanded, setExpanded] = useState(false);
  const plain = stripHtml(text) || fallback || '';
  if (!plain) return null;
  const needsMore = plain.length > 160 || plain.split(/\n/).length > 2;

  return (
    <div className="space-y-1 rounded-xl bg-white/70 border border-teal-100/80 px-3.5 py-3">
      <p className={cn('text-sm text-slate-700 leading-relaxed whitespace-pre-line', !expanded && 'line-clamp-2')}>
        {plain}
      </p>
      {needsMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-sm font-semibold text-teal-700 hover:text-teal-800"
        >
          {expanded ? 'Show less' : 'Read more >'}
        </button>
      )}
    </div>
  );
}

function ChangeBtn({ onClick, label = 'Change' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-emerald-400/70 bg-emerald-50 text-xs font-bold text-emerald-700 hover:bg-emerald-100 shrink-0 shadow-sm shadow-emerald-200/50"
    >
      <RefreshCw className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

export default function PackageBuilderWorkspace({
  lead,
  pkg,
  itinerary,
  onItineraryChange,
  inclusions,
  exclusions,
  onInclusionsChange,
  onExclusionsChange,
  dayWiseHotels,
  onDayWiseHotelsChange,
  selectedPackageCab,
  onCabChange,
  extraCabs = [],
  onExtraCabsChange,
  stayWithMattress = false,
  onStayWithMattressChange,
  hotelSeason = 'onSeason',
  onHotelSeasonChange,
  packageCabs = [],
  pricing,
  onPricingChange,
  nights,
  hotelDestination,
  draftQuote,
  onBack,
  onSaveDraft,
  onSubmit,
  saving,
  draftLabel,
  submitLabel,
  emailEndpoint = '/leads',
  needsResubmissionReason = false,
  resubmissionReason = '',
  onResubmissionReasonChange,
  disableSubmit = false,
  allowAskDiscount = false,
}) {
  const [destinations, setDestinations] = useState(() => parseDestinationStops(pkg, lead));
  const [showPreview, setShowPreview] = useState(false);
  const [autoPrint, setAutoPrint] = useState(false);
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [picker, setPicker] = useState(null);
  const [mobilePricingOpen, setMobilePricingOpen] = useState(false);
  const typeCfg = getPackageTypeConfig(pkg?.type || pkg?.category || 'family');
  const mobileTotal = Number(pricing?.total || 0);

  const emailQuotation = useMemo(() => {
    if (!draftQuote) return null;
    return {
      ...draftQuote,
      quoteNumber: draftQuote.quoteNumber,
      totalAmount: draftQuote.pricing?.total,
      grandTotal: draftQuote.pricing?.total,
      destination: draftQuote.package?.destination || pkg?.destination || lead?.destination,
      travelDate: lead?.travelDate,
      lead: draftQuote.lead?.name ? draftQuote.lead : (lead || draftQuote.lead),
      leadName: draftQuote.leadName || lead?.name || lead?.customerName || '',
    };
  }, [draftQuote, pkg?.destination, lead, lead?.destination, lead?.travelDate]);

  const previewQuote = useMemo(() => {
    if (!draftQuote) return null;
    const guestName = lead?.name || lead?.customerName || lead?.fullName || draftQuote.lead?.name || '';
    return {
      ...draftQuote,
      lead: {
        ...(typeof draftQuote.lead === 'object' && draftQuote.lead ? draftQuote.lead : {}),
        ...(lead && typeof lead === 'object' ? lead : {}),
        name: guestName,
        phone: lead?.phone || draftQuote.lead?.phone || '',
        travelDate:
          lead?.travelDate ||
          draftQuote.lead?.travelDate ||
          draftQuote.packageSnapshot?.travelDate ||
          draftQuote.package?.travelDate ||
          '',
        numberOfRooms:
          lead?.numberOfRooms ??
          draftQuote.lead?.numberOfRooms ??
          draftQuote.packageSnapshot?.numberOfRooms,
        roomsWithMattress:
          lead?.roomsWithMattress ??
          draftQuote.lead?.roomsWithMattress ??
          draftQuote.packageSnapshot?.roomsWithMattress,
      },
      travelDate:
        lead?.travelDate ||
        draftQuote.travelDate ||
        draftQuote.packageSnapshot?.travelDate ||
        '',
      leadName: guestName,
      packageSnapshot: {
        ...(draftQuote.packageSnapshot || draftQuote.package || {}),
        guestName,
        preparedFor: guestName,
      },
    };
  }, [draftQuote, lead]);

  const shareText = useMemo(
    () =>
      buildQuotationShareText({
        lead,
        pkg,
        pricing,
        nights,
        daysCount: itinerary?.length,
        quoteNumber: draftQuote?.quoteNumber,
      }),
    [lead, pkg, pricing, nights, itinerary?.length, draftQuote?.quoteNumber]
  );

  const handleShare = useCallback(async () => {
    if (!draftQuote) {
      toast.error('Build the package first, then share.');
      return;
    }
    const payload = {
      title: `HindHolidays quotation — ${pkg?.name || 'Package'}`,
      text: shareText,
    };
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(payload);
        toast.success('Quotation shared');
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(shareText);
      toast.success('Quotation copied — paste anywhere to share');
    } catch {
      toast.error('Unable to share. Please copy manually from Print preview.');
    }
  }, [draftQuote, pkg?.name, shareText]);

  const handleMail = useCallback(() => {
    if (!lead?._id) {
      toast.error('Select a lead first');
      return;
    }
    if (!draftQuote) {
      toast.error('Build the package first, then email.');
      return;
    }
    if (!lead.email) {
      toast.info('Lead has no email — you can type one in the composer');
    }
    setShowEmailComposer(true);
  }, [lead, draftQuote]);

  const handleWhatsApp = useCallback(() => {
    if (!lead?.phone) {
      toast.error('Lead phone number is missing');
      return;
    }
    if (!draftQuote) {
      toast.error('Build the package first, then send on WhatsApp.');
      return;
    }
    const opened = openWhatsApp(lead.phone, shareText);
    if (opened) {
      toast.success('Opening WhatsApp for the customer');
    } else {
      toast.error('Could not open WhatsApp');
    }
  }, [lead, draftQuote, shareText]);

  const handlePrint = useCallback(() => {
    if (!draftQuote) {
      toast.error('Build the package first, then print.');
      return;
    }
    setAutoPrint(true);
    setShowPreview(true);
  }, [draftQuote]);

  const durationLabel = useMemo(() => {
    if (pkg?.durationLabel) return pkg.durationLabel;
    const d = itinerary?.length || pkg?.duration || 0;
    const n = nights != null ? nights : Math.max(0, d - 1);
    return `${n}N / ${d}D`;
  }, [pkg, itinerary, nights]);

  const heroTags = useMemo(
    () => [
      { icon: Moon, label: durationLabel.includes('Night') ? durationLabel : `${nights ?? '—'} Nights / ${itinerary?.length || '—'} Days` },
      { icon: Sparkles, label: pkg?.isCustomizable !== false ? 'Customizable' : typeCfg.label },
      { icon: Car, label: selectedPackageCab?.name ? 'Private Transfer' : 'Transfer' },
      { icon: ShieldCheck, label: 'Best Price Guarantee' },
    ],
    [durationLabel, nights, itinerary, pkg, typeCfg, selectedPackageCab]
  );

  const staySummary = useMemo(() => {
    const hotels = (dayWiseHotels || [])
      .map((h) => h.hotel)
      .filter(Boolean)
      .concat((itinerary || []).map((d) => d.hotelMeta).filter(Boolean));
    const first = hotels[0];
    const stars = hotels
      .map((h) => Number(h.starRating || h.starCategory || 0))
      .filter((n) => n > 0);
    const avg = stars.length ? Math.round(stars.reduce((a, b) => a + b, 0) / stars.length) : 0;
    const name = first?.name || itinerary?.find((d) => d.hotel)?.hotel || 'Package Hotels';
    return {
      name: hotels.length > 1 ? 'Standard Hotels' : name,
      detail: avg ? `${avg}★ Category` : 'As per package',
      image: first?.image || first?.images?.[0] || '',
      count: hotels.length,
    };
  }, [dayWiseHotels, itinerary]);

  const stayOptions = useMemo(() => {
    const byId = new Map();
    for (const day of itinerary || []) {
      for (const opt of day.hotelOptions || []) {
        const key = opt.id || opt.hotelId || opt.name;
        if (key && !byId.has(key)) byId.set(key, { ...opt, _day: day });
      }
    }
    return [...byId.values()];
  }, [itinerary]);

  const metaRow = [
    { icon: Leaf, label: 'Trip Type', value: typeCfg.label || pkg?.packageType || 'Leisure', tone: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
    {
      icon: Users,
      label: 'Suitable For',
      value: lead ? `${lead.adults || 0}A / ${lead.children || 0}C` : 'Family, Couple',
      tone: 'bg-sky-50 border-sky-200 text-sky-700',
    },
    {
      icon: CalendarDays,
      label: 'Best Season',
      value: pkg?.bestSeason || 'Mar–Jun, Sep–Feb',
      tone: 'bg-amber-50 border-amber-200 text-amber-700',
    },
    {
      icon: MapPin,
      label: 'Pickup / Drop',
      value: destinations[0]?.name && destinations[destinations.length - 1]?.name
        ? `${destinations[0].name} → ${destinations[destinations.length - 1].name}`
        : pkg?.destination || 'Delhi',
      tone: 'bg-teal-50 border-teal-200 text-teal-700',
    },
  ];

  const buildHotelStayEntry = (day, option, roomSlot = 1) => {
    const roomName = option.room?.name || option.tierName || 'Standard Room';
    const packageMeal = mealPlanFromCode(
      option.mealPlan?.key ||
        option.mealPlanKey ||
        day.mealPlanKey ||
        day.hotelMeta?.mealPlanKey ||
        day.meals ||
        'map',
      'map'
    );
    const mealLabel = option.mealPlan?.label || option.meals || packageMeal.label;
    const mealKey =
      normalizeMealPlanKey(option.mealPlan?.key || option.mealPlanKey || mealLabel) ||
      packageMeal.key;
    const perNight = Number(option.perNight ?? option.priceDelta ?? 0);
    const absolutePerNight = Number(
      option.absolutePerNight ?? option.mealPlan?.absolutePrice ?? option.startingPrice ?? 0
    );
    const totalCost = Number(option.totalCost ?? perNight);
    const existingPrimary = (dayWiseHotels || []).find(
      (h) => h.day === day.day && Number(h.roomSlot || 1) === 1
    );
    const includedRate = Number(
      (roomSlot === 1 ? existingPrimary?.includedRate : 0) ??
        option.includedRate ??
        existingPrimary?.hotel?.startingPrice ??
        day?.hotelMeta?.startingPrice ??
        day?.hotelMeta?.includedRate ??
        absolutePerNight ??
        0
    );

    const existingSlot = (dayWiseHotels || []).find(
      (h) => h.day === day.day && Number(h.roomSlot || 1) === Number(roomSlot)
    );
    const extraBedRates = option.room?.extraBedRates || existingSlot?.room?.extraBedRates || null;
    const extraBedPerNight = resolveExtraBedNightRate(
      {
        room: { ...(option.room || {}), extraBedRates },
        extraBedPerNight: option.extraBedPerNight,
        extraBedRates,
      },
      mealKey
    );

    return {
      entry: {
        day: day.day,
        roomSlot,
        extraMattresses: clampExtraMattresses(existingSlot?.extraMattresses),
        hotel: {
          id: option.id || option.hotelId,
          name: option.name,
          image: option.image || option.thumbnailUrl || option.images?.[0] || '',
          thumbnailUrl: option.thumbnailUrl || option.image || option.images?.[0] || '',
          images: option.images?.length
            ? option.images
            : [option.image || option.thumbnailUrl].filter(Boolean),
          starCategory: option.starRating || 0,
          starRating: option.starRating || 0,
          location: option.location || '',
          city: option.city || '',
          slug: option.slug || '',
          startingPrice: absolutePerNight || option.startingPrice || 0,
        },
        room: {
          ...(option.room || { name: roomName }),
          extraBedRates,
          extraBedRate: extraBedPerNight,
        },
        mealPlan: option.mealPlan || { key: mealKey, label: mealLabel },
        extraBedRates,
        extraBedPerNight,
        perNight,
        absolutePerNight,
        includedRate,
        totalCost,
        nights: 1,
        fromPackage: true,
        hotelOptions: day.hotelOptions || [],
      },
      hotelMeta:
        roomSlot === 1
          ? {
              ...option,
              tierName: roomName,
              meals: mealLabel,
              mealPlanKey: mealKey,
              priceDelta: perNight,
              absolutePerNight,
              includedRate,
              extraBedPerNight,
              extraBedRates,
              startingPrice: absolutePerNight || option.startingPrice || 0,
              room: {
                ...(option.room || { name: roomName }),
                extraBedRates,
                extraBedRate: extraBedPerNight,
              },
              mealPlan: option.mealPlan || { key: mealKey, label: mealLabel },
            }
          : null,
      mealLabel,
    };
  };

  const handleReplaceHotel = (day, option) => {
    if (!day || !option) return;
    const { entry, hotelMeta, mealLabel } = buildHotelStayEntry(day, option, 1);

    const nextItinerary = itinerary.map((d) => {
      if (d.id !== day.id && d.day !== day.day) return d;
      if (!hotelMeta) return d;
      return {
        ...d,
        hotel: option.name,
        accommodation: option.name,
        meals: mealLabel,
        hotelMeta,
        hotelOptions: d.hotelOptions || [],
      };
    });
    onItineraryChange?.(nextItinerary);

    const extraLines = (dayWiseHotels || []).filter(
      (h) => h.day === day.day && Number(h.roomSlot || 1) > 1
    );
    const nextHotels = (dayWiseHotels || []).filter((h) => h.day !== day.day);
    nextHotels.push(entry, ...extraLines);
    onDayWiseHotelsChange?.(nextHotels.sort((a, b) => a.day - b.day || (a.roomSlot || 1) - (b.roomSlot || 1)));
    setPicker(null);
  };

  const handleAddHotelRoom = (day, option) => {
    if (!day || !option) return;
    const lockedHotel = resolveDayHotelForAddRoom(day, dayWiseHotels);
    const lockedOption = bindOptionToHotel(option, lockedHotel) || option;
    const overnight =
      Array.isArray(itinerary) && itinerary.length > 1 ? itinerary.slice(0, -1) : [day];
    const targetDays = overnight.length ? overnight : [day];
    let lines = Array.isArray(dayWiseHotels) ? [...dayWiseHotels] : [];
    const linesForClickDay = lines.filter((h) => Number(h.day) === Number(day.day));
    const nextSlot = Math.max(1, linesForClickDay.length) + 1;

    targetDays.forEach((d) => {
      const already = lines.some(
        (h) => Number(h.day) === Number(d.day) && Number(h.roomSlot || 1) === nextSlot
      );
      if (already) return;

      if (Number(d.day) === Number(day.day)) {
        const { entry } = buildHotelStayEntry(d, lockedOption, nextSlot);
        lines.push(entry);
        return;
      }

      // Mirror the added room onto other overnight nights at that day's hotel.
      const primary = lines.find(
        (h) => Number(h.day) === Number(d.day) && Number(h.roomSlot || 1) === 1
      );
      const dayHotel = primary?.hotel
        ? {
            id: primary.hotel.id,
            hotelId: primary.hotel.id || primary.hotel.hotelId,
            name: primary.hotel.name,
            image: primary.hotel.image,
            images: primary.hotel.images,
            starRating: primary.hotel.starRating,
            location: primary.hotel.location,
            city: primary.hotel.city,
            slug: primary.hotel.slug,
          }
        : lockedHotel;
      const dayOption = {
        ...bindOptionToHotel(lockedOption, dayHotel),
        room: lockedOption.room || primary?.room,
        mealPlan: lockedOption.mealPlan || primary?.mealPlan,
        absolutePerNight: lockedOption.absolutePerNight ?? primary?.absolutePerNight,
        perNight:
          lockedOption.absolutePerNight ??
          lockedOption.perNight ??
          primary?.absolutePerNight ??
          0,
        includedRate: 0,
        startingPrice: lockedOption.absolutePerNight ?? primary?.absolutePerNight,
      };
      const { entry } = buildHotelStayEntry(d, dayOption, nextSlot);
      lines.push(entry);
    });

    const nextHotels = lines.sort(
      (a, b) => a.day - b.day || (a.roomSlot || 1) - (b.roomSlot || 1)
    );
    onDayWiseHotelsChange?.(nextHotels);
    setPicker(null);
  };

  const handleReplaceExtraRoom = (day, option, roomSlot) => {
    if (!day || !option) return;
    const slot = Math.max(2, Number(roomSlot) || 2);
    const lockedHotel = resolveDayHotelForAddRoom(day, dayWiseHotels);
    const lockedOption = bindOptionToHotel(option, lockedHotel) || option;
    const { entry } = buildHotelStayEntry(day, lockedOption, slot);
    const nextHotels = (dayWiseHotels || [])
      .filter((h) => !(h.day === day.day && Number(h.roomSlot || 1) === slot))
      .concat(entry)
      .sort((a, b) => a.day - b.day || (a.roomSlot || 1) - (b.roomSlot || 1));
    onDayWiseHotelsChange?.(nextHotels);
    setPicker(null);
  };

  const handleRemoveHotel = (day) => {
    if (!day) return;
    const nextItinerary = itinerary.map((d) => {
      if (d.id !== day.id && d.day !== day.day) return d;
      return {
        ...d,
        hotel: '',
        accommodation: '',
        hotelMeta: null,
      };
    });
    onItineraryChange?.(nextItinerary);
    onDayWiseHotelsChange?.(
      (dayWiseHotels || []).filter((h) => Number(h.day) !== Number(day.day))
    );
  };

  const handleSetRoomMattresses = (day, roomSlot, count) => {
    if (!day) return;
    const slot = Math.max(1, Number(roomSlot) || 1);
    const extra = clampExtraMattresses(count);
    const overnight =
      Array.isArray(itinerary) && itinerary.length > 1 ? itinerary.slice(0, -1) : [day];
    const targetDays = overnight.length ? overnight : [day];
    let lines = Array.isArray(dayWiseHotels) ? [...dayWiseHotels] : [];

    targetDays.forEach((d) => {
      const idx = lines.findIndex(
        (h) => h.day === d.day && Number(h.roomSlot || 1) === slot
      );
      if (idx >= 0) {
        lines[idx] = { ...lines[idx], extraMattresses: extra };
        return;
      }
      if (slot !== 1) return;
      const option = d.hotelMeta || (d.hotel ? { name: d.hotel } : null);
      if (!option) return;
      const { entry } = buildHotelStayEntry(d, option, 1);
      entry.extraMattresses = extra;
      lines.push(entry);
    });

    onDayWiseHotelsChange?.(
      lines.sort((a, b) => a.day - b.day || (a.roomSlot || 1) - (b.roomSlot || 1))
    );
  };

  const handleSetMattressRate = (day, roomSlot, rate) => {
    if (!day) return;
    const slot = Math.max(1, Number(roomSlot) || 1);
    const nextRate = Math.max(0, Math.round(Number(rate) || 0));
    const overnight =
      Array.isArray(itinerary) && itinerary.length > 1 ? itinerary.slice(0, -1) : [day];
    const targetDays = overnight.length ? overnight : [day];
    let lines = Array.isArray(dayWiseHotels) ? [...dayWiseHotels] : [];

    targetDays.forEach((d) => {
      const idx = lines.findIndex(
        (h) => h.day === d.day && Number(h.roomSlot || 1) === slot
      );
      if (idx >= 0) {
        const prev = lines[idx];
        lines[idx] = {
          ...prev,
          extraBedPerNight: nextRate,
          extraBedRateManual: true,
          room: prev.room
            ? { ...prev.room, extraBedRate: nextRate, extraBedRateManual: true }
            : prev.room,
        };
        return;
      }
      if (slot !== 1) return;
      const option = d.hotelMeta || (d.hotel ? { name: d.hotel } : null);
      if (!option) return;
      const { entry } = buildHotelStayEntry(d, option, 1);
      entry.extraBedPerNight = nextRate;
      entry.extraBedRateManual = true;
      if (entry.room) {
        entry.room = { ...entry.room, extraBedRate: nextRate, extraBedRateManual: true };
      }
      lines.push(entry);
    });

    onDayWiseHotelsChange?.(
      lines.sort((a, b) => a.day - b.day || (a.roomSlot || 1) - (b.roomSlot || 1))
    );
  };


  const openCabPicker = (mode = 'change') => setPicker({ type: 'cab', cabMode: mode });
  const openStayPicker = () => setPicker({ type: 'hotel' });
  const openDayHotelPicker = (day, opts = {}) => setPicker({ type: 'hotel', day, ...opts });
  const openAddRoomPicker = (day) => {
    const lines = (dayWiseHotels || []).filter((h) => h.day === day.day).length;
    const initialHotel = resolveDayHotelForAddRoom(day, dayWiseHotels);
    if (!initialHotel) {
      // No hotel yet — select the hotel first, then add rooms.
      openDayHotelPicker(day);
      return;
    }
    openDayHotelPicker(day, {
      addRoom: true,
      roomSlot: lines + 1,
      initialHotel,
      lockHotel: true,
    });
  };

  const openChangeExtraRoomPicker = (day, roomSlot) => {
    const slot = Math.max(2, Number(roomSlot) || 2);
    const initialHotel = resolveDayHotelForAddRoom(day, dayWiseHotels);
    if (!initialHotel) {
      openDayHotelPicker(day);
      return;
    }
    openDayHotelPicker(day, {
      replaceRoomSlot: slot,
      roomSlot: slot,
      initialHotel,
      lockHotel: true,
    });
  };

  const selectCab = (cab) => {
    if (picker?.cabMode === 'add') {
      onExtraCabsChange?.([...(extraCabs || []), cab]);
    } else {
      onCabChange?.(cab);
    }
    setPicker(null);
  };

  const applyStayOption = (opt) => {
    if (picker?.type === 'hotel' && picker.day) {
      if (picker.replaceRoomSlot) {
        handleReplaceExtraRoom(picker.day, opt, picker.replaceRoomSlot);
      } else if (picker.addRoom) {
        handleAddHotelRoom(picker.day, opt);
      } else {
        handleReplaceHotel(picker.day, opt);
      }
      return;
    }
    if (!opt?._day) return;
    handleReplaceHotel(opt._day, opt);
  };

  const hotelDrawerOptions = useMemo(() => {
    if (picker?.type !== 'hotel') return [];
    if (picker.day) return picker.day.hotelOptions || [];
    return stayOptions;
  }, [picker, stayOptions]);

  const hotelSelectedId = useMemo(() => {
    if (picker?.type !== 'hotel') return null;
    if (picker.day) {
      const meta = picker.day.hotelMeta;
      return meta?.id || meta?.hotelId || meta?.name || picker.day.hotel || null;
    }
    const firstMeta = itinerary?.find((d) => d.hotelMeta)?.hotelMeta;
    return firstMeta?.id || firstMeta?.hotelId || firstMeta?.name || null;
  }, [picker, itinerary]);

  const hotelBasePrice = useMemo(() => {
    // Absolute nightly rate of the current selection (for "vs current" UI), not the cost delta.
    const pickAbsolute = (meta, dayHotel) => {
      const absolute =
        Number(dayHotel?.absolutePerNight ?? meta?.absolutePerNight ?? 0) || 0;
      const included =
        Number(
          dayHotel?.includedRate ??
            dayHotel?.hotel?.startingPrice ??
            meta?.startingPrice ??
            meta?.includedRate ??
            0
        ) || 0;
      if (absolute > 0) return absolute;
      if (included > 0) return included;
      return 0;
    };
    if (picker?.type === 'hotel' && picker.day) {
      const meta = picker.day.hotelMeta;
      const dayHotel = (dayWiseHotels || []).find((h) => h.day === picker.day.day);
      return pickAbsolute(meta, dayHotel);
    }
    const firstMeta = itinerary?.find((d) => d.hotelMeta)?.hotelMeta;
    const firstDayHotel = (dayWiseHotels || [])[0];
    return pickAbsolute(firstMeta, firstDayHotel);
  }, [picker, itinerary, dayWiseHotels]);

  const cabBasePrice = Number(
    selectedPackageCab?.absoluteFare ??
      selectedPackageCab?.totalAmount ??
      selectedPackageCab?.cost ??
      selectedPackageCab?.priceDelta ??
      0
  ) || 0;

  const cabSelectedId =
    selectedPackageCab?.id || selectedPackageCab?.packageCabId || selectedPackageCab?.name || null;

  return (
    <div className="relative space-y-4 rounded-none bg-[#f1f5f9] p-0 pb-36 sm:space-y-5 sm:rounded-[28px] sm:bg-gradient-to-b sm:from-slate-100 sm:via-teal-50/30 sm:to-orange-50/20 sm:p-3 sm:pb-4 xl:pb-4 -mx-0 sm:-mx-1">
      {/* Mobile sticky top bar */}
      <div className="sticky top-0 z-30 -mx-0 border-b border-slate-200/80 bg-slate-950/95 px-3 py-2.5 backdrop-blur-md xl:hidden">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to packages"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-teal-300">Create Quotation</p>
            <p className="truncate text-sm font-bold text-white">{lead?.name || 'Customer'}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl bg-teal-400 px-3 text-xs font-bold text-slate-950 shadow-sm"
          >
            <FileText className="h-3.5 w-3.5" />
            PDF
          </button>
        </div>
      </div>

      {/* Desktop header */}
      <div className="hidden items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-950 px-4 py-2.5 shadow-sm xl:flex">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-2.5 text-xs font-semibold text-white hover:bg-white/20"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-bold text-white">Create Quotation</h1>
            <p className="truncate text-[11px] text-slate-400">
              For <span className="text-teal-300">{lead?.name || 'your customer'}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onSaveDraft}
            className="h-8 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/20 disabled:opacity-60"
          >
            {draftLabel || 'Save as Draft'}
          </button>
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-teal-400 px-3 text-xs font-bold text-slate-950 hover:bg-teal-300"
          >
            <FileText className="w-3.5 h-3.5" />
            PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 px-3 sm:gap-5 sm:px-0 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4 sm:space-y-5">
          <SectionShell
            tone="package"
            step={1}
            title="Package Overview"
            subtitle="Cover, highlights and trip meta"
            icon={Sparkles}
          >
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="relative h-40 overflow-hidden bg-slate-200 sm:h-56">
                {pkg?.coverImage ? (
                  <img src={pkg.coverImage} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-teal-500 via-slate-700 to-orange-500" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/25 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 space-y-2 p-3.5 sm:space-y-2.5 sm:p-5">
                  <span className="inline-flex rounded-md bg-teal-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-950 shadow-sm">
                    Package Preview
                  </span>
                  <h2 className="text-lg font-bold leading-snug text-white drop-shadow-sm sm:text-2xl">
                    {pkg?.name}
                    {durationLabel ? ` — ${durationLabel}` : ''}
                  </h2>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {heroTags.map(({ icon: Icon, label }) => (
                      <span
                        key={label}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/25 bg-white/20 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur sm:gap-1.5 sm:px-2.5 sm:text-[11px]"
                      >
                        <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-3 bg-gradient-to-b from-teal-50/40 to-white px-3.5 py-3.5 sm:space-y-4 sm:px-5 sm:py-4">
                <PackageDescription
                  text={pkg?.description || pkg?.shortDescription}
                  fallback={`Experience ${pkg?.destination || 'the hills'} with curated stays, private transfers and handpicked sightseeing — fully customisable for your guest.`}
                />

                <div className="grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4">
                  {metaRow.map(({ icon: Icon, label, value, tone }) => (
                    <div key={label} className={cn('rounded-xl border px-2.5 py-2 sm:px-3 sm:py-2.5', tone)}>
                      <p className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide opacity-80 sm:text-[10px]">
                        <Icon className="h-3 w-3" />
                        {label}
                      </p>
                      <p className="mt-1 truncate text-xs font-bold text-slate-900 sm:text-sm">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SectionShell>

          {/* User-requested UI simplification:
              Remove Destination Flow, Transport and Stay blocks from the screen.
              Hotels/cab are still pre-seeded and used for Day-wise Itinerary + pricing. */}

          <SectionShell
            tone="itinerary"
            step={2}
            title="Day-wise Itinerary"
            subtitle="Each day has its own color strip — hotels, cab & activities"
            icon={CalendarDays}
          >
            {typeof onHotelSeasonChange === 'function' && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-violet-600">
                    Hotel rate season
                  </p>
                  <p className="text-[11px] text-slate-600">
                    Switch On / Off season prices for all hotel nights
                  </p>
                </div>
                <div className="inline-flex rounded-xl border border-violet-200 bg-white p-0.5 shadow-sm">
                  <button
                    type="button"
                    onClick={() => onHotelSeasonChange('onSeason')}
                    className={cn(
                      'h-8 rounded-[10px] px-3 text-[11px] font-bold transition-colors',
                      hotelSeason !== 'offSeason'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    On Season
                  </button>
                  <button
                    type="button"
                    onClick={() => onHotelSeasonChange('offSeason')}
                    className={cn(
                      'h-8 rounded-[10px] px-3 text-[11px] font-bold transition-colors',
                      hotelSeason === 'offSeason'
                        ? 'bg-amber-500 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    Off Season
                  </button>
                </div>
              </div>
            )}
            <PackageBuilderDayTimeline
              itinerary={itinerary}
              dayWiseHotels={dayWiseHotels}
              packageCab={selectedPackageCab}
              hotelSeason={hotelSeason}
              onChange={onItineraryChange}
              onOpenHotelPicker={openDayHotelPicker}
              onAddHotelRoom={openAddRoomPicker}
              onChangeExtraRoom={openChangeExtraRoomPicker}
              onChangeRoomMattresses={handleSetRoomMattresses}
              onChangeMattressRate={handleSetMattressRate}
              onRemoveHotel={handleRemoveHotel}
              onChangeCab={() => openCabPicker('change')}
              onAddCab={() => openCabPicker('add')}
              onCabFareChange={(value) => {
                if (!selectedPackageCab) return;
                const fare = Math.max(0, Number(value) || 0);
                onCabChange?.({
                  ...selectedPackageCab,
                  fareOverride: fare,
                  absoluteFare: fare,
                  totalAmount: fare,
                });
              }}
              onExtraCabFareChange={(index, value) => {
                const fare = Math.max(0, Number(value) || 0);
                const next = (extraCabs || []).map((cab, i) =>
                  i === index
                    ? { ...cab, fareOverride: fare, absoluteFare: fare, totalAmount: fare }
                    : cab
                );
                onExtraCabsChange?.(next);
              }}
              onRemoveExtraCab={(index) => {
                onExtraCabsChange?.((extraCabs || []).filter((_, i) => i !== index));
              }}
              extraCabs={extraCabs}
              destination={hotelDestination || pkg?.destination || 'Destination'}
              embedded
              lead={lead}
              party={pricing?.party}
            />
          </SectionShell>

          <SectionShell
            tone="policy"
            step={3}
            title="Inclusions & Exclusions"
            subtitle="Green = included · Rose = not included"
            icon={ListChecks}
          >
            <InclusionExclusionEditor
              inclusions={inclusions}
              exclusions={exclusions}
              onChangeInclusions={onInclusionsChange}
              onChangeExclusions={onExclusionsChange}
            />
          </SectionShell>
        </div>

        <div className="hidden xl:block">
          <PackageBuilderPriceSidebar
            lead={lead}
            pkg={pkg}
            pricing={pricing}
            onPricingChange={onPricingChange}
            nights={nights}
            daysCount={itinerary?.length}
            onSaveDraft={onSaveDraft}
            onSubmit={onSubmit}
            onShare={handleShare}
            onMail={handleMail}
            onWhatsApp={handleWhatsApp}
            onPrint={handlePrint}
            saving={saving}
            draftLabel={draftLabel}
            submitLabel={submitLabel}
            needsResubmissionReason={needsResubmissionReason}
            resubmissionReason={resubmissionReason}
            onResubmissionReasonChange={onResubmissionReasonChange}
            disableSubmit={disableSubmit}
            allowAskDiscount={allowAskDiscount}
          />
        </div>
      </div>

      <MobileQuotationActionBar
        total={mobileTotal}
        saving={saving}
        draftLabel={draftLabel || 'Draft'}
        submitLabel={submitLabel || 'Submit'}
        onOpenPricing={() => setMobilePricingOpen(true)}
        onSaveDraft={onSaveDraft}
        onSubmit={onSubmit}
        needsResubmissionReason={needsResubmissionReason}
        resubmissionReason={resubmissionReason}
        onResubmissionReasonChange={onResubmissionReasonChange}
        disableSubmit={disableSubmit}
      />

      {mobilePricingOpen ? (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/45"
            aria-label="Close pricing"
            onClick={() => setMobilePricingOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-[#f7f7fb] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur">
              <div>
                <p className="text-sm font-bold text-slate-900">Package Pricing</p>
                <p className="text-[11px] text-slate-500">Adjust GST, markup & ask for discount</p>
              </div>
              <button
                type="button"
                onClick={() => setMobilePricingOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <PackageBuilderPriceSidebar
                lead={lead}
                pkg={pkg}
                pricing={pricing}
                onPricingChange={onPricingChange}
                nights={nights}
                daysCount={itinerary?.length}
                onSaveDraft={onSaveDraft}
                onSubmit={() => {
                  setMobilePricingOpen(false);
                  onSubmit?.();
                }}
                onShare={handleShare}
                onMail={handleMail}
                onWhatsApp={handleWhatsApp}
                onPrint={handlePrint}
                saving={saving}
                draftLabel={draftLabel}
                submitLabel={submitLabel}
                needsResubmissionReason={needsResubmissionReason}
                resubmissionReason={resubmissionReason}
                onResubmissionReasonChange={onResubmissionReasonChange}
                disableSubmit={disableSubmit}
                allowAskDiscount={allowAskDiscount}
                hideActions
                className="!static"
              />
              <button
                type="button"
                onClick={() => setMobilePricingOpen(false)}
                className="w-full h-11 rounded-xl bg-teal-600 text-sm font-bold text-white shadow-md"
              >
                Done · {formatINR(mobileTotal)}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <QuotationPdfOverlay
        quote={previewQuote}
        open={showPreview && !!previewQuote}
        autoPrint={autoPrint}
        onAutoPrintDone={() => setAutoPrint(false)}
        onClose={() => {
          setShowPreview(false);
          setAutoPrint(false);
        }}
      />

      <EmailComposerModal
        open={showEmailComposer}
        onClose={() => setShowEmailComposer(false)}
        lead={lead}
        leadId={lead?._id}
        emailEndpoint={emailEndpoint}
        quotation={emailQuotation}
        defaultCategory="quotation"
        onSent={() => toast.success('Quotation email queued for the customer')}
      />

      <PackageResourcePickerDrawer
        open={picker?.type === 'cab'}
        onClose={() => setPicker(null)}
        mode="cab"
        title={picker?.cabMode === 'add' ? 'Add another cab' : 'Choose your cab'}
        subtitle={
          picker?.cabMode === 'add'
            ? 'Select an additional cab for extra travelers'
            : 'Prices show +extra or −savings vs your current cab'
        }
        options={packageCabs}
        selectedId={cabSelectedId}
        onSelect={selectCab}
        basePrice={cabBasePrice}
        lead={lead}
        pkg={pkg}
      />

      <PackageResourcePickerDrawer
        open={picker?.type === 'hotel'}
        onClose={() => setPicker(null)}
        mode="hotel"
        title={
          picker?.replaceRoomSlot
            ? `Change room · Day ${picker.day.day} · Room ${picker.replaceRoomSlot}`
            : picker?.addRoom
              ? `Add room · Day ${picker.day.day} · Room ${picker.roomSlot || 2}`
              : picker?.day
                ? `Change hotel · Day ${picker.day.day}`
                : 'Choose your hotel'
        }
        subtitle={
          picker?.replaceRoomSlot || picker?.addRoom
            ? picker?.initialHotel?.name
              ? `Rooms at ${picker.initialHotel.name} — pick type & meal plan`
              : 'Pick room type & meal plan for this night'
            : picker?.day
              ? 'Hotel → Room → Meal plan for this night'
              : 'Select hotel, then room & meal plan with prices'
        }
        options={hotelDrawerOptions}
        selectedId={hotelSelectedId}
        onSelect={applyStayOption}
        showDayBadge={!picker?.day}
        nights={picker?.day?.stayNights || nights || 1}
        destination={hotelDestination || pkg?.destination || ''}
        basePrice={hotelBasePrice}
        hotelSeason={hotelSeason}
        onHotelSeasonChange={onHotelSeasonChange}
        initialHotel={
          picker?.addRoom || picker?.replaceRoomSlot ? picker.initialHotel || null : null
        }
        lockHotel={Boolean(
          (picker?.addRoom || picker?.replaceRoomSlot) && picker?.initialHotel
        )}
        defaultMealPlanKey={
          normalizeMealPlanKey(lead?.mealPlan || lead?.mealPreference) ||
          picker?.day?.mealPlanKey ||
          picker?.day?.hotelMeta?.mealPlanKey ||
          normalizeMealPlanKey(picker?.day?.meals || picker?.day?.hotelMeta?.meals) ||
          'map'
        }
        checkIn={
          toYmd(lead?.travelDate)
            ? shiftYmd(toYmd(lead.travelDate), Math.max(0, Number(picker?.day?.day || 1) - 1))
            : ''
        }
        checkOut={
          toYmd(lead?.travelDate)
            ? shiftYmd(
                toYmd(lead.travelDate),
                Math.max(0, Number(picker?.day?.day || 1) - 1) +
                  Math.max(1, Number(picker?.day?.stayNights || nights || 1))
              )
            : ''
        }
        roomCount={lead?.numberOfRooms || 1}
        adults={lead?.adults || 2}
      />
    </div>
  );
}
