import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BedDouble,
  Building2,
  Check,
  ChevronRight,
  ImageOff,
  Loader2,
  MapPin,
  Search,
  Users,
  UtensilsCrossed,
  Wifi,
} from 'lucide-react';
import API from '../../api/axios';
import { Button } from '../ui/button';
import { formatINR } from './quotationUtils';
import {
  ensureMealPlanOptions,
  mealPlanNightlyRate,
  pickPreferredMealPlan,
} from '../../lib/mealPlanDefaults';
import {
  mapLocalHotelToCatalogOption,
  mapLocalHotelToCatalogDetail,
} from '../../lib/localHotelCatalog';
import {
  enrichHotelsWithSelectionMeta,
  recordHotelSelection,
  sortHotelsByRecent,
} from '../../lib/recentHotelSelections';
import { cn } from '../../lib/utils';

const SUB_STEPS = [
  { key: 'hotel', label: 'Hotel', icon: Building2 },
  { key: 'room', label: 'Room', icon: BedDouble },
  { key: 'meal', label: 'Meal Plan', icon: UtensilsCrossed },
];

const AMENITY_ICONS = {
  wifi: Wifi,
};

function pickImageUrl(...candidates) {
  for (const src of candidates) {
    if (typeof src === 'string' && src.trim()) return src.trim();
  }
  return '';
}

