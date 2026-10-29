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
        readyTimeout: 60000,
        keepaliveInterval: 10000,
        hostVerifier: () => true,
      });
  });
}

function exec(conn, command) {
  return new Promise((resolve, reject) => {
    console.log(`\n$ ${command.split('\n')[0]}${command.includes('\n') ? ' ...' : ''}`);
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
  'backend/src/routes/hotelRoutes.js',
  'frontend/src/App.jsx',
  'frontend/src/pages/HotelControlPage.jsx',
  'frontend/src/pages/HotelEditPage.jsx',
  'frontend/src/components/sidebar/sidebar-config.js',
  'frontend/src/components/sales-executive/sidebar-config.js',
];

for (const rel of files) {
  const abs = path.join(REPO, rel);
  if (!fs.existsSync(abs)) throw new Error(`Missing ${rel}`);
  if (/\.(js|jsx|mjs|cjs)$/i.test(rel)) {
    fs.writeFileSync(abs, fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n'));
  }
}

const tarPath = path.join(os.tmpdir(), `himjourney-hotel-acl-${Date.now()}.tgz`);
console.log('Packing…');
execLocal('tar.exe', ['-C', REPO, '-czf', tarPath, ...files]);

const conn = await connect();
try {
  console.log('Uploading…');
  await sftpPut(conn, tarPath, '/tmp/himjourney-hotel-acl.tgz');
  await exec(
    conn,
    [
      `tar -xzf /tmp/himjourney-hotel-acl.tgz -C ${APP}`,
      'rm -f /tmp/himjourney-hotel-acl.tgz',
      'pm2 restart hindholidays-crm-api --update-env',
      'sleep 3',
      `cd ${APP}/frontend && NODE_OPTIONS=--max-old-space-size=2048 npm run build`,
      'curl -sS -o /dev/null -w "SITE %{http_code}\\n" https://crm.hindholidays.com/',
      'curl -sS -o /dev/null -w "API %{http_code}\\n" https://crm.hindholidays.com/api/health',
    ].join(' && '),
  );
} finally {
  conn.end();
  fs.unlink(tarPath, () => {});
}

console.log('\nHotel Control ACL deploy finished.');
