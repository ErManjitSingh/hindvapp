const fs = require('fs');
const path = require('path');
const Booking = require('../models/Booking');
const Voucher = require('../models/Voucher');
const TripTask = require('../models/TripTask');
const Payment = require('../models/Payment');
const ApiError = require('../utils/apiError');
const company = require('../config/company');
const { sendMailMessage, isEmailConfigured } = require('./emailService');
const { sendWhatsAppText } = require('./whatsappCloudService');
const { enrichBookingWithQuotation } = require('./operationsQuotationSyncService');

const VOUCHER_DIR = path.join(__dirname, '../../uploads/vouchers');
const ARRANGEMENTS = ['Candlelight Dinner', 'Cake', 'DJ', 'Bonfire', 'Flower Decoration', 'Honeymoon Setup'];

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatStayDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function inr(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN')}`;
}

function vehicleLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return '';
  if (key === 'tempo_traveller') return 'tempo traveller';
  return key.replace(/_/g, ' ');
}

function cleanDayTitle(day) {
  const raw = String(day?.title || day?.description || '').trim();
  const stripped = raw.replace(new RegExp(`^day\\s*${day?.day}\\s*[·:\\-–]*\\s*`, 'i'), '').trim();
  return stripped || raw || 'Travel';
}

function packageRouting(booking) {
  return (booking.itinerary || []).map((day) => {
    const hotel = day.dayHotel?.hotelName || day.accommodation || '';
    const cab = vehicleLabel(day.dayCab?.vehicleType || day.transport);
    const headline = `Day ${day.day} · ${cleanDayTitle(day)} ${formatStayDate(day.date)}`.trim();
    if (!hotel && !cab) return headline;
    return `${headline}\nHotel: ${hotel || '—'} · Cab: ${cab || '—'}`;
  }).join('\n\n');
}

function personCount(booking, hotel) {
  const explicit = Number(hotel?.persons);
  if (explicit > 0) return explicit;
  return Number(booking.adults || 0) + Number(booking.children || 0);
}

function arrangementText(hotel) {
  const items = [...(hotel.specialArrangements || [])];
  if (hotel.specialArrangementNote) items.push(hotel.specialArrangementNote);
  return items.filter(Boolean).join(', ') || 'None';
}

function hotelConfirmationText(booking, hotel) {
  return [
    'Dear Sir/Ma’am,',
    '',
    'Greetings from HindHolidays!',
    '',
    'Kindly confirm the below booking.',
    '',
    `* Guest Name: ${booking.customerName || '—'}`,
    `* Company Name: ${hotel.companyName || company.name}`,
    `* Check-in Date: ${formatStayDate(hotel.checkIn || booking.travelDate)}`,
    `* Check-out Date: ${formatStayDate(hotel.checkOut || booking.returnDate)}`,
    `* Number of Nights: ${hotel.nights || 1}`,
    `* Number of Rooms: ${hotel.rooms || 1}`,
    `* Number of Persons: ${personCount(booking, hotel) || '—'}`,
    `* Number of Kids: ${Number(hotel.kids) || 0}`,
    `* Meal Plan: ${hotel.mealPlan || '—'}`,
    `* Any Special Arrangement: ${arrangementText(hotel)}`,
    `* Extra Matters: ${hotel.extraMatters || 'None'}`,
    `* Total Price: ${inr(hotel.internalPrice)}`,
    `* Advance to Hotel: ${inr(hotel.advancePaid)}`,
    '',
    `Booking: ${booking.bookingNumber}`,
    '',
    'Thank you,',
    company.name,
  ].join('\n');
}

