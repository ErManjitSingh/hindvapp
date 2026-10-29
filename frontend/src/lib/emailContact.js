import { wrapEmailHtml } from './emailHtmlLayout';

export function renderEmailTemplate(text, lead = {}, extras = {}) {
  const amount = extras.amount ?? lead.budget;
  const formattedAmount =
    amount != null && amount !== ''
      ? `₹${Number(amount).toLocaleString('en-IN')}`
      : '';

  const travelDate = lead.travelDate
    ? new Date(lead.travelDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

  const vars = {
    customerName: lead.name || 'Customer',
    destination: lead.destination || 'your destination',
    quotationNumber: extras.quotationNumber || extras.quoteNumber || '',
    amount: formattedAmount,
    travelDate,
    executiveName: extras.executiveName || 'HindHolidays',
  };

  return String(text || '').replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

export function fileToAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result || '').split(',')[1] || '';
      resolve({
        filename: file.name,
        content: base64,
        encoding: 'base64',
        contentType: file.type || 'application/octet-stream',
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function filesToAttachments(files) {
  const list = Array.from(files || []);
  return Promise.all(list.map(fileToAttachment));
}

export function buildQuotationHtmlAttachment(quote, lead = {}) {
  if (!quote) return null;
  const customer = quote.lead?.name || quote.customerName || lead.name || 'Customer';
  const amount = quote.totalAmount ?? quote.grandTotal ?? quote.pricing?.total ?? 0;
  const travelDate = quote.travelDate || lead.travelDate;
  const destination =
    quote.destination ||
    quote.package?.destination ||
    quote.lead?.destination ||
    lead.destination ||
    '';

  const body = `Thank you for choosing HindHolidays. Your personalised quotation is ready for review.

Our travel experts have prepared this package based on your requirements. Please review the summary and reach out if you'd like any changes.

We look forward to making your journey truly memorable!`;

  const html = wrapEmailHtml(body, {
    subject: `Quotation ${quote.quoteNumber || ''}`,
    category: 'quotation',
    customerName: customer,
    destination,
    quotationNumber: quote.quoteNumber,
    amount: `₹${Number(amount).toLocaleString('en-IN')}`,
    travelDate: travelDate
      ? new Date(travelDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : '—',
    executiveName: 'HindHolidays Sales Team',
  });

  const content = btoa(unescape(encodeURIComponent(html)));
  return {
    filename: `Quotation-${quote.quoteNumber || 'HJT'}.html`,
    content,
    encoding: 'base64',
    contentType: 'text/html',
  };
}
