const mongoose = require('mongoose');

const hrSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: 'default' },
    companyName: { type: String, default: 'HindHolidays' },
    workingDays: {
      type: [String],
      default: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
    },
    weekend: { type: [String], default: ['sunday'] },
    officeStart: { type: String, default: '10:00' },
    officeEnd: { type: String, default: '19:00' },
    lateAfterMinutes: { type: Number, default: 15 },
    halfDayHours: { type: Number, default: 4 },
    casualLeavePerYear: { type: Number, default: 12 },
    sickLeavePerYear: { type: Number, default: 6 },
    earnedLeavePerYear: { type: Number, default: 15 },
    pfEnabled: { type: Boolean, default: true },
    esicEnabled: { type: Boolean, default: false },
    pfPercent: { type: Number, default: 12 },
    emailNotifications: { type: Boolean, default: true },
    birthdayReminders: { type: Boolean, default: true },
    documentExpiryReminders: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('HrSettings', hrSettingsSchema);
