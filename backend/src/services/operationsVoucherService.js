const fs = require('fs');
const path = require('path');
const company = require('../config/company');
const { resolveAgentContact } = require('../utils/agentContact');

const UPLOADS_ROOT = path.join(__dirname, '../../uploads');
const VOUCHER_DIR = path.join(UPLOADS_ROOT, 'vouchers');
const ITINERARY_DIR = path.join(UPLOADS_ROOT, 'itineraries');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtINR(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

function fmtDays(days = []) {
  const list = [...new Set((days || []).map(Number).filter(Boolean))].sort((a, b) => a - b);
  return list.length ? list.map((day) => `Day ${day}`).join(', ') : 'As per itinerary';
}

function humanize(value, fallback = '—') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const BASE_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #0f172a; background: #f8fafc; padding: 24px; }
  .page { max-width: 800px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
  .header { background: linear-gradient(135deg, #0d9488, #0891b2); color: #fff; padding: 28px 32px; }
  .header h1 { font-size: 22px; font-weight: 800; letter-spacing: 0.02em; }
  .header p { opacity: 0.9; margin-top: 6px; font-size: 13px; }
  .badge { display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-top: 10px; }
  .body { padding: 28px 32px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
  .field label { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
  .field p { font-size: 14px; font-weight: 600; }
  .section { margin-top: 20px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
  .section h2 { font-size: 13px; font-weight: 800; text-transform: uppercase; color: #0d9488; margin-bottom: 12px; }
  .note { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 12px 14px; font-size: 12px; color: #115e59; margin-top: 16px; }
  .footer { padding: 16px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; text-align: center; }
  @media print { body { background: #fff; padding: 0; } .page { border: none; border-radius: 0; } }
`;

function buildVoucherHtml(voucher, booking, agent) {
  const type = voucher.type || 'hotel';
  const typeLabel = { hotel: 'Hotel Voucher', transport: 'Cab / Transport Voucher', activity: 'Activity Voucher', master: 'Master Travel Voucher' }[type] || 'Travel Voucher';
  const details = voucher.details || {};
  const isTransport = type === 'transport';
  const accent = isTransport ? '#2563eb' : '#f97316';
  const accentDark = isTransport ? '#1e3a8a' : '#9a3412';
  const serviceDays = fmtDays(details.serviceDays);
  const pax = `${Number(booking.adults) || 0} Adult${Number(booking.adults) === 1 ? '' : 's'}${Number(booking.children) ? ` · ${booking.children} Child${Number(booking.children) === 1 ? '' : 'ren'}` : ''}`;

  let serviceCards = '';
  if (type === 'hotel' && booking.hotels?.length) {
    serviceCards = booking.hotels.map((hotel, index) => {
      const days = hotel.day
        ? Array.from({ length: Math.max(1, Number(hotel.nights) || 1) }, (_, dayIndex) => Number(hotel.day) + dayIndex)
        : details.serviceDays;
      return `
        <article class="service-card">
          <div class="service-head">
            <div>
              <span class="service-index">HOTEL ${String(index + 1).padStart(2, '0')}</span>
              <h3>${esc(hotel.hotelName || hotel.name || 'Confirmed Hotel')}</h3>
              <p>${esc(hotel.address || hotel.destination || booking.destination || 'Destination')}</p>
            </div>
            <span class="status ${hotel.status === 'confirmed' ? 'confirmed' : ''}">${esc(humanize(hotel.status, 'Reserved'))}</span>
          </div>
          <div class="days-strip"><strong>Stay applies to</strong><span>${fmtDays(days)}</span></div>
          <div class="detail-grid">
            <div class="detail"><span>Check-in</span><strong>${fmtDate(hotel.checkIn)}</strong></div>
            <div class="detail"><span>Check-out</span><strong>${fmtDate(hotel.checkOut)}</strong></div>
            <div class="detail"><span>Duration</span><strong>${esc(hotel.nights || 1)} Night(s)</strong></div>
            <div class="detail"><span>Rooms</span><strong>${esc(hotel.rooms || 1)} Room(s)</strong></div>
            <div class="detail"><span>Room category</span><strong>${esc(hotel.roomType || 'Standard Room')}</strong></div>
            <div class="detail"><span>Meal plan</span><strong>${esc(hotel.mealPlan || 'As per booking')}</strong></div>
            <div class="detail wide"><span>Confirmation number</span><strong class="confirmation">${esc(hotel.confirmationNumber || 'Pending from hotel')}</strong></div>
            <div class="detail wide"><span>Hotel contact</span><strong>${esc(hotel.contactPerson || 'Reservations Desk')}${hotel.phone ? ` · ${esc(hotel.phone)}` : ''}</strong></div>
          </div>
          ${hotel.notes ? `<div class="service-note"><strong>Hotel note:</strong> ${esc(hotel.notes)}</div>` : ''}
        </article>`;
    }).join('');
  } else if (isTransport && booking.transport?.length) {
    serviceCards = booking.transport.map((transport, index) => {
      const days = transport.days?.length ? transport.days : transport.day ? [transport.day] : details.serviceDays;
      return `
        <article class="service-card">
          <div class="service-head">
            <div>
              <span class="service-index">VEHICLE ${String(index + 1).padStart(2, '0')}</span>
              <h3>${esc(humanize(transport.vehicleType, 'Private Cab'))}</h3>
              <p>${esc(transport.vendorName || 'HindHolidays Transport Partner')}</p>
            </div>
            <span class="status ${transport.status === 'confirmed' ? 'confirmed' : ''}">${esc(humanize(transport.status, 'Assigned'))}</span>
          </div>
          <div class="days-strip"><strong>Service applies to</strong><span>${fmtDays(days)}</span></div>
          <div class="route">
            <div><span class="route-dot"></span><small>PICKUP</small><strong>${esc(transport.pickupLocation || 'As per itinerary')}</strong></div>
            <div class="route-line"></div>
            <div><span class="route-dot end"></span><small>DROP</small><strong>${esc(transport.dropLocation || 'As per itinerary')}</strong></div>
          </div>
          <div class="detail-grid">
            <div class="detail"><span>Pickup date</span><strong>${fmtDate(transport.pickupDate || booking.travelDate)}</strong></div>
            <div class="detail"><span>Vehicle number</span><strong>${esc(transport.vehicleNumber || 'Shared before pickup')}</strong></div>
            <div class="detail"><span>Driver</span><strong>${esc(transport.driverName || 'Assigned before pickup')}</strong></div>
            <div class="detail"><span>Driver phone</span><strong>${esc(transport.driverPhone || 'Shared before pickup')}</strong></div>
            <div class="detail wide"><span>Vendor contact</span><strong>${esc(transport.contactPerson || transport.vendorName || 'Transport Desk')}${(transport.phone || transport.driverPhone) ? ` · ${esc(transport.phone || transport.driverPhone)}` : ''}</strong></div>
          </div>
          ${transport.notes ? `<div class="service-note"><strong>Transport note:</strong> ${esc(transport.notes)}</div>` : ''}
        </article>`;
    }).join('');
  } else if (type === 'activity' && booking.activities?.length) {
    serviceCards = booking.activities.map((activity, index) => `
      <article class="service-card">
        <div class="service-head">
          <div><span class="service-index">ACTIVITY ${String(index + 1).padStart(2, '0')}</span>
          <h3>${esc(activity.name || 'Travel Activity')}</h3><p>${esc(activity.vendorName || booking.destination)}</p></div>
          <span class="status ${activity.status === 'booked' ? 'confirmed' : ''}">${esc(humanize(activity.status, 'Scheduled'))}</span>
        </div>
        <div class="detail-grid">
          <div class="detail wide"><span>Scheduled for</span><strong>${fmtDate(activity.scheduledAt)}</strong></div>
          <div class="detail wide"><span>Notes</span><strong>${esc(activity.notes || 'As per confirmed itinerary')}</strong></div>
        </div>
      </article>`).join('');
  } else if (type === 'master') {
    serviceCards = `
      <article class="service-card">
        <div class="service-head"><div><span class="service-index">COMPLETE PACKAGE</span>
          <h3>${esc(booking.packageName || booking.destination || 'Travel Package')}</h3>
          <p>${fmtDate(booking.travelDate)} to ${fmtDate(booking.returnDate)}</p></div>
          <span class="status confirmed">Issued</span>
        </div>
        <div class="detail-grid">
          <div class="detail"><span>Destination</span><strong>${esc(booking.destination)}</strong></div>
          <div class="detail"><span>Travellers</span><strong>${esc(pax)}</strong></div>
          <div class="detail"><span>Package value</span><strong>${fmtINR(booking.totalAmount)}</strong></div>
          <div class="detail"><span>Booking reference</span><strong>${esc(booking.bookingNumber)}</strong></div>
        </div>
      </article>`;
  } else {
    serviceCards = `<div class="empty-service">Service details are confirmed as per the linked itinerary.</div>`;
  }

  const voucherStyles = `
    * { box-sizing: border-box; }
    body { margin: 0; color: #172033; background: #eef2f7; font-family: Inter, "Segoe UI", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet { position: relative; width: min(900px, calc(100% - 32px)); min-height: 1120px; margin: 24px auto; overflow: hidden; background: #fff; border-radius: 20px; box-shadow: 0 24px 70px rgba(15,23,42,.14); }
    .topline { height: 7px; background: linear-gradient(90deg, ${accent}, #fbbf24 52%, #0f172a); }
    .brandbar { display: flex; align-items: center; justify-content: space-between; padding: 24px 38px; border-bottom: 1px solid #e8edf4; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-mark { display: grid; width: 43px; height: 43px; place-items: center; color: #fff; background: linear-gradient(145deg, ${accent}, ${accentDark}); border-radius: 13px; font-size: 19px; font-weight: 900; box-shadow: 0 8px 18px ${accent}35; }
    .brand-name { font-size: 21px; font-weight: 900; letter-spacing: -.5px; color: #0f172a; }
    .brand-name b { color: ${accent}; }
    .brand-sub { margin-top: 2px; color: #78859a; font-size: 9px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase; }
    .document-label { color: #64748b; font-size: 10px; font-weight: 800; letter-spacing: 1.8px; text-align: right; text-transform: uppercase; }
    .document-label strong { display: block; margin-top: 5px; color: #172033; font-size: 14px; letter-spacing: .2px; }
    .hero { position: relative; padding: 34px 38px 38px; overflow: hidden; color: #fff; background: linear-gradient(125deg, #0f172a 0%, ${accentDark} 58%, ${accent} 140%); }
    .hero:after { position: absolute; width: 280px; height: 280px; right: -85px; top: -130px; border: 46px solid rgba(255,255,255,.08); border-radius: 50%; content: ""; }
    .type-pill { display: inline-flex; padding: 7px 12px; border: 1px solid rgba(255,255,255,.24); border-radius: 999px; background: rgba(255,255,255,.12); font-size: 9px; font-weight: 900; letter-spacing: 1.6px; text-transform: uppercase; }
    .hero h1 { position: relative; z-index: 1; max-width: 620px; margin: 18px 0 8px; font-size: 31px; line-height: 1.08; letter-spacing: -1px; }
    .hero p { position: relative; z-index: 1; margin: 0; color: rgba(255,255,255,.76); font-size: 12px; }
    .summary { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; margin: -1px 38px 0; padding: 20px 0; border-bottom: 1px solid #e8edf4; }
    .summary-item { padding: 2px 18px; border-left: 1px solid #e8edf4; }
    .summary-item:first-child { padding-left: 0; border-left: 0; }
    .summary-item span, .detail span { display: block; margin-bottom: 5px; color: #8490a3; font-size: 8px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; }
    .summary-item strong { display: block; color: #172033; font-size: 12px; line-height: 1.35; }
    .content { padding: 30px 38px 38px; }
    .section-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 13px; }
    .section-title h2 { margin: 0; color: #172033; font-size: 14px; letter-spacing: -.1px; }
    .section-title span { color: ${accent}; font-size: 9px; font-weight: 900; letter-spacing: 1.1px; text-transform: uppercase; }
    .service-card { overflow: hidden; margin-bottom: 18px; border: 1px solid #e4eaf2; border-radius: 15px; box-shadow: 0 8px 24px rgba(15,23,42,.045); page-break-inside: avoid; }
    .service-head { display: flex; align-items: flex-start; justify-content: space-between; padding: 19px 21px 16px; background: linear-gradient(135deg, ${accent}0d, #fff 70%); }
    .service-index { color: ${accent}; font-size: 8px; font-weight: 900; letter-spacing: 1.4px; }
    .service-head h3 { margin: 5px 0 3px; color: #172033; font-size: 18px; letter-spacing: -.4px; }
    .service-head p { margin: 0; color: #7a8799; font-size: 10px; }
    .status { padding: 6px 10px; color: #92400e; background: #fff7df; border: 1px solid #fde6a7; border-radius: 999px; font-size: 8px; font-weight: 900; letter-spacing: .6px; text-transform: uppercase; }
    .status.confirmed { color: #047857; background: #ecfdf5; border-color: #a7f3d0; }
    .days-strip { display: flex; align-items: center; justify-content: space-between; padding: 10px 21px; color: ${accentDark}; background: ${accent}10; border-top: 1px solid ${accent}18; border-bottom: 1px solid ${accent}18; font-size: 10px; }
    .days-strip strong { text-transform: uppercase; letter-spacing: .7px; }
    .days-strip span { font-weight: 800; }
    .detail-grid { display: grid; grid-template-columns: repeat(4, 1fr); padding: 4px 21px 18px; }
    .detail { min-height: 58px; padding: 16px 12px 8px 0; }
    .detail strong { display: block; color: #253047; font-size: 11px; line-height: 1.4; }
    .detail.wide { grid-column: span 2; }
    .confirmation { color: ${accent} !important; }
    .service-note { margin: 0 21px 18px; padding: 10px 12px; color: #475569; background: #f8fafc; border-radius: 8px; font-size: 10px; }
    .route { display: grid; grid-template-columns: 1fr 55px 1fr; align-items: center; padding: 20px 21px 4px; }
    .route > div:not(.route-line) { position: relative; padding-left: 19px; }
    .route small { display: block; margin-bottom: 4px; color: #8490a3; font-size: 8px; font-weight: 900; letter-spacing: 1px; }
    .route strong { display: block; font-size: 11px; }
    .route-dot { position: absolute; left: 0; top: 5px; width: 10px; height: 10px; border: 3px solid ${accent}; border-radius: 50%; }
    .route-dot.end { border-radius: 3px; }
    .route-line { height: 1px; margin: 0 10px; background: repeating-linear-gradient(90deg, #aeb8c8 0 4px, transparent 4px 8px); }
    .instructions { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 22px; page-break-inside: avoid; }
    .instruction { padding: 16px 18px; border-radius: 12px; font-size: 10px; line-height: 1.55; }
    .instruction strong { display: block; margin-bottom: 5px; font-size: 10px; }
    .instruction.guest { color: #164e63; background: #ecfeff; border: 1px solid #bae6fd; }
    .instruction.vendor { color: #713f12; background: #fffbeb; border: 1px solid #fde68a; }
    .authorization { display: flex; align-items: flex-end; justify-content: space-between; margin-top: 35px; padding-top: 23px; border-top: 1px dashed #cbd5e1; }
    .auth-copy p { margin: 4px 0 0; color: #8490a3; font-size: 9px; }
    .auth-copy strong { font-size: 12px; }
    .stamp { display: grid; width: 78px; height: 78px; place-items: center; color: ${accent}; border: 2px solid ${accent}; border-radius: 50%; font-size: 9px; font-weight: 900; line-height: 1.25; text-align: center; transform: rotate(-8deg); }
    .footer { display: flex; align-items: center; justify-content: space-between; padding: 17px 38px; color: #7a8799; background: #f8fafc; border-top: 1px solid #e8edf4; font-size: 9px; }
    .footer strong { color: #334155; }
    .print-button { position: fixed; right: 22px; bottom: 22px; padding: 11px 17px; color: #fff; background: #0f172a; border: 0; border-radius: 10px; box-shadow: 0 8px 24px rgba(15,23,42,.25); cursor: pointer; font-weight: 800; }
    .empty-service { padding: 25px; color: #64748b; border: 1px dashed #cbd5e1; border-radius: 12px; text-align: center; }
    @media (max-width: 680px) {
      .sheet { width: 100%; min-height: 100vh; margin: 0; border-radius: 0; }
      .brandbar, .hero, .content { padding-left: 20px; padding-right: 20px; }
      .summary { grid-template-columns: 1fr 1fr; margin: 0 20px; }
      .summary-item { padding: 12px 8px; border-left: 0; }
      .detail-grid { grid-template-columns: 1fr 1fr; }
      .instructions { grid-template-columns: 1fr; }
      .document-label { display: none; }
    }
    @media print {
      @page { size: A4; margin: 8mm; }
      body { background: #fff; }
      .sheet { width: 100%; min-height: 0; margin: 0; border-radius: 0; box-shadow: none; }
      .print-button { display: none; }
    }
  `;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(typeLabel)} · ${esc(voucher.voucherNumber)}</title><style>${voucherStyles}</style></head><body>
<main class="sheet">
  <div class="topline"></div>
  <header class="brandbar">
    <div class="brand">
      <div class="brand-mark" style="overflow:hidden;padding:0;background:#000;border-radius:50%;">
        <img src="${esc(company.logoUrl)}" alt="${esc(company.name)}" style="width:43px;height:43px;object-fit:cover;display:block;" />
      </div>
      <div><div class="brand-name">${esc(company.name)}</div><div class="brand-sub">${esc(company.tagline)}</div></div>
    </div>
    <div class="document-label">Official service voucher<strong>${esc(voucher.voucherNumber)}</strong></div>
  </header>
  <section class="hero">
    <span class="type-pill">${esc(typeLabel)}</span>
    <h1>${esc(details.title || `${booking.destination} ${typeLabel}`)}</h1>
    <p>Issued for booking ${esc(booking.bookingNumber)} · ${serviceDays}</p>
  </section>
  <section class="summary">
    <div class="summary-item"><span>Primary guest</span><strong>${esc(booking.customerName)}</strong></div>
    <div class="summary-item"><span>Guests</span><strong>${esc(pax)}</strong></div>
    <div class="summary-item"><span>Destination</span><strong>${esc(booking.destination)}</strong></div>
    <div class="summary-item"><span>Travel period</span><strong>${fmtDate(booking.travelDate)}<br/>${fmtDate(booking.returnDate)}</strong></div>
    ${agent?.phone ? `<div class="summary-item"><span>Agent</span><strong>${esc(agent.name || 'Travel expert')}<br/>${esc(agent.phone)}</strong></div>` : ''}
  </section>
  <section class="content">
    <div class="section-title"><h2>Confirmed service details</h2><span>${serviceDays}</span></div>
    ${serviceCards}
    <div class="instructions">
      <div class="instruction guest"><strong>For the guest</strong>Present this voucher with a valid photo ID at check-in or pickup. Keep the voucher number available for assistance.</div>
      <div class="instruction vendor"><strong>For the service partner</strong>Provide services exactly as listed above. Please do not collect payment from the guest unless separately authorized by HindHolidays.</div>
    </div>
    <div class="authorization">
      <div class="auth-copy"><strong>Authorized by HindHolidays Operations</strong><p>Digitally generated on ${fmtDate(voucher.issuedAt || new Date())} · No signature required</p></div>
      <div class="stamp">HINDHOLIDAYS<br/>VERIFIED<br/>VOUCHER</div>
    </div>
  </section>
  <footer class="footer">
    <span><strong>HindHolidays</strong> · Your trusted travel partner</span>
    <span>${esc(booking.customerPhone || booking.customerEmail || booking.bookingNumber)}</span>
  </footer>
</main>
<button class="print-button" type="button" onclick="window.print()">Print / Save PDF</button>
<script>
  if (new URLSearchParams(location.search).get('print') === '1') {
    window.addEventListener('load', function () { window.print(); });
  }
</script>
</body></html>`;
}

function buildItineraryHtml(booking) {
  const days = booking.itinerary?.length
    ? booking.itinerary
    : [{ day: 1, title: booking.destination, description: 'Itinerary to be updated by operations.' }];

  const dayBlocks = days.map((d) => `
    <div style="margin-bottom:16px;padding:16px;border:1px solid #e2e8f0;border-radius:10px;">
      <div style="font-size:11px;font-weight:800;color:#0d9488;text-transform:uppercase;">Day ${d.day}</div>
      <div style="font-size:16px;font-weight:700;margin:6px 0;">${esc(d.title)}</div>
      <div style="font-size:13px;color:#475569;white-space:pre-wrap;">${esc(d.description)}</div>
      ${d.accommodation ? `<div style="font-size:12px;color:#0d9488;margin-top:8px;">Stay: ${esc(d.accommodation)}</div>` : ''}
      ${d.transport ? `<div style="font-size:12px;color:#7c3aed;margin-top:8px;">Transport: ${esc(d.transport)}</div>` : ''}
      ${d.meals ? `<div style="font-size:12px;color:#64748b;margin-top:8px;">Meals: ${esc(d.meals)}</div>` : ''}
      ${d.activities ? `<div style="font-size:12px;color:#e11d48;margin-top:8px;">Activities: ${esc(d.activities)}</div>` : ''}
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Itinerary ${esc(booking.bookingNumber)}</title>
<style>${BASE_STYLES}</style></head><body>
<div class="page">
  <div class="header">
    <h1>Customer Itinerary</h1>
    <p>${esc(booking.customerName)} · ${esc(booking.destination)} · ${esc(booking.bookingNumber)}</p>
  </div>
  <div class="body">
    <div class="grid">
      <div class="field"><label>Travel</label><p>${fmtDate(booking.travelDate)} → ${fmtDate(booking.returnDate)}</p></div>
      <div class="field"><label>Package</label><p>${esc(booking.packageName || '—')}</p></div>
    </div>
    <div class="section"><h2>Day-wise Plan</h2>${dayBlocks}</div>
  </div>
  <div class="footer">HindHolidays · Print this page to save as PDF</div>
</div>
<script>window.onload=()=>{if(new URLSearchParams(location.search).get('print')==='1')window.print()}</script>
</body></html>`;
}

function writeHtmlFile(dir, fileName, html) {
  ensureDir(dir);
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, html, 'utf8');
  const sub = dir === VOUCHER_DIR ? 'vouchers' : 'itineraries';
  return `/uploads/${sub}/${fileName}`;
}

async function generateVoucherDocument(voucher, booking) {
  const agent = await resolveAgentContact({
    lead: { assignedTo: booking?.assignedTo },
    quotation: booking?.quotation,
  });
  const html = buildVoucherHtml(voucher, booking, agent?.phone ? agent : null);
  const safeName = `${voucher.voucherNumber.replace(/[^a-zA-Z0-9-_]/g, '_')}.html`;
  return writeHtmlFile(VOUCHER_DIR, safeName, html);
}

function generateItineraryDocument(booking) {
  const html = buildItineraryHtml(booking);
  const safeName = `ITN-${booking.bookingNumber.replace(/[^a-zA-Z0-9-_]/g, '_')}.html`;
  return writeHtmlFile(ITINERARY_DIR, safeName, html);
}

module.exports = {
  generateVoucherDocument,
  generateItineraryDocument,
  buildVoucherHtml,
  buildItineraryHtml,
};
