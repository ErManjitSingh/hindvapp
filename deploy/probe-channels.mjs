import { Client } from 'ssh2';

const PASSWORD = process.env.VPS_PASS;
const conn = new Client();
conn
  .on('ready', () => {
    conn.exec(
      [
        'echo ==LANDING_ENV_KEYS==',
        "grep -E '^[A-Z0-9_]+=' /var/www/landing.hindholidays.com/.env | cut -d= -f1",
        'echo ==LANDING_API==',
        "grep -E 'API|LEAD|CRM|WEBHOOK|META|WHATSAPP|FACEBOOK' /var/www/landing.hindholidays.com/.env | sed -E 's/(KEY|TOKEN|SECRET|PASS|URI)=.*/\\1=***/'",
        'echo ==CRM_CHANNEL_KEYS==',
        "grep -E 'FACEBOOK|WHATSAPP|SMTP|IMAP|META_LEAD|PUBLIC_LEAD|UNO_' /var/www/crm.hindholidays.com/backend/.env | sed -E 's/(KEY|TOKEN|SECRET|PASS|URI)=.*/\\1=***/'",
        'echo ==LANDING_PKG==',
        'cat /var/www/landing.hindholidays.com/package.json | head -40',
      ].join('\n'),
      (err, stream) => {
        if (err) throw err;
        stream.on('data', (d) => process.stdout.write(d));
        stream.stderr.on('data', (d) => process.stderr.write(d));
        stream.on('close', () => conn.end());
      },
    );
  })
  .connect({
    host: '187.127.188.30',
    username: 'root',
    password: PASSWORD,
    hostVerifier: () => true,
  });