function cabConfirmationText(booking, transport) {
  const routing = packageRouting(booking);
  const vehicle = [
    vehicleLabel(transport.vehicleType),
    transport.vehicleNumber,
    transport.driverName ? `Driver ${transport.driverName}` : '',
  ].filter(Boolean).join(' · ');
  const pickup = transport.pickupLocation || '—';
  const drop = transport.dropLocation || '—';
  return [
    'Dear Sir/Ma’am,',
    '',
    'Greetings from HindHolidays!',
    '',
    'Kindly confirm the below cab booking.',
    '',
    `* Pickup and Drop Details: ${pickup} → ${drop}`,
    `* Travel Dates: ${formatStayDate(booking.travelDate)} to ${formatStayDate(booking.returnDate)}`,
    `* Vehicle Details: ${vehicle || '—'}`,
    `* Total Price: ${inr(transport.finalCost)}`,
    `* Advance to Cab: ${inr(transport.advancePaid)}`,
    '',
    '* Package routing:',
    routing || 'As per itinerary',
    '',
    `Booking: ${booking.bookingNumber}`,
    `Guest: ${booking.customerName || '—'}`,
    '',
    'Thank you,',
    company.name,
  ].join('\n');
}

function textToHtml(text) {
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#1e293b">${
    esc(text).replace(/\n/g, '<br/>')
  }</div>`;
}

async function deliverMessage({ email, phone, subject, text, channels }) {
  const requested = channels?.length ? channels : ['email', 'whatsapp'];
  const results = { email: null, whatsapp: null };
  const warnings = [];

  if (requested.includes('email')) {
    if (!email) warnings.push('Hotel/vendor email is missing');
    else if (!isEmailConfigured()) warnings.push('Email service is not configured');
    else {
      try {
        const mail = await sendMailMessage({
          to: email,
          subject,
          text,
          html: textToHtml(text),
        });
        results.email = { ok: true, messageId: mail.messageId || '' };
      } catch (error) {
        results.email = { ok: false, error: error.message };
        warnings.push(`Email failed: ${error.message}`);
      }
    }
  }

  if (requested.includes('whatsapp')) {
    if (!phone) warnings.push('WhatsApp number is missing');
    else {
      try {
        await sendWhatsAppText({ toPhone: phone, text });
        results.whatsapp = { ok: true };
      } catch (error) {
        results.whatsapp = { ok: false, error: error.message };
        warnings.push(`WhatsApp failed: ${error.message}`);
      }
    }
  }

  const sent = Boolean(results.email?.ok || results.whatsapp?.ok);
  if (!sent) {
    throw new ApiError(502, warnings.join(' · ') || 'Confirmation could not be sent');
  }
  return { results, warnings };
}

function applyHotelConfirmation(hotel, body, booking) {
  if (body.email != null) hotel.email = String(body.email).trim().toLowerCase();
  if (body.phone != null) hotel.phone = String(body.phone).trim();
  if (body.contactPerson != null) hotel.contactPerson = String(body.contactPerson).trim();
  if (body.companyName != null) hotel.companyName = String(body.companyName).trim();
  if (body.mealPlan != null) hotel.mealPlan = String(body.mealPlan).trim();
  if (body.roomType != null) hotel.roomType = String(body.roomType).trim();
  if (body.rooms != null) hotel.rooms = Number(body.rooms) || 1;
  if (body.nights != null) hotel.nights = Number(body.nights) || 1;
  if (body.persons != null) hotel.persons = Number(body.persons) || 0;
  if (body.kids != null) hotel.kids = Number(body.kids) || 0;
  if (body.internalPrice != null) hotel.internalPrice = Number(body.internalPrice) || 0;
  if (body.advancePaid != null) hotel.advancePaid = Number(body.advancePaid) || 0;
  if (body.extraMatters != null) hotel.extraMatters = String(body.extraMatters).trim();
  if (body.checkIn) hotel.checkIn = body.checkIn;
  if (body.checkOut) hotel.checkOut = body.checkOut;
  if (Array.isArray(body.specialArrangements)) {
    hotel.specialArrangements = body.specialArrangements.map((item) => String(item).trim()).filter(Boolean);
  }
  if (body.specialArrangementNote != null) hotel.specialArrangementNote = String(body.specialArrangementNote).trim();
  if (!hotel.companyName) hotel.companyName = company.name;
  if (!hotel.persons) hotel.persons = personCount(booking, hotel);
}

async function sendHotelConfirmation(bookingId, hotelAssignmentId, body = {}) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found');
  const hotel = booking.hotels.id(hotelAssignmentId);
  if (!hotel) throw new ApiError(404, 'Hotel stay not found');

  const sameName = String(hotel.hotelName || '').trim().toLowerCase();
  const checkInKey = hotel.checkIn ? new Date(hotel.checkIn).toISOString().slice(0, 10) : '';
  const grouped = booking.hotels.filter((row) => {
    const rowIn = row.checkIn ? new Date(row.checkIn).toISOString().slice(0, 10) : '';
    return String(row.hotelName || '').trim().toLowerCase() === sameName && rowIn === checkInKey;
  });

  grouped.forEach((row) => applyHotelConfirmation(row, body, booking));
  const text = hotelConfirmationText(booking, hotel);
  const delivery = await deliverMessage({
    email: hotel.email,
    phone: hotel.phone,
    subject: `Hotel booking confirmation request — ${booking.customerName} — ${hotel.hotelName}`,
    text,
    channels: body.channels,
  });

  const sentAt = new Date();
  grouped.forEach((row) => {
    row.status = row.status === 'confirmed' ? 'confirmed' : 'requested';
    row.voucherSentAt = sentAt;
    if (delivery.results.whatsapp?.ok) row.whatsappSentAt = sentAt;
  });
  if (booking.hotelConfirmation === 'pending') booking.hotelConfirmation = 'requested';
  await booking.save();
  return { booking, hotel: hotel.toObject(), text, ...delivery };
}

async function sendCabConfirmation(bookingId, transportAssignmentId, body = {}) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found');
  const transport = booking.transport.id(transportAssignmentId);
  if (!transport) throw new ApiError(404, 'Cab assignment not found');

  if (body.email != null) transport.email = String(body.email).trim().toLowerCase();
  if (body.phone != null) transport.phone = String(body.phone).trim();
  if (body.contactPerson != null) transport.contactPerson = String(body.contactPerson).trim();
  if (body.finalCost != null) transport.finalCost = Number(body.finalCost) || 0;
  if (body.advancePaid != null) transport.advancePaid = Number(body.advancePaid) || 0;
  if (body.pickupLocation != null) transport.pickupLocation = String(body.pickupLocation).trim();
  if (body.dropLocation != null) transport.dropLocation = String(body.dropLocation).trim();
  if (body.vehicleNumber != null) transport.vehicleNumber = String(body.vehicleNumber).trim();
  if (body.driverName != null) transport.driverName = String(body.driverName).trim();

  const text = cabConfirmationText(booking, transport);
  const delivery = await deliverMessage({
    email: transport.email,
    phone: transport.phone || transport.driverPhone,
    subject: `Cab booking confirmation request — ${booking.customerName} — ${booking.bookingNumber}`,
    text,
    channels: body.channels,
  });

  const sentAt = new Date();
  transport.status = transport.status === 'confirmed' ? 'confirmed' : 'requested';
  transport.voucherSentAt = sentAt;
  if (delivery.results.whatsapp?.ok) transport.whatsappSentAt = sentAt;
  if (booking.cabConfirmation === 'pending') booking.cabConfirmation = 'requested';
  await booking.save();
  return { booking, transport: transport.toObject(), text, routing: packageRouting(booking), ...delivery };
}

function listText(items) {
  if (!Array.isArray(items) || !items.length) return '—';
  return items.map((item) => (typeof item === 'string' ? item : item?.label || item?.name || '')).filter(Boolean).join(', ') || '—';
}

function paymentLedger(payments = []) {
  return payments.flatMap((payment) => {
    if (payment.installments?.length) {
      return payment.installments.map((item, index) => ({
        installment: index + 1,
        amount: item.amount,
        receivedAt: item.receivedAt,
        method: item.method,
      }));
    }
    if (Number(payment.paidAmount) > 0) {
      return [{
        installment: 1,
        amount: payment.paidAmount,
        receivedAt: payment.paidAt || payment.createdAt,
        method: payment.method,
      }];
    }
    return [];
  }).sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt));
}

function durationLabel(booking) {
  const days = booking.itinerary?.length || 0;
  const nights = (booking.hotels || []).reduce((sum, hotel) => sum + (Number(hotel.nights) || 0), 0);
  if (days && nights) return `${days} Days / ${nights} Nights`;
  if (days) return `${days} Days`;
  return '—';
}

function buildCompanyVoucherHtml(booking, ledger, agentName) {
  const rooms = Math.max(0, ...(booking.hotels || []).map((hotel) => Number(hotel.rooms) || 0)) || '—';
  const inclusions = listText(booking.quotationMeta?.inclusions || booking.quotationPreview?.meta?.inclusions);
  const hotelBlocks = (booking.hotels || []).map((hotel) => `
    <tr>
      <td>${esc(formatStayDate(hotel.checkIn))}</td>
      <td>${esc(formatStayDate(hotel.checkOut))}</td>
      <td>${esc(hotel.hotelName)}</td>
      <td>${esc(hotel.nights || 1)}</td>
      <td>${esc(hotel.rooms || 1)}</td>
      <td>${esc(hotel.mealPlan || '—')}</td>
      <td>${esc(inr(hotel.internalPrice))}</td>
    </tr>`).join('') || '<tr><td colspan="7">No hotel stay</td></tr>';
  const cabBlocks = (booking.transport || []).map((row) => `
    <div class="card">
      <p><strong>Pickup:</strong> ${esc(formatStayDate(row.pickupDate || booking.travelDate))} · ${esc(row.pickupLocation || '—')}</p>
      <p><strong>Drop:</strong> ${esc(formatStayDate(booking.returnDate))} · ${esc(row.dropLocation || '—')}</p>
      <p><strong>Cab:</strong> ${esc(vehicleLabel(row.vehicleType))} ${esc(row.vehicleNumber || '')} ${esc(row.driverName || '')}</p>
      <p><strong>Internal cab cost:</strong> ${esc(inr(row.finalCost))}</p>
    </div>`).join('') || '<p>No cab assigned</p>';
  const installments = ledger.map((row) => `
    <tr>
      <td>Installment ${esc(row.installment)}</td>
      <td>${esc(inr(row.amount))}</td>
      <td>${esc(formatStayDate(row.receivedAt))}</td>
      <td>${esc(String(row.method || '').replace(/_/g, ' '))}</td>
    </tr>`).join('') || '<tr><td colspan="4">No installment received</td></tr>';
  const routing = packageRouting(booking).replace(/\n/g, '<br/>');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Company Booking Confirmation ${esc(booking.bookingNumber)}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #1f2937; margin: 0; background: #f8fafc; }
  .page { max-width: 860px; margin: 24px auto; background: white; padding: 36px 40px; }
  h1 { font-size: 22px; margin: 0; letter-spacing: 0.04em; }
  h2 { font-size: 14px; margin: 22px 0 8px; text-transform: uppercase; letter-spacing: 0.08em; color: #0f766e; border-bottom: 1px solid #99f6e4; padding-bottom: 4px; }
  .brand { font-size: 12px; letter-spacing: 0.18em; color: #0f766e; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td, th { border: 1px solid #e2e8f0; padding: 7px 8px; text-align: left; vertical-align: top; }
  th { background: #f0fdfa; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 14px; }
  .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; font-size: 14px; }
  .routing { white-space: normal; font-size: 13px; line-height: 1.45; }
  .note { font-size: 11px; color: #64748b; margin-top: 18px; }
  @media print { body { background: white; } .page { margin: 0; box-shadow: none; } }
</style></head><body>
<div class="page">
  <p class="brand">${esc(company.brand)}</p>
  <h1>Company Booking Confirmation Voucher</h1>
  <p style="margin:4px 0 0;font-size:13px;color:#64748b">Internal operations copy · ${esc(formatStayDate(new Date()))}</p>

  <h2>Booking Details</h2>
  <div class="grid">
    <div><strong>Booking Number:</strong> ${esc(booking.bookingNumber)}</div>
    <div><strong>Guest Name:</strong> ${esc(booking.customerName)}</div>
    <div><strong>Customer Contact:</strong> ${esc(booking.customerPhone || '—')}</div>
    <div><strong>Customer Email:</strong> ${esc(booking.customerEmail || '—')}</div>
    <div><strong>Total Package Cost:</strong> ${esc(inr(booking.totalAmount))}</div>
    <div><strong>Advance Received:</strong> ${esc(inr(booking.advanceReceived))}</div>
    <div><strong>Confirmed By:</strong> ${esc(agentName || booking.executiveName || '—')}</div>
  </div>

  <h2>Traveller Details</h2>
  <div class="grid">
    <div><strong>Adults:</strong> ${esc(booking.adults ?? 0)}</div>
    <div><strong>Children:</strong> ${esc(booking.children ?? 0)}</div>
    <div><strong>Package Type:</strong> ${esc(booking.packageName || booking.destination || '—')}</div>
    <div><strong>Rooms:</strong> ${esc(rooms)}</div>
    <div><strong>Duration:</strong> ${esc(durationLabel(booking))}</div>
    <div><strong>Tour Booking Date:</strong> ${esc(formatStayDate(booking.createdAt))}</div>
    <div><strong>Destination:</strong> ${esc(booking.destination || '—')}</div>
  </div>

  <h2>Night Stay / Hotel Details</h2>
  <table>
    <thead><tr><th>Check-in</th><th>Check-out</th><th>Hotel</th><th>Nights</th><th>Rooms</th><th>Meal Plan</th><th>Internal Cost</th></tr></thead>
    <tbody>${hotelBlocks}</tbody>
  </table>
  <p class="note">Internal hotel cost is for company profit calculation and is not part of the sales quotation.</p>

  <h2>Transportation Details</h2>
  ${cabBlocks}
  <p><strong>Package Routing</strong></p>
  <div class="routing">${routing || '—'}</div>

  <h2>Other Details</h2>
  <p><strong>Complimentary:</strong> ${esc(booking.complimentary || '—')}</p>
  <p><strong>Package Inclusions:</strong> ${esc(inclusions)}</p>
  <p><strong>Special Notes:</strong> ${esc(booking.specialNotes || '—')}</p>

  <h2>Payment Details</h2>
  <div class="grid">
    <div><strong>Total Package Cost:</strong> ${esc(inr(booking.totalAmount))}</div>
    <div><strong>Advance Received:</strong> ${esc(inr(booking.advanceReceived))}</div>
    <div><strong>Remaining Balance:</strong> ${esc(inr(booking.pendingAmount))}</div>
  </div>
  <table style="margin-top:10px">
    <thead><tr><th>Installment</th><th>Amount</th><th>Payment Date</th><th>Mode</th></tr></thead>
    <tbody>${installments}</tbody>
  </table>
  <p class="note">${esc(company.name)} · ${esc(company.address)} · Keep this copy with the booking file.</p>
</div>
<script>window.onload=()=>{ if (new URLSearchParams(location.search).get('print')==='1') window.print(); }</script>
</body></html>`;
}

