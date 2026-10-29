import { useState } from 'react';
import { Hotel, Loader2, NotebookPen, Save, Send } from 'lucide-react';
import API from '../../../api/axios';
import { Button } from '../../ui/button';
import { formatDate, formatINR } from '../operationsUtils';
import { cn } from '../../../lib/utils';
import OpsInternalNotesPanel from './OpsInternalNotesPanel';

const ARRANGEMENTS = ['Candlelight Dinner', 'Cake', 'DJ', 'Bonfire', 'Flower Decoration', 'Honeymoon Setup'];

function dateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function Field({ label, children, className }) {
  return (
    <label className={cn('block min-w-0', className)}>
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-content-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

/** Keep empty while typing — don't force 0 back into the input. */
function numberInputValue(value) {
  if (value === '' || value === null || value === undefined) return '';
  return value;
}

function parseOptionalNumber(raw) {
  if (raw === '' || raw == null) return '';
  const n = Number(raw);
  return Number.isFinite(n) ? n : '';
}

function toMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeHotelsForSave(list = []) {
  return list.map((hotel) => ({
    ...hotel,
    rooms: Math.max(1, Number(hotel.rooms) || 1),
    persons: toMoney(hotel.persons),
    kids: toMoney(hotel.kids),
    internalPrice: toMoney(hotel.internalPrice),
    advancePaid: toMoney(hotel.advancePaid),
  }));
}

function letterFor(booking, hotel) {
  const persons = Number(hotel.persons) || (Number(booking.adults || 0) + Number(booking.children || 0));
  const arrangements = [...(hotel.specialArrangements || [])];
  if (hotel.specialArrangementNote) arrangements.push(hotel.specialArrangementNote);
  return [
    'Dear Sir/Ma’am,',
    '',
    'Greetings from HindHolidays!',
    '',
    'Kindly confirm the below booking.',
    '',
    `* Guest Name: ${booking.customerName || '—'}`,
    `* Company Name: ${hotel.companyName || 'HindHolidays'}`,
    `* Check-in Date: ${formatDate(hotel.checkIn || booking.travelDate)}`,
    `* Check-out Date: ${formatDate(hotel.checkOut || booking.returnDate)}`,
    `* Number of Nights: ${hotel.nights || 1}`,
    `* Number of Rooms: ${hotel.rooms || 1}`,
    `* Number of Persons: ${persons || '—'}`,
    `* Number of Kids: ${Number(hotel.kids) || 0}`,
    `* Meal Plan: ${hotel.mealPlan || '—'}`,
    `* Any Special Arrangement: ${arrangements.join(', ') || 'None'}`,
    `* Extra Matters: ${hotel.extraMatters || 'None'}`,
    `* Total Price: ${formatINR(hotel.internalPrice || 0)}`,
    `* Advance to Hotel: ${formatINR(hotel.advancePaid || 0)}`,
  ].join('\n');
}

export default function HotelBookingSection({
  bookingId,
  booking,
  hotels,
  onChange,
  onSaved,
  locked = false,
  lockMessage = '',
}) {
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  const [notice, setNotice] = useState('');

  const update = (index, patch) => {
    onChange(hotels.map((hotel, i) => (i === index ? { ...hotel, ...patch } : hotel)));
  };

  const toggleArrangement = (index, label) => {
    const current = hotels[index].specialArrangements || [];
    const next = current.includes(label) ? current.filter((item) => item !== label) : [...current, label];
    update(index, { specialArrangements: next });
  };

  const save = async () => {
    setSaving(true);
    setNotice('');
    try {
      const normalized = normalizeHotelsForSave(hotels);
      onChange(normalized);
      await API.put(`/operations-manager/bookings/${bookingId}`, { hotels: normalized });
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const send = async (hotel) => {
    if (!hotel?._id) {
      setNotice('Save the hotel stay once, then send the confirmation.');
      return;
    }
    const channels = [
      hotel.email ? 'email' : null,
      hotel.phone ? 'whatsapp' : null,
    ].filter(Boolean);
    if (!channels.length) {
      setNotice('Add the hotel email or WhatsApp number before sending.');
      return;
    }
    setSendingId(hotel._id);
    setNotice('');
    try {
      const normalized = normalizeHotelsForSave(hotels);
      onChange(normalized);
      await API.put(`/operations-manager/bookings/${bookingId}`, { hotels: normalized });
      const savedHotel = normalized.find((row) => String(row._id) === String(hotel._id)) || hotel;
      const response = await API.post(
        `/operations-manager/bookings/${bookingId}/hotels/${hotel._id}/confirmation`,
        {
          email: savedHotel.email,
          phone: savedHotel.phone,
          contactPerson: savedHotel.contactPerson,
          companyName: savedHotel.companyName || 'HindHolidays',
          mealPlan: savedHotel.mealPlan,
          rooms: savedHotel.rooms || 1,
          nights: savedHotel.nights || 1,
          persons: Number(savedHotel.persons) || (Number(booking.adults || 0) + Number(booking.children || 0)),
          kids: Number(savedHotel.kids) || 0,
          internalPrice: Number(savedHotel.internalPrice) || 0,
          advancePaid: Number(savedHotel.advancePaid) || 0,
          extraMatters: savedHotel.extraMatters || '',
          checkIn: savedHotel.checkIn,
          checkOut: savedHotel.checkOut,
          specialArrangements: savedHotel.specialArrangements || [],
          specialArrangementNote: savedHotel.specialArrangementNote || '',
          channels,
        }
      );
      const warnings = response.data?.warnings || [];
      setNotice(warnings.length ? warnings.join(' ') : 'Confirmation request sent. Mark the hotel task Done after the hotel confirms.');
      onSaved?.();
    } finally {
      setSendingId(null);
    }
  };

  return (
    <section className="relative rounded-3xl border border-teal-500/20 bg-white/90 p-4 shadow-sm sm:p-6 dark:bg-slate-900/80">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-600">Hotel Master</p>
          <h2 className="mt-1 flex items-center gap-2 text-lg font-black text-content-primary">
            <Hotel className="h-5 w-5 text-teal-600" /> Hotel booking
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-content-muted">
            One entry per hotel stay. Enter internal cost and the advance you are sending to the hotel.
            Kids and Extra matters go on the confirmation letter.
          </p>
        </div>
        <Button
          variant="teal"
          size="sm"
          className="rounded-xl gap-1.5"
          disabled={locked || saving || !hotels.length}
          onClick={save}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save hotel costs
        </Button>
      </div>

      {notice && (
        <p className="mb-4 rounded-xl border border-teal-500/20 bg-teal-500/10 px-3 py-2 text-xs text-teal-800">{notice}</p>
      )}

      {!hotels.length && (
        <p className="rounded-2xl border border-dashed border-subtle p-6 text-center text-sm text-content-muted">
          Save the itinerary to create one hotel stay from the selected hotels.
        </p>
      )}

      <div className="relative">
        <div
          className={cn(
            'space-y-4 transition duration-300',
            locked && 'pointer-events-none select-none blur-[2.5px] opacity-55'
          )}
          aria-disabled={locked || undefined}
        >
        {hotels.map((hotel, index) => {
          const internal = Number(hotel.internalPrice) || 0;
          const advance = Number(hotel.advancePaid) || 0;
          const balance = Math.max(0, internal - advance);
          const defaultPersons =
            Number(hotel.persons) ||
            Number(booking.adults || 0) + Number(booking.children || 0) ||
            '';

          return (
            <article key={hotel._id || `${hotel.hotelName}-${index}`} className="rounded-2xl border border-subtle bg-slate-50/70 p-4 dark:bg-slate-950/40">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-black text-content-primary">{hotel.hotelName || 'Hotel'}</h3>
                  <p className="text-xs text-content-muted">
                    {formatDate(hotel.checkIn || booking.travelDate)} → {formatDate(hotel.checkOut || booking.returnDate)}
                    {' · '}{hotel.nights || 1} night{(hotel.nights || 1) > 1 ? 's' : ''}
                    {hotel.destination ? ` · ${hotel.destination}` : ''}
                  </p>
                </div>
                <span className="rounded-full bg-teal-500/10 px-2.5 py-1 text-[10px] font-bold uppercase text-teal-700">
                  {hotel.status || 'pending'}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Company name" className="sm:col-span-2 lg:col-span-1">
                  <input
                    value={hotel.companyName || 'HindHolidays'}
                    onChange={(e) => update(index, { companyName: e.target.value })}
                    className="input-premium h-10 w-full rounded-xl text-sm"
                  />
                </Field>
                <Field label="Meal plan">
                  <input
                    value={hotel.mealPlan || ''}
                    onChange={(e) => update(index, { mealPlan: e.target.value })}
                    className="input-premium h-10 w-full rounded-xl text-sm"
                    placeholder="CP / MAP / AP"
                  />
                </Field>
                <Field label="No. of rooms">
                  <input
                    type="number"
                    min="1"
                    value={numberInputValue(hotel.rooms === undefined || hotel.rooms === null ? 1 : hotel.rooms)}
                    onChange={(e) => update(index, { rooms: parseOptionalNumber(e.target.value) })}
                    className="input-premium h-10 w-full rounded-xl text-sm"
                  />
                </Field>
                <Field label="No. of persons">
                  <input
                    type="number"
                    min="0"
                    value={numberInputValue(
                      hotel.persons === undefined || hotel.persons === null || hotel.persons === ''
                        ? defaultPersons
                        : hotel.persons
                    )}
                    onChange={(e) => update(index, { persons: parseOptionalNumber(e.target.value) })}
                    className="input-premium h-10 w-full rounded-xl text-sm"
                  />
                </Field>
                <Field label="No. of kids">
                  <input
                    type="number"
                    min="0"
                    value={numberInputValue(hotel.kids)}
                    onChange={(e) => update(index, { kids: parseOptionalNumber(e.target.value) })}
                    className="input-premium h-10 w-full rounded-xl text-sm"
                    placeholder="0"
                  />
                </Field>
                <Field label="Check-in date">
                  <input
                    type="date"
                    value={dateInput(hotel.checkIn)}
                    onChange={(e) => update(index, { checkIn: e.target.value })}
                    className="input-premium h-10 w-full rounded-xl text-sm"
                  />
                </Field>
                <Field label="Check-out date">
                  <input
                    type="date"
                    value={dateInput(hotel.checkOut)}
                    onChange={(e) => update(index, { checkOut: e.target.value })}
                    className="input-premium h-10 w-full rounded-xl text-sm"
                  />
                </Field>
                <Field label="Hotel email">
                  <input
                    value={hotel.email || ''}
                    onChange={(e) => update(index, { email: e.target.value })}
                    className="input-premium h-10 w-full rounded-xl text-sm"
                    placeholder="hotel@email.com"
                  />
                </Field>
                <Field label="Hotel WhatsApp">
                  <input
                    value={hotel.phone || ''}
                    onChange={(e) => update(index, { phone: e.target.value })}
                    className="input-premium h-10 w-full rounded-xl text-sm"
                    placeholder="91XXXXXXXXXX"
                  />
                </Field>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Internal hotel cost (total)">
                  <input
                    type="number"
                    min="0"
                    value={numberInputValue(hotel.internalPrice)}
                    onChange={(e) => update(index, { internalPrice: parseOptionalNumber(e.target.value) })}
                    className="input-premium h-10 w-full rounded-xl text-sm font-bold"
                    placeholder="Full stay cost"
                  />
                </Field>
                <Field label="Advance to hotel">
                  <input
                    type="number"
                    min="0"
                    value={numberInputValue(hotel.advancePaid)}
                    onChange={(e) => update(index, { advancePaid: parseOptionalNumber(e.target.value) })}
                    className="input-premium h-10 w-full rounded-xl text-sm font-bold text-amber-800"
                    placeholder="Manual advance amount"
                  />
                </Field>
                <div className="rounded-xl border border-subtle bg-white px-3 py-2 dark:bg-slate-900/60">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-content-muted">Balance to hotel</p>
                  <p className="mt-1 text-lg font-black tabular-nums text-content-primary">{formatINR(balance)}</p>
                  <p className="text-[10px] text-content-muted">Total − advance</p>
                </div>
              </div>

              <Field label="Extra matters" className="mt-3">
                <textarea
                  value={hotel.extraMatters || ''}
                  onChange={(e) => update(index, { extraMatters: e.target.value })}
                  className="input-premium min-h-[88px] w-full resize-y rounded-xl text-sm"
                  placeholder="Any extra notes for the hotel (early check-in, view preference, etc.)"
                />
              </Field>

              <div className="mt-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-content-muted">Special arrangements</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ARRANGEMENTS.map((label) => {
                    const active = (hotel.specialArrangements || []).includes(label);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleArrangement(index, label)}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${active ? 'border-teal-500 bg-teal-500 text-white' : 'border-subtle bg-white text-content-secondary'}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <Field label="Other arrangement note" className="mt-2">
                  <input
                    value={hotel.specialArrangementNote || ''}
                    onChange={(e) => update(index, { specialArrangementNote: e.target.value })}
                    className="input-premium h-10 w-full rounded-xl text-sm"
                    placeholder="Any other arrangement"
                  />
                </Field>
              </div>

              <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-amber-200 bg-amber-50/80 p-3 font-sans text-xs leading-5 text-slate-700">
                {letterFor(booking, hotel)}
              </pre>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-content-muted">
                  {hotel.voucherSentAt ? `Last sent ${formatDate(hotel.voucherSentAt)}` : 'Not sent yet'}
                  {hotel.whatsappSentAt ? ' · WhatsApp sent' : ''}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl gap-1.5 border-amber-500/40"
                  disabled={sendingId === hotel._id}
                  onClick={() => send(hotel)}
                >
                  {sendingId === hotel._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send for Confirmation
                </Button>
              </div>

              <OpsInternalNotesPanel
                bookingId={bookingId}
                scope="hotel"
                compact
                hotelAssignmentId={hotel._id}
                title={`${hotel.hotelName || 'Hotel'} · internal notes`}
                notes={hotel.internalNotes || []}
                disabledReason={hotel._id ? '' : 'Save the hotel stay first, then add a note'}
                onNotesSynced={({ hotelAssignmentId, notes: nextNotes }) => {
                  if (!hotelAssignmentId) return;
                  onChange(
                    hotels.map((row) =>
                      String(row._id) === String(hotelAssignmentId)
                        ? { ...row, internalNotes: nextNotes }
                        : row
                    )
                  );
                }}
              />
            </article>
          );
        })}
        </div>

        {/* Only inside blurred Hotel Master — stays centered while scrolling this block, then removes. */}
        {locked && (
          <div className="pointer-events-none absolute inset-0 z-10">
            <div className="sticky top-[42%] flex justify-center px-4">
              <div className="w-full max-w-md -translate-y-1/2 rounded-2xl border border-amber-300/90 bg-white/95 px-5 py-4 text-center shadow-lg shadow-amber-900/15">
                <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md shadow-amber-500/30">
                  <NotebookPen className="h-5 w-5" />
                </span>
                <p className="text-sm font-black text-slate-900">
                  Add a hotel note explaining why you are changing the hotel
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  {lockMessage || 'Hotel Master stays locked until you save the change reason note above.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