function ImageCard({ src, alt, className, fallbackIcon: FallbackIcon = ImageOff }) {
  const [failed, setFailed] = useState(false);
  const url = pickImageUrl(src);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (!url || failed) {
    return (
      <div
        className={cn(
          'bg-gradient-to-br from-surface-elevated to-surface-muted flex flex-col items-center justify-center text-content-muted gap-1',
          className
        )}
      >
        <FallbackIcon className="w-6 h-6 opacity-40" />
        <span className="text-[10px] font-medium opacity-60">No photo</span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className={cn('object-cover bg-surface-elevated', className)}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function SubStepBar({ subStep, value }) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-2xl bg-surface-elevated/80 border border-subtle">
      {SUB_STEPS.map(({ key, label, icon: Icon }, index) => {
        const active = subStep === key;
        const done =
          (key === 'hotel' && value?.hotel) ||
          (key === 'room' && value?.room) ||
          (key === 'meal' && value?.mealPlan);
        return (
          <div key={key} className="flex items-center flex-1 min-w-0">
            <div
              className={cn(
                'flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-[11px] font-semibold flex-1 min-w-0 transition-all',
                active && 'bg-amber-500 text-white shadow-sm shadow-amber-500/25',
                !active && done && 'text-emerald-700 bg-emerald-500/10',
                !active && !done && 'text-content-muted'
              )}
            >
              {done && !active ? (
                <Check className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Icon className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate hidden sm:inline">{label}</span>
            </div>
            {index < SUB_STEPS.length - 1 && (
              <ChevronRight className="w-3.5 h-3.5 text-content-muted/40 shrink-0 mx-0.5" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function HotelListRow({ hotel, selected, disabled, onSelect }) {
  const thumb = pickImageUrl(hotel.thumbnailUrl, hotel.images?.[0]);
  const stars = Math.min(5, Math.max(0, Math.round(Number(hotel.starCategory || hotel.rating) || 0)));

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(hotel)}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
        selected
          ? 'border-amber-500/50 bg-amber-500/10 ring-2 ring-amber-500/20'
          : 'border-subtle hover:bg-surface-elevated'
      )}
    >
      {thumb ? (
        <img src={thumb} alt="" className="h-14 w-14 rounded-lg object-cover border border-subtle shrink-0" loading="lazy" />
      ) : (
        <div className="h-14 w-14 rounded-lg bg-surface-elevated border border-subtle shrink-0 flex items-center justify-center">
          <Building2 className="w-5 h-5 text-content-muted/50" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm line-clamp-1">{hotel.name}</p>
          {hotel.isPopular && (
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-md bg-sky-500/10 text-sky-700">
              Popular
            </span>
          )}
          {stars > 0 && (
            <span className="text-[10px] font-semibold text-amber-700 bg-amber-500/10 px-1.5 py-0.5 rounded-md">
              {stars}★
            </span>
          )}
          {hotel.category && (
            <span className="text-[10px] font-semibold uppercase text-content-muted">{hotel.category}</span>
          )}
        </div>
        <p className="text-xs text-content-muted mt-0.5 line-clamp-1 flex items-center gap-1">
          <MapPin className="w-3 h-3 shrink-0" />
          {hotel.location || hotel.city}
        </p>
        {(hotel.amenities || []).length > 0 && (
          <p className="text-[10px] text-content-muted mt-1 line-clamp-1 capitalize">
            {(hotel.amenities || []).slice(0, 3).map((a) => a.replace(/_/g, ' ')).join(' · ')}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        {hotel.startingPrice > 0 && (
          <p className="text-sm font-bold text-amber-700">from {formatINR(hotel.startingPrice)}</p>
        )}
        {selected && <Check className="w-4 h-4 text-amber-600 ml-auto mt-1" />}
      </div>
    </button>
  );
}

function RoomCard({ room, hotel, selected, onSelect }) {
  const images = room.images?.length ? room.images : hotel?.images?.length ? hotel.images : [];
  const [imageIndex, setImageIndex] = useState(0);
  const currentImage = images[imageIndex] || pickImageUrl(hotel?.thumbnailUrl);

  useEffect(() => {
    setImageIndex(0);
  }, [room.id]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(room)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(room);
        }
      }}
      className={cn(
        'w-full rounded-2xl border text-left overflow-hidden transition-all duration-200 cursor-pointer',
        'hover:shadow-md hover:border-amber-400/40',
        selected
          ? 'border-amber-500 bg-amber-500/5 ring-2 ring-amber-500/25 shadow-md'
          : 'border-subtle bg-surface-base'
      )}
    >
      <div className="flex flex-col sm:flex-row">
        <div className="relative sm:w-44 md:w-52 shrink-0">
          <ImageCard
            src={currentImage}
            alt={room.name}
            className="w-full h-36 sm:h-full sm:min-h-[140px]"
            fallbackIcon={BedDouble}
          />
          {images.length > 1 && (
            <>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                {images.slice(0, 5).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setImageIndex(i);
                    }}
                    className={cn(
                      'w-1.5 h-1.5 rounded-full transition-all',
                      i === imageIndex ? 'bg-white scale-125' : 'bg-white/50 hover:bg-white/80'
                    )}
                    aria-label={`Show image ${i + 1}`}
                  />
                ))}
              </div>
              <span className="absolute top-2 right-2 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-black/50 text-white">
                {images.length} photos
              </span>
            </>
          )}
        </div>
        <div className="flex-1 p-4 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold text-base">{room.name}</p>
            {selected && (
              <span className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-500/15 px-2 py-0.5 rounded-full">
                <Check className="w-3 h-3" /> Selected
              </span>
            )}
          </div>
          {room.description && (
            <p className="text-xs text-content-muted mt-1.5 line-clamp-2 leading-relaxed">{room.description}</p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {room.bedType && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg bg-surface-elevated text-content-secondary">
                <BedDouble className="w-3 h-3" /> {room.bedType}
              </span>
            )}
            {room.maxOccupancy && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg bg-surface-elevated text-content-secondary">
                <Users className="w-3 h-3" /> Max {room.maxOccupancy}
              </span>
            )}
            {room.sizeSqft && (
              <span className="text-[10px] font-medium px-2 py-1 rounded-lg bg-surface-elevated text-content-secondary">
                {room.sizeSqft} sq ft
              </span>
            )}
          </div>
          {(room.amenities || []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {room.amenities.slice(0, 4).map((item) => {
                const Icon = AMENITY_ICONS[item.toLowerCase()] || null;
                return (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1 text-[10px] text-content-muted capitalize"
                  >
                    {Icon && <Icon className="w-3 h-3" />}
                    {item.replace(/_/g, ' ')}
                  </span>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {(Number(room.rates?.onSeason?.map || room.rates?.map || 0) > 0) && (
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                On Season Price {formatINR(Number(room.rates?.onSeason?.map || room.rates?.map || 0))}
              </span>
            )}
            {(Number(room.rates?.offSeason?.map || 0) > 0) && (
              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                Off Season Price {formatINR(Number(room.rates?.offSeason?.map || 0))}
              </span>
            )}
            {(Number(room.extraBedRate || room.extraBedRates?.map || 0) > 0) && (
              <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-800">
                Extra Mattress {formatINR(Number(room.extraBedRate || room.extraBedRates?.map || 0))}/n
              </span>
            )}
          </div>
          <p className="text-base font-bold text-amber-700 mt-3">
            {formatINR(room.pricePerNight)}
            <span className="text-xs font-normal text-content-muted"> / night (On Season Price)</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function SelectedHotelBanner({ hotel }) {
  if (!hotel) return null;
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-transparent">
      <ImageCard
        src={pickImageUrl(hotel.thumbnailUrl, hotel.images?.[0])}
        alt={hotel.name}
        className="w-14 h-14 rounded-lg shrink-0"
        fallbackIcon={Building2}
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-amber-800/80 uppercase tracking-wide">Selected hotel</p>
        <p className="font-semibold truncate">{hotel.name}</p>
        <p className="text-xs text-content-muted truncate">{hotel.location}</p>
      </div>
    </div>
  );
}

export default function CatalogHotelSelector({
  destination,
  value,
  onChange,
  nights = 1,
  preferredMealPlanKey = 'map',
  checkIn = '',
  checkOut = '',
  roomCount = 1,
  adults = 2,
}) {
  const [subStep, setSubStep] = useState('hotel');
  const [hotels, setHotels] = useState([]);
  const [loadingHotels, setLoadingHotels] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [hotelDetail, setHotelDetail] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [starFilter, setStarFilter] = useState(0);
  const [selectionTick, setSelectionTick] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setLoadingHotels(true);
    API.get('/hotels', {
      params: {
        status: 'active',
        ...(destination ? { destination } : {}),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      },
      skipErrorToast: true,
    })
      .then((res) => {
        if (cancelled) return;
        let list = Array.isArray(res.data) ? res.data : [];
        if (starFilter > 0) {
          list = list.filter((h) => Math.round(Number(h.starRating) || 0) === starFilter);
        }
        setHotels(list.map(mapLocalHotelToCatalogOption).filter(Boolean));
      })
      .catch(() => {
        if (!cancelled) setHotels([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingHotels(false);
      });
    return () => {
      cancelled = true;
    };
  }, [destination, debouncedSearch, starFilter]);

  const rankedHotels = useMemo(
    () => enrichHotelsWithSelectionMeta(sortHotelsByRecent(hotels)),
    // selectionTick refreshes Popular / order after a pick
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hotels, selectionTick]
  );

  const selectHotel = async (hotel) => {
    recordHotelSelection(hotel);
    setSelectionTick((n) => n + 1);
    setLoadingDetail(true);
    setHotelDetail(null);
    onChange(null);
    try {
      const localId = hotel.localHotelId || hotel._id || hotel.id;
      const res = await API.get(`/hotels/${localId}`, { skipErrorToast: true });
      const detail = mapLocalHotelToCatalogDetail(res.data);
      setHotelDetail(detail);
      onChange({ hotel: detail, room: null, mealPlan: null, nights, totalCost: 0 });
      setSubStep('room');
    } catch {
      setHotelDetail(hotel);
      onChange({ hotel, room: null, mealPlan: null, nights, totalCost: 0 });
      setSubStep('room');
    } finally {
      setLoadingDetail(false);
    }
  };

  const selectRoom = (room) => {
    const hotel = hotelDetail || value?.hotel;
    const plans = ensureMealPlanOptions(room);
    const preferred = pickPreferredMealPlan(plans, room, preferredMealPlanKey || 'map');
    const perNight = mealPlanNightlyRate(preferred, room);
    const totalCost = perNight * Math.max(1, nights);
    onChange({
      hotel,
      room: { ...room, mealPlanOptions: plans },
      mealPlan: {
        ...preferred,
        absolutePrice: perNight,
      },
      nights,
      perNight,
      absolutePerNight: perNight,
      totalCost,
    });
    setSubStep('meal');
  };

  const selectMealPlan = (mealPlan) => {
    const hotel = hotelDetail || value?.hotel;
    const room = value?.room;
    const perNight = mealPlanNightlyRate(mealPlan, room);
    const totalCost = perNight * Math.max(1, nights);
    onChange({
      hotel,
      room,
      mealPlan: { ...mealPlan, absolutePrice: perNight },
      nights,
      perNight,
      absolutePerNight: perNight,
      totalCost,
    });
  };

  const activeHotel = hotelDetail || value?.hotel;
  const rooms = activeHotel?.rooms || [];

  return (
    <div className="space-y-5">
      <SubStepBar subStep={subStep} value={value} />

      {subStep !== 'hotel' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl gap-1.5"
          onClick={() => setSubStep(subStep === 'meal' ? 'room' : 'hotel')}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to {subStep === 'meal' ? 'Rooms' : 'Hotels'}
        </Button>
      )}

      {subStep === 'hotel' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-subtle bg-gradient-to-br from-amber-500/5 to-transparent p-4 space-y-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Select Hotel</h2>
              <p className="text-sm text-content-muted mt-1">
                {destination
                  ? `Hotels in ${destination} — search by name or location`
                  : 'Choose a hotel for this quotation'}
              </p>
            </div>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search hotel name, city, category..."
                className="w-full h-10 pl-10 pr-4 rounded-xl border border-subtle bg-white text-sm text-content-primary placeholder:text-content-muted outline-none focus:ring-2 focus:ring-amber-500/25 focus:border-amber-500/40 transition-all"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[0, 1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setStarFilter(star)}
                  className={`h-8 px-2.5 rounded-lg border text-[11px] font-semibold transition-colors ${
                    starFilter === star
                      ? 'border-amber-400 bg-amber-50 text-amber-800'
                      : 'border-subtle bg-white text-content-muted hover:border-amber-300'
                  }`}
                >
                  {star === 0 ? 'All' : `${star}★`}
                </button>
              ))}
            </div>
          </div>

          {loadingHotels ? (
            <div className="flex flex-col items-center justify-center py-16 text-content-muted gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
              <p className="text-sm">{debouncedSearch ? 'Searching hotels...' : 'Finding hotels...'}</p>
            </div>
          ) : rankedHotels.length === 0 ? (
            <div className="text-center py-16 rounded-2xl border border-dashed border-subtle">
              <Building2 className="w-10 h-10 mx-auto text-content-muted/40 mb-3" />
              <p className="text-sm font-medium">
                {debouncedSearch ? `No hotels match "${debouncedSearch}"` : 'No hotels found'}
              </p>
              <p className="text-xs text-content-muted mt-1">
                {debouncedSearch
                  ? 'Try a different search term or clear the search.'
                  : 'Try a different destination or check the HindHolidays catalog.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {rankedHotels.map((hotel) => (
                <HotelListRow
                  key={hotel.id}
                  hotel={hotel}
                  selected={value?.hotel?.id === hotel.id}
                  disabled={loadingDetail}
                  onSelect={selectHotel}
                />
              ))}
            </div>
          )}

          {loadingDetail && (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-amber-700 bg-amber-500/10 rounded-xl">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading rooms & photos...
            </div>
          )}
        </div>
      )}

      {subStep === 'room' && activeHotel && (
        <div className="space-y-4">
          <SelectedHotelBanner hotel={activeHotel} />
          <div>
            <h2 className="text-xl font-bold tracking-tight">Select Room</h2>
            <p className="text-sm text-content-muted mt-1">
              {rooms.length} room type{rooms.length !== 1 ? 's' : ''} available · {nights} night{nights !== 1 ? 's' : ''}
            </p>
          </div>

          {rooms.length === 0 ? (
            <div className="text-center py-16 rounded-2xl border border-dashed border-subtle">
              <BedDouble className="w-10 h-10 mx-auto text-content-muted/40 mb-3" />
              <p className="text-sm font-medium">No rooms available</p>
              <p className="text-xs text-content-muted mt-1">This hotel has no bookable rooms right now.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
              {rooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  hotel={activeHotel}
                  selected={value?.room?.id === room.id}
                  onSelect={selectRoom}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {subStep === 'meal' && value?.room && (
        <div className="space-y-4">
          <SelectedHotelBanner hotel={activeHotel} />
          <div className="rounded-xl border border-subtle p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-content-muted">Room</p>
              <p className="font-semibold">{value.room.name}</p>
            </div>
            <p className="text-sm font-bold text-amber-700">{formatINR(value.room.pricePerNight)}/night</p>
          </div>

          <div>
            <h2 className="text-xl font-bold tracking-tight">Select Meal Plan</h2>
            <p className="text-sm text-content-muted mt-1">
              MAP is selected by default — change if the guest wants another plan · {nights} night
              {nights !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {ensureMealPlanOptions(value.room).map((plan) => {
              const selected =
                String(value?.mealPlan?.key || '').toLowerCase() ===
                String(plan.key || '').toLowerCase();
              const perNight = mealPlanNightlyRate(plan, value.room);
              const offNight = mealPlanNightlyRate(plan, value.room, 'offSeason');
              const mattress = Number(value.room?.extraBedRate || value.room?.extraBedRates?.map || 0) || 0;
              const total = perNight * Math.max(1, nights);
              return (
                <button
                  key={plan.key}
                  type="button"
                  onClick={() => selectMealPlan(plan)}
                  className={cn(
                    'p-4 rounded-2xl border text-left transition-all duration-200',
                    selected
                      ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/25 shadow-md'
                      : 'border-subtle hover:border-emerald-400/40 hover:bg-surface-elevated/50'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{plan.label}</p>
                    {selected && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {perNight > 0 && (
                      <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                        On Season Price {formatINR(perNight)}
                      </span>
                    )}
                    {offNight > 0 && (
                      <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                        Off Season Price {formatINR(offNight)}
                      </span>
                    )}
                    {mattress > 0 && (
                      <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-800">
                        Extra Mattress {formatINR(mattress)}/n
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-emerald-700 mt-1.5">
                    {formatINR(perNight)}
                    <span className="text-xs font-medium text-content-muted"> / night (On Season Price)</span>
                  </p>
                  <p className="text-xs text-content-muted mt-1">
                    {Number(plan.price || 0) > 0
                      ? `+ ${formatINR(plan.price)} vs EP`
                      : Number(plan.absolutePrice || 0) > 0 && String(plan.key).toLowerCase() === 'ep'
                        ? 'Room only — no meals'
                        : 'Included in room rate'}
                  </p>
                  {selected && (
                    <p className="text-sm font-bold text-emerald-700 mt-3 pt-3 border-t border-emerald-500/20">
                      Total: {formatINR(total)} for {nights} night{nights !== 1 ? 's' : ''}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function parsePackageNights(pkg) {
  if (!pkg) return 1;
  const label = String(pkg.durationLabel || '');
  const nightMatch = label.match(/(\d+)\s*N/i);
  if (nightMatch) return Math.max(1, Number(nightMatch[1]));
  return Math.max(1, Number(pkg.duration || 1) - 1);
}
