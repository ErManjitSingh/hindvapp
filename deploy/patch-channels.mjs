import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { Client } from 'ssh2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const PASSWORD = process.env.VPS_PASS;
const APP = '/var/www/crm.hindholidays.com';

if (!PASSWORD) {
  console.error('Set VPS_PASS');
  process.exit(1);
}

function execLocal(command, args) {
  const r = spawnSync(command, args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${command} failed`);
}

function connect() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on('ready', () => resolve(conn))
      .on('error', reject)
      .connect({
        host: '187.127.188.30',
        username: 'root',
        password: PASSWORD,
        readyTimeout: 45000,
        keepaliveInterval: 10000,
        hostVerifier: () => true,
      });
  });
}

function exec(conn, command) {
  return new Promise((resolve, reject) => {
    console.log(`\n$ ${command.split('\n')[0]}...`);
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      stream.on('data', (d) => process.stdout.write(d));
      stream.stderr.on('data', (d) => process.stderr.write(d));
      stream.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    });
  });
}

function sftpPut(conn, local, remote) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(local, remote, (putErr) => {
        sftp.end();
        if (putErr) reject(putErr);
        else resolve();
      });
    });
  });
}

const files = [
  'backend/src/config/channels.js',
  'backend/src/routes/index.js',
  'backend/src/server.js',
  'backend/src/services/emailService.js',
  'backend/src/services/emailInboxService.js',
  'backend/src/controllers/emailController.js',
  'backend/src/controllers/whatsappContactController.js',
  'backend/.env.example',
  'frontend/src/config/channels.js',
  'frontend/src/components/channels/ChannelUnavailable.jsx',
  'frontend/src/lib/permissions.js',
  'frontend/src/lib/openCrmWhatsApp.js',
  'frontend/src/pages/WhatsAppLeads.jsx',
  'frontend/src/pages/EmailActivityPage.jsx',
  'frontend/src/pages/settings/WhatsAppTemplatesPage.jsx',
  'frontend/src/pages/settings/EmailTemplatesPage.jsx',
  'frontend/src/pages/settings/SettingsPage.jsx',
  'frontend/src/components/whatsapp-contact/WhatsAppActionButton.jsx',
  'frontend/src/components/whatsapp-contact/LeadContactActions.jsx',
  'frontend/src/components/email/EmailActionButton.jsx',
  'frontend/src/components/whatsapp/WhatsAppMessageInput.jsx',
  'frontend/src/components/mobile/PanelMobileNav.jsx',
];

for (const rel of files) {
  const abs = path.join(REPO, rel);
  fs.writeFileSync(abs, fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n'));
}

const tarPath = path.join(os.tmpdir(), `himjourney-channels-${Date.now()}.tgz`);
execLocal('tar.exe', ['-C', REPO, '-czf', tarPath, ...files]);

const conn = await connect();
try {
  await sftpPut(conn, tarPath, '/tmp/himjourney-channels.tgz');
  await exec(
    conn,
    [
      `tar -xzf /tmp/himjourney-channels.tgz -C ${APP}`,
      'rm -f /tmp/himjourney-channels.tgz',
      `cd ${APP}/frontend && NODE_OPTIONS=--max-old-space-size=2048 npm run build`,
      'pm2 restart hindholidays-crm-api --update-env',
      'sleep 4',
      'echo ==HEALTH==',
      'curl -sS http://127.0.0.1:3000/api/health',
      'echo',
      'echo ==PUBLIC==',
      'curl -sS -o /tmp/pub.json -w "%{http_code}" http://127.0.0.1:3000/api/public/leads; echo; cat /tmp/pub.json; echo',
      'echo ==FB==',
      'curl -sS -o /tmp/fb.json -w "%{http_code}" http://127.0.0.1:3000/api/facebook/webhook; echo; cat /tmp/fb.json; echo',
      'echo ==WA==',
      'curl -sS -o /tmp/wa.json -w "%{http_code}" -H "Authorization: Bearer x" http://127.0.0.1:3000/api/whatsapp/conversations; echo; cat /tmp/wa.json; echo',
      'echo ==EMAIL==',
      'curl -sS -o /tmp/em.json -w "%{http_code}" -H "Authorization: Bearer x" http://127.0.0.1:3000/api/emails/stats; echo; cat /tmp/em.json; echo',
      'echo ==OUT==',
      'tail -12 /root/.pm2/logs/hindholidays-crm-api-out-197.log',
    ].join(' && '),
  );
} finally {
  conn.end();
  fs.unlink(tarPath, () => {});
}
