require('../config/env');
const nodemailer = require('nodemailer');
const channels = require('../config/channels');

const DEFAULT_FROM = process.env.SMTP_USER || 'info@hindholidays.com';
const DEFAULT_FROM_NAME = process.env.SMTP_FROM_NAME || 'HindHolidays';

let transporter = null;

function isEmailConfigured() {
  return (
    channels.email &&
    !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  );
}

function getTransporter() {
  if (!isEmailConfigured()) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.');
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

function normalizeRecipients(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  return String(value)
    .split(/[,;]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizeAttachments(attachments = []) {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .filter((a) => a?.filename && a?.content)
    .map((a) => ({
      filename: String(a.filename).trim(),
      content: Buffer.from(a.content, a.encoding || 'base64'),
      contentType: a.contentType || undefined,
    }));
}

async function sendMailMessage({
  to,
  cc = [],
  bcc = [],
  subject,
  html,
  text,
  attachments = [],
  replyTo,
  headers = {},
}) {
  const mailOptions = {
    from: `"${DEFAULT_FROM_NAME}" <${DEFAULT_FROM}>`,
    to: normalizeRecipients(to),
    cc: normalizeRecipients(cc),
    bcc: normalizeRecipients(bcc),
    subject: String(subject || '').trim(),
    html: html || undefined,
    text: text || undefined,
    attachments: normalizeAttachments(attachments),
    replyTo: replyTo || DEFAULT_FROM,
    headers: { ...headers },
  };

  if (!mailOptions.to.length) {
    throw new Error('At least one recipient is required');
  }
  if (!mailOptions.subject) {
    throw new Error('Subject is required');
  }

  const transport = getTransporter();
  return transport.sendMail(mailOptions);
}

module.exports = {
  DEFAULT_FROM,
  DEFAULT_FROM_NAME,
  isEmailConfigured,
  getTransporter,
  normalizeRecipients,
  normalizeAttachments,
  sendMailMessage,
};
