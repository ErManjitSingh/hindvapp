/**
 * Channel integrations are off until new HindHolidays Meta / WhatsApp / email
 * credentials are provided. Flip the matching VITE_* flag after backend env is enabled.
 */
export const CHANNELS = {
  whatsapp: import.meta.env.VITE_WHATSAPP_ENABLED === 'true',
  email: import.meta.env.VITE_EMAIL_ENABLED === 'true',
};

export function isChannelPathBlocked(path = '') {
  const p = String(path).toLowerCase();
  if (!CHANNELS.whatsapp && p.includes('whatsapp')) return true;
  if (!CHANNELS.email && (p.includes('email-activity') || p.includes('email-templates'))) return true;
  return false;
}