async function bookingReadiness(bookingId) {
  const [booking, tasks] = await Promise.all([
    Booking.findById(bookingId).lean(),
    TripTask.find({ booking: bookingId, type: { $in: ['hotel_confirmation', 'cab_confirmation'] } }).lean(),
  ]);
  if (!booking) throw new ApiError(404, 'Booking not found');
  const hotelTasks = tasks.filter((task) => task.type === 'hotel_confirmation');
  const cabTasks = tasks.filter((task) => task.type === 'cab_confirmation');
  const hotelDone = hotelTasks.length
    ? hotelTasks.every((task) => task.status === 'completed')
    : booking.hotelConfirmation === 'confirmed';
  const cabNeeded = cabTasks.length > 0 || (booking.transport || []).length > 0;
  const cabDone = !cabNeeded || (cabTasks.length
    ? cabTasks.every((task) => task.status === 'completed')
    : booking.cabConfirmation === 'confirmed');
  const pending = [];
  if (!hotelDone) pending.push('Hotel confirmation');
  if (!cabDone) pending.push('Cab confirmation');
  return { booking, ready: hotelDone && cabDone, pending };
}

async function generateCompanyVoucher(bookingId, user, extras = {}) {
  const readiness = await bookingReadiness(bookingId);
  if (!readiness.ready && !extras.force) {
    throw new ApiError(400, `Company voucher is ready after: ${readiness.pending.join(', ')}`);
  }
  const booking = await Booking.findById(bookingId);
  if (extras.complimentary != null) booking.complimentary = String(extras.complimentary);
  if (extras.specialNotes != null) booking.specialNotes = String(extras.specialNotes);

  const enriched = await enrichBookingWithQuotation(booking.toObject());
  const payments = await Payment.find({
    $or: [
      { booking: booking._id },
      ...(booking.lead ? [{ lead: booking.lead }] : []),
    ],
  }).sort({ createdAt: 1 }).lean();
  const ledger = paymentLedger(payments);
  const agentName = booking.executiveName || user?.name || '';
  const html = buildCompanyVoucherHtml({
    ...booking.toObject(),
    ...enriched,
    complimentary: booking.complimentary,
    specialNotes: booking.specialNotes,
    hotels: booking.hotels,
    transport: booking.transport,
  }, ledger, agentName);

  fs.mkdirSync(VOUCHER_DIR, { recursive: true });
  const fileName = `COMPANY-${String(booking.bookingNumber).replace(/[^a-zA-Z0-9-_]/g, '_')}.html`;
  fs.writeFileSync(path.join(VOUCHER_DIR, fileName), html, 'utf8');
  const pdfUrl = `/uploads/vouchers/${fileName}`;

  let voucher = await Voucher.findOne({ booking: booking._id, type: 'company' });
  if (!voucher) {
    const count = await Voucher.countDocuments();
    voucher = new Voucher({
      type: 'company',
      booking: booking._id,
      voucherNumber: `VCH-C-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`,
      bookingNumber: booking.bookingNumber,
      customerName: booking.customerName,
      branchId: booking.branchId,
      issuedBy: user?._id,
    });
  }
  voucher.status = 'issued';
  voucher.issuedAt = new Date();
  voucher.pdfUrl = pdfUrl;
  voucher.details = {
    title: 'Company booking confirmation',
    complimentary: booking.complimentary,
    specialNotes: booking.specialNotes,
    internalHotelCost: (booking.hotels || []).reduce((sum, hotel) => sum + Number(hotel.internalPrice || 0), 0),
    internalCabCost: (booking.transport || []).reduce((sum, row) => sum + Number(row.finalCost || 0), 0),
  };
  await voucher.save();

  booking.companyVoucherUrl = pdfUrl;
  booking.voucherStatus = 'issued';
  await booking.save();
  await TripTask.updateMany(
    { booking: booking._id, type: 'voucher_creation', status: { $ne: 'completed' } },
    { status: 'completed', completedAt: new Date() }
  );
  return { voucher, pdfUrl, booking };
}

