/**
 * Inbound channels stay off until HindHolidays credentials are provided.
 * Set FACEBOOK_ENABLED / WHATSAPP_ENABLED / EMAIL_ENABLED / PUBLIC_LEAD_INGEST_ENABLED
 * to "true" in production .env when wiring the new accounts.
 */
function flag(name) {
  return String(process.env[name] || '').toLowerCase() === 'true';
}

module.exports = {
  publicLeadIngest: flag('PUBLIC_LEAD_INGEST_ENABLED'),
  facebook: flag('FACEBOOK_ENABLED'),
  whatsapp: flag('WHATSAPP_ENABLED'),
  email: flag('EMAIL_ENABLED'),
};
