import { useMemo, useState } from 'react';
import {
  X,
  Printer,
  FileText,
  Download,
  Send,
  ChevronDown,
  Loader2,
  User,
  MapPin,
  Calendar,
  Layers,
  FileSpreadsheet,
  CreditCard,
  Phone,
  Check,
  Building2,
  Landmark,
} from 'lucide-react';
import AppModal from '../ui/AppModal';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { toast } from '../../context/ToastContext';
import API from '../../api/axios';
import { downloadVoucherPdf, downloadVoucherHtml, printVoucherHtml } from './voucherPdf';

function formatINR(n) {
  const num = Number(n || 0);
  return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 1 })}`;
}

function InfoChip({ icon: Icon, label, value, sub, tone = 'slate' }) {
  const tones = {
    slate: 'from-slate-50 to-white ring-slate-200/80 text-slate-900',
    teal: 'from-teal-50 to-white ring-teal-200/70 text-teal-950',
    orange: 'from-orange-50 to-white ring-orange-200/70 text-orange-950',
    sky: 'from-sky-50 to-white ring-sky-200/70 text-sky-950',
  };
  const icons = {
    slate: 'bg-slate-900 text-white',
    teal: 'bg-teal-600 text-white',
    orange: 'bg-orange-500 text-white',
    sky: 'bg-sky-500 text-white',
  };
  return (
    <div className={cn('rounded-2xl bg-gradient-to-br p-4 ring-1', tones[tone])}>
      <div className="flex items-start gap-3">
        <span className={cn('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', icons[tone])}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</p>
          <p className="mt-1 text-[15px] font-extrabold leading-snug break-words">{value}</p>
          {sub ? <p className="mt-1 text-[11px] text-slate-500">{sub}</p> : null}
        </div>
      </div>
    </div>
  );
}

function MoneyHero({ label, value, hint, accent }) {
  const map = {
    total: 'from-slate-900 to-slate-800',
    advance: 'from-teal-500 to-teal-700',
    balance: 'from-orange-400 to-orange-600',
  };
  return (
    <div className={cn('relative overflow-hidden rounded-[22px] bg-gradient-to-br p-5 text-white shadow-lg', map[accent])}>
      <div className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/15" />
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/75">{label}</p>
      <p className="mt-2 text-[28px] font-black tracking-tight metric-tabular leading-none">{formatINR(value)}</p>
      {hint ? <p className="mt-2 text-[11px] text-white/75">{hint}</p> : null}
    </div>
  );
}

export default function PaymentVoucherModal({
  open,
  onClose,
  voucher,
  html,
  lead,
  sendEndpoint,
}) {
  const [sending, setSending] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const v = useMemo(() => voucher || null, [voucher]);
  const receiptNo = v?.receiptNumber || v?.invoiceNumber || 'payment-voucher';

  const printVoucher = async () => {
    if (!html) {
      toast.error('Voucher not ready to print');
      return;
    }
    try {
      await printVoucherHtml(html, `Payment Voucher ${receiptNo}`);
    } catch {
      toast.error('Unable to print voucher');
    }
  };

  const downloadPdf = async () => {
    if (!html) {
      toast.error('Voucher not ready — open View Voucher again');
      return;
    }
    setDownloading(true);
    try {
      await downloadVoucherPdf(html, `${receiptNo}.pdf`);
      toast.success('PDF downloaded');
    } catch (err) {
      console.error('[voucherPdf]', err);
      try {
        downloadVoucherHtml(html, `${receiptNo}.html`);
        toast.success('PDF failed — HTML voucher downloaded instead. Open it and Print → Save as PDF');
      } catch {
        toast.error(err?.message || 'Failed to download PDF');
      }
    } finally {
      setDownloading(false);
    }
  };

  const sendToCustomer = async () => {
    if (!sendEndpoint) {
      toast.error('Send is not available for this lead');
      return;
    }
    setSending(true);
    setSendOpen(false);
    try {
      const { data } = await API.post(sendEndpoint, {}, { skipSuccessToast: true });
      if (data?.sent === false) {
        const reasons = {
          no_email: 'Customer email is missing',
          email_not_configured: 'Email is not configured on server',
          no_receipt: 'Receipt not found',
        };
        toast.error(reasons[data.reason] || 'Could not send voucher');
        return;
      }
      toast.success(`Voucher sent${data?.to?.length ? ` to ${data.to.join(', ')}` : ''}`);
    } catch {
      toast.error('Failed to send voucher');
    } finally {
      setSending(false);
    }
  };

  return (
    <AppModal open={open} onClose={onClose} size="3xl" className="p-0 overflow-hidden bg-[#f1f5f9]" panelClassName="max-w-[820px]">
      <div className="relative overflow-hidden bg-[radial-gradient(900px_280px_at_0%_0%,rgba(45,212,191,0.35),transparent),linear-gradient(120deg,#020617,#0f172a_55%,#115e59)] px-5 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-teal-200 ring-1 ring-white/20 shrink-0">
              <FileText className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-200/90">HindHolidays</p>
              <h3 className="text-lg font-black text-white truncate">Payment Voucher</h3>
              <p className="text-xs text-slate-300 truncate">#{receiptNo}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              onClick={printVoucher}
              className="rounded-xl h-9 gap-2 border-0 bg-white/10 text-white hover:bg-white/20 hidden sm:inline-flex"
            >
              <Printer className="w-4 h-4" /> Print
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white/80 hover:bg-white/10"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-h-[min(72vh,820px)] overflow-y-auto">
        {v ? (
          <div className="p-4 sm:p-6 space-y-4">
            <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-teal-900 text-white px-5 py-7 sm:px-8 sm:py-8 shadow-xl">
              <div className="pointer-events-none absolute -right-12 -top-16 h-64 w-64 rounded-full bg-teal-400/25 blur-2xl" />
              <div className="pointer-events-none absolute -left-10 bottom-[-50px] h-48 w-48 rounded-full bg-orange-400/20 blur-2xl" />
              <div className="relative z-[1] flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-200/90">Advance receipt</p>
                  <h2 className="mt-2 text-3xl sm:text-4xl font-black tracking-tight leading-[1.05]">
                    Payment confirmed
                  </h2>
                  <p className="mt-3 text-sm text-slate-300">
                    {v.receiptNumber} · {v.paidAtLabel}
                  </p>
                </div>
                <div className="rounded-[22px] bg-white px-5 py-4 text-slate-900 shadow-2xl min-w-[190px]">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-teal-500 text-white">
                      <Check className="w-5 h-5" strokeWidth={3} />
                    </span>
                    <div>
                      <p className="text-sm font-black text-teal-700">Received</p>
                      <p className="text-[11px] text-slate-500">Guest payment logged</p>
                    </div>
                  </div>
                  <p className="mt-3 text-2xl font-black metric-tabular text-slate-900">
                    {formatINR(v.advanceReceived)}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <MoneyHero label="Package Total" value={v.totalAmount} accent="total" />
              <MoneyHero label="Advance Received" value={v.advanceReceived} accent="advance" hint="Token / booking amount" />
              <MoneyHero label="Balance Due" value={v.balanceDue} accent="balance" hint="Before travel date" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <InfoChip
                icon={User}
                tone="teal"
                label="Customer"
                value={v.customerName}
                sub={`${v.leadBadge || ''} · ${v.customerPhone || ''}`.trim()}
              />
              <InfoChip icon={MapPin} tone="orange" label="Destination" value={v.destination} sub={v.destinationSub} />
              <InfoChip icon={Calendar} tone="sky" label="Travel Date" value={v.travelDate} sub={v.travelWeekday} />
              <InfoChip
                icon={Layers}
                tone="slate"
                label="Booking / Quote"
                value={v.quoteNumber !== '—' ? v.quoteNumber : v.bookingNumber}
              />
              <InfoChip
                icon={FileSpreadsheet}
                tone="slate"
                label="Invoice"
                value={v.invoiceNumber}
                sub={`Generated ${v.invoiceGeneratedOn}`}
              />
              <InfoChip
                icon={CreditCard}
                tone="teal"
                label="Payment Mode"
                value={v.paymentMethod}
                sub={v.paymentRef ? `Ref: ${v.paymentRef}` : 'Confirmed'}
              />
            </div>

            {v.company ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-[22px] border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Company</p>
                  </div>
                  <p className="text-sm font-bold text-slate-900">{v.company.name}</p>
                  {v.company.tagline ? <p className="text-xs text-slate-500 mt-0.5">{v.company.tagline}</p> : null}
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">{v.company.address}</p>
                  <div className="mt-3 space-y-1 text-xs text-slate-600">
                    {v.company.gstin ? <p><span className="font-semibold text-slate-800">GSTIN:</span> {v.company.gstin}</p> : null}
                    {v.company.pan ? <p><span className="font-semibold text-slate-800">PAN:</span> {v.company.pan}</p> : null}
                    <p><span className="font-semibold text-slate-800">HSN:</span> {v.company.hsn || v.hsn}</p>
                    {v.company.phone ? (
                      <p className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {v.company.phone}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-[22px] border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4 sm:p-5 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500 text-white">
                      <Landmark className="h-4 w-4" />
                    </span>
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-orange-700">Bank details</p>
                  </div>
                  {v.company.bankName ? (
                    <div className="space-y-1.5 text-sm text-orange-950">
                      <p className="font-bold">{v.company.bankName}</p>
                      <p className="text-xs"><span className="font-semibold">A/C:</span> {v.company.accountNo}</p>
                      <p className="text-xs"><span className="font-semibold">IFSC:</span> {v.company.ifsc}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-orange-800/80">Bank details not configured.</p>
                  )}
                  <div className="mt-4 rounded-xl bg-white/80 px-3 py-2.5 ring-1 ring-orange-100">
                    <p className="text-[11px] font-semibold text-orange-900">Guest</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">{v.customerName}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{v.customerPhone}</p>
                    {v.customerEmail ? <p className="text-xs text-slate-500">{v.customerEmail}</p> : null}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-[22px] border border-slate-200 bg-white p-4 sm:p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 mb-3">Terms &amp; conditions</p>
              <ol className="list-decimal space-y-1.5 pl-4 text-[12px] leading-relaxed text-slate-600">
                <li>All payments made to HindHolidays are valid only against an official receipt issued by the company.</li>
                <li>Late payment charges of 18% p.a. may apply to overdue outstanding amounts.</li>
                <li>Any discrepancy regarding this receipt should be communicated in writing within 3 days of receipt.</li>
                <li>The remaining balance must be paid before the travel date, as per the agreed booking terms.</li>
                <li>This is a computer-generated receipt and does not require a physical signature.</li>
                <li>All disputes shall be subject to the jurisdiction of Shimla, Himachal Pradesh.</li>
              </ol>
            </div>

            <div className="flex gap-3 rounded-[22px] bg-gradient-to-r from-sky-600 to-teal-600 px-4 py-4 text-white shadow-lg shadow-sky-700/20">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-black shrink-0">
                i
              </span>
              <div>
                <p className="text-sm font-bold">Important note</p>
                <p className="text-xs text-white/85 mt-1 leading-relaxed">
                  This is an advance receipt for the booking. Balance payment is required before the travel date.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="p-10 text-center text-sm text-slate-500">No voucher data available</p>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur-md px-5 py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={downloadPdf}
          disabled={downloading || !html}
          className="rounded-2xl h-11 gap-2 border-slate-200 bg-slate-50 text-slate-800 hover:bg-white font-semibold"
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {downloading ? 'Preparing PDF…' : 'Download PDF'}
        </Button>

        <div className="relative flex w-full sm:w-auto">
          <Button
            type="button"
            disabled={sending || !sendEndpoint}
            onClick={sendToCustomer}
            className="rounded-l-2xl rounded-r-none h-11 gap-2 flex-1 sm:flex-none bg-teal-600 hover:bg-teal-500 text-white font-bold shadow-lg shadow-teal-700/25 border-0"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Sending…' : 'Send to Customer'}
          </Button>
          <button
            type="button"
            disabled={sending || !sendEndpoint}
            onClick={() => setSendOpen((o) => !o)}
            className="rounded-r-2xl h-11 px-3 bg-teal-700 hover:bg-teal-600 text-white border-l border-teal-500/40 disabled:opacity-50"
            aria-label="More send options"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          {sendOpen && (
            <div className="absolute right-0 bottom-full mb-2 w-48 rounded-2xl border border-slate-200 bg-white shadow-xl p-1.5 z-20">
              <button
                type="button"
                className="w-full text-left px-3 py-2.5 text-sm rounded-xl hover:bg-slate-50 text-slate-700 font-medium"
                onClick={sendToCustomer}
              >
                Email customer
              </button>
              <button
                type="button"
                className="w-full text-left px-3 py-2.5 text-sm rounded-xl hover:bg-slate-50 text-slate-700 font-medium"
                onClick={() => {
                  setSendOpen(false);
                  printVoucher();
                }}
              >
                Print instead
              </button>
            </div>
          )}
        </div>
      </div>
      {!lead?.email ? (
        <p className="px-5 pb-3 -mt-1 text-[11px] text-amber-600">
          Tip: add customer email on the lead to send this voucher.
        </p>
      ) : null}
    </AppModal>
  );
}