async function completeBookingTasks(bookingId, type) {
  await TripTask.updateMany(
    { booking: bookingId, type, status: { $ne: 'completed' } },
    { status: 'completed', completedAt: new Date() }
  );
}

async function syncCompletedTask(task) {
  if (!task || task.status !== 'completed') return null;
  if (task.type === 'hotel_confirmation') {
    await Booking.updateOne(
      { _id: task.booking },
      { $set: { hotelConfirmation: 'confirmed', 'hotels.$[].status': 'confirmed' } }
    );
  }
  if (task.type === 'cab_confirmation') {
    await Booking.updateOne(
      { _id: task.booking },
      { $set: { cabConfirmation: 'confirmed', 'transport.$[].status': 'confirmed' } }
    );
  }
  if (!['hotel_confirmation', 'cab_confirmation'].includes(task.type)) return null;
  const readiness = await bookingReadiness(task.booking);
  if (!readiness.ready) return null;
  return generateCompanyVoucher(task.booking, null).catch(() => null);
}

module.exports = {
  ARRANGEMENTS,
  packageRouting,
  hotelConfirmationText,
  cabConfirmationText,
  sendHotelConfirmation,
  sendCabConfirmation,
  generateCompanyVoucher,
  bookingReadiness,
  completeBookingTasks,
  syncCompletedTask,
};
