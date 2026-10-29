const mongoose = require('mongoose');

const EMAIL_CATEGORIES = [
  'quotation',
  'follow_up',
  'booking_confirmation',
  'payment_confirmation',
  'welcome',
  'reactivation',
  'custom',
];

const EMAIL_STATUSES = ['queued', 'sent', 'failed'];

const emailLogSchema = new mongoose.Schema(
  {
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', index: true },
    quotationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    category: { type: String, enum: EMAIL_CATEGORIES, default: 'custom', index: true },
    from: { type: String, trim: true, default: 'info@hindholidays.com' },
    to: [{ type: String, trim: true, required: true }],
    cc: [{ type: String, trim: true }],
    bcc: [{ type: String, trim: true }],
    subject: { type: String, trim: true, required: true },
    status: { type: String, enum: EMAIL_STATUSES, default: 'queued', index: true },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    sentByName: { type: String, trim: true },
    sentAt: { type: Date, index: true },
    errorMessage: { type: String, trim: true },
    attachmentNames: [{ type: String, trim: true }],
    bodyText: { type: String, trim: true, maxlength: 50000 },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailTemplate' },
    messageId: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

emailLogSchema.index({ branchId: 1, createdAt: -1 });
emailLogSchema.index({ sentBy: 1, createdAt: -1 });

module.exports = mongoose.model('EmailLog', emailLogSchema);
module.exports.EMAIL_CATEGORIES = EMAIL_CATEGORIES;
module.exports.EMAIL_STATUSES = EMAIL_STATUSES;
