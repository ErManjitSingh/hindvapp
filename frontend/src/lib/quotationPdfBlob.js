/**
 * Build a PDF Blob from a quotation preview DOM node.
 * Uses a dedicated iframe + print CSS (same as Save as PDF) so html2canvas
 * never runs on a detached clone or a transformed modal ancestor.
 */
import { buildQuotationPrintDocument } from '../components/quotations/printQuotation';
import { cloneWithEmbeddedImages, waitForImages } from '../components/quotations/embedPrintImages';

function safePdfFilename(quoteNumber) {
  return `Quotation-${String(quoteNumber || 'HJT').replace(/[^\w.\-]+/g, '_')}.pdf`;
}

function canvasToImageData(canvas) {
  try {
    return { data: canvas.toDataURL('image/jpeg', 0.84), format: 'JPEG' };
  } catch {
    return { data: canvas.toDataURL('image/png', 0.92), format: 'PNG' };
  }
}

function waitForIframeDocument(doc, win) {
  return new Promise((resolve) => {
    const done = () => resolve();
    if (doc.readyState === 'complete') {
      setTimeout(done, 400);
      return;
    }
    win.addEventListener('load', () => setTimeout(done, 400), { once: true });
    setTimeout(done, 3000);
  });
}

async function renderQuoteHtmlToCanvas(html) {
  const [{ default: html2canvas }] = await Promise.all([import('html2canvas')]);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'Quotation PDF Export');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;left:-12000px;top:0;width:794px;height:1200px;border:0;opacity:1;pointer-events:none;background:#fff;';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument || win.document;

  try {
    doc.open();
    doc.write(html);
    doc.close();

    await waitForIframeDocument(doc, win);
    await waitForImages(doc.body, 12000);

    const target = doc.body;
    target.style.margin = '0';
    target.style.padding = '0';
    target.style.background = '#ffffff';
    target.style.width = '794px';

    // Expand iframe to full content height so capture is not clipped
    const contentHeight = Math.max(target.scrollHeight, target.offsetHeight, 800);
    iframe.style.height = `${contentHeight + 40}px`;

    // Soften CSS that html2canvas struggles with
    doc.querySelectorAll('*').forEach((el) => {
      if (!(el instanceof win.HTMLElement)) return;
      const style = win.getComputedStyle(el);
      if (style.backdropFilter && style.backdropFilter !== 'none') {
        el.style.backdropFilter = 'none';
      }
      if (style.filter && style.filter !== 'none') {
        el.style.filter = 'none';
      }
    });

    const scale = contentHeight > 12000 ? 1 : 1.2;
    const canvas = await html2canvas(target, {
      scale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      imageTimeout: 15000,
      windowWidth: 794,
      width: 794,
      height: contentHeight,
      scrollX: 0,
      scrollY: 0,
    });

    if (!canvas?.width || !canvas?.height) {
      throw new Error('Quotation PDF render produced an empty page');
    }
    return canvas;
  } finally {
    iframe.remove();
  }
}

export async function generateQuotationPdfBlob(contentEl, quoteNumber = 'HJT') {
  if (!contentEl) throw new Error('Quotation preview is not ready yet');

  const [{ jsPDF }] = await Promise.all([import('jspdf')]);

  const embedded = (await cloneWithEmbeddedImages(contentEl)) || contentEl;
  const html = buildQuotationPrintDocument(embedded.outerHTML, quoteNumber);

  let canvas;
  try {
    canvas = await renderQuoteHtmlToCanvas(html);
  } catch (err) {
    const detail = err?.message || String(err || '');
    throw new Error(detail ? `PDF render failed: ${detail}` : 'Failed to render quotation for PDF');
  }

  const { data: imgData, format } = canvasToImageData(canvas);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const usableWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * usableWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = margin;

  pdf.addImage(imgData, format, margin, position, usableWidth, imgHeight);
  heightLeft -= pageHeight - margin * 2;

  while (heightLeft > 0) {
    position = margin - (imgHeight - heightLeft);
    pdf.addPage();
    pdf.addImage(imgData, format, margin, position, usableWidth, imgHeight);
    heightLeft -= pageHeight - margin * 2;
  }

  const filename = safePdfFilename(quoteNumber);
  return { blob: pdf.output('blob'), filename, pdf };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

export async function shareOrDownloadQuotationPdf({ blob, filename, message, title }) {
  const file = new File([blob], filename, { type: 'application/pdf' });
  const canShareFiles =
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] });

  if (canShareFiles) {
    try {
      await navigator.share({
        files: [file],
        title: title || filename,
        text: message || '',
      });
      return { shared: true, downloaded: false };
    } catch (err) {
      if (err?.name === 'AbortError') return { shared: false, downloaded: false, aborted: true };
    }
  }

  downloadBlob(blob, filename);
  return { shared: false, downloaded: true };
}

export async function copyText(text) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function buildQuotationWhatsAppMessage({ lead, quote, userName } = {}) {
  const guest = lead?.name || quote?.lead?.name || 'Guest';
  const pkg =
    quote?.packageSnapshot?.name ||
    quote?.package?.name ||
    quote?.title ||
    '';
  const destination =
    quote?.packageSnapshot?.destination ||
    quote?.package?.destination ||
    lead?.destination ||
    '';
  const amount =
    quote?.pricing?.total ??
    quote?.costing?.grandTotal ??
    quote?.totalAmount ??
    null;
  const total =
    amount != null && Number(amount) > 0
      ? `₹${Number(amount).toLocaleString('en-IN')}`
      : null;
  const quoteNumber = quote?.quoteNumber || '';

  return [
    `Hello ${guest},`,
    '',
    'Your travel quotation from HindHolidays is ready.',
    '',
    pkg ? `📦 Package: ${pkg}` : null,
    destination ? `📍 Destination: ${destination}` : null,
    total ? `💰 Total: ${total}` : null,
    quoteNumber ? `🔖 Ref: ${quoteNumber}` : null,
    '',
    'I am sharing the quotation PDF with you.',
    'Please review and reply if you would like any changes.',
    '',
    `Thank you — ${userName || 'HindHolidays'}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function extractSendErrorMessage(err) {
  const data = err?.response?.data;
  if (typeof data?.message === 'string' && data.message.trim()) return data.message.trim();
  if (typeof data?.error === 'string' && data.error.trim()) return data.error.trim();
  if (typeof err?.message === 'string' && err.message.trim()) return err.message.trim();
  return 'Could not send quotation. Please try again.';
}

/** WhatsApp Web / wa.me cannot attach files — agents must attach the downloaded PDF. */
export function isDesktopWhatsAppFlow() {
  if (typeof navigator === 'undefined') return true;
  return !/Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}
