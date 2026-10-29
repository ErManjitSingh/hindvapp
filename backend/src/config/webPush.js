const webpush = require('web-push');

/**
 * Web Push (VAPID) singleton — mirrors config/socket.js's setIO/getIO pattern.
 * No-ops safely when keys aren't configured (see .env.example) so the feature never crashes
 * a deployment that hasn't set them up yet.
 */
const publicKey = process.env.VAPID_PUBLIC_KEY || '';
const privateKey = process.env.VAPID_PRIVATE_KEY || '';
const subject = process.env.VAPID_SUBJECT || 'mailto:info@hindholidays.com';

const isConfigured = Boolean(publicKey && privateKey);

if (isConfigured) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
} else {
  console.warn('[WebPush] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set — device push notifications are disabled.');
}

module.exports = { webpush, isConfigured, publicKey };
