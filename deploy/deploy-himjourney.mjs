import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { Client } from 'ssh2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
// Disabled default host — HindHolidays uses a NEW domain/VPS (do not push to old Him Journey server).
const HOST = process.env.VPS_HOST;
const USER = process.env.VPS_USER || 'root';
const PASSWORD = process.env.VPS_PASS;
const APP = process.env.VPS_APP_PATH || '/var/www/crm.hindholidays.com';

if (!HOST || !PASSWORD) {
  console.error('Deploy blocked. Set VPS_HOST and VPS_PASS for the NEW HindHolidays server only.');
  console.error('Old Him Journey VPS must not be used.');
  process.exit(1);
}

function randAlnum(n) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(n);
  return [...bytes].map((b) => chars[b % chars.length]).join('');
}

function execLocal(command, args, opts = {}) {
  const r = spawnSync(command, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    throw new Error(`${command} failed with code ${r.status}`);
  }
}

function connect() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on('ready', () => resolve(conn))
      .on('error', reject)
      .connect({
        host: HOST,
        port: 22,
        username: USER,
        password: PASSWORD,
        readyTimeout: 45000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 30,
        hostVerifier: () => true,
      });
  });
}

function exec(conn, command) {
  return new Promise((resolve, reject) => {
    console.log(`\n$ ${command.split('\n')[0]}${command.includes('\n') ? ' ...' : ''}`);
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('data', (d) => {
        const s = d.toString();
        stdout += s;
        process.stdout.write(s);
      });
      stream.stderr.on('data', (d) => {
        const s = d.toString();
        stderr += s;
        process.stderr.write(s);
      });
      stream.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`remote exit ${code}`));
        } else {
          resolve({ stdout, stderr, code });
        }
      });
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

function sftpWrite(conn, remote, contents) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const buf = Buffer.from(contents, 'utf8');
      const ws = sftp.createWriteStream(remote, { mode: 0o600 });
      ws.on('error', (e) => {
        sftp.end();
        reject(e);
      });
      ws.on('close', () => {
        sftp.end();
        resolve();
      });
      ws.end(buf);
    });
  });
}

const mongoPass = randAlnum(28);
const jwtSecret = crypto.randomBytes(48).toString('hex');
const mongoUri = `mongodb://crm_app:${mongoPass}@127.0.0.1:27017/crm_hindholidays?authSource=crm_hindholidays`;

const envBody = [
  'PORT=3000',
  'NODE_ENV=production',
  '',
  `MONGO_URI=${mongoUri}`,
  '',
  `JWT_SECRET=${jwtSecret}`,
  'JWT_EXPIRES_IN=30d',
  '',
  'CORS_ORIGINS=https://crm.hindholidays.com,http://crm.hindholidays.com',
  'COMPANY_PHONE=+91 70188 55020',
  '',
  'SEED_PASSWORD=123456',
  '',
  'REDIS_URL=redis://127.0.0.1:6379',
  'NOTIFICATIONS_ENABLED=true',
  '',
  'VAPID_PUBLIC_KEY=',
  'VAPID_PRIVATE_KEY=',
  'VAPID_SUBJECT=mailto:info@hindholidays.com',
  '',
  'SMTP_HOST=',
  'SMTP_PORT=587',
  'SMTP_USER=info@hindholidays.com',
  'SMTP_PASS=',
  'SMTP_FROM_NAME=HindHolidays',
  '',
].join('\n');

const secretsPath = path.join(__dirname, '.secrets-himjourney.env');
fs.writeFileSync(
  secretsPath,
  [
    `MONGO_USER=crm_app`,
    `MONGO_PASSWORD=${mongoPass}`,
    `MONGO_URI=${mongoUri}`,
    `JWT_SECRET=${jwtSecret}`,
    'ADMIN_EMAIL=admin@crm.com',
    'ADMIN_PASSWORD=123456',
    '',
  ].join('\n'),
  { mode: 0o600 },
);

function toLf(file) {
  const abs = path.isAbsolute(file) ? file : path.join(REPO, file);
  fs.writeFileSync(abs, fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n'));
}
toLf('deploy/remote-setup.sh');
toLf('deploy/nginx/crm.hindholidays.com.conf');
toLf('deploy/ecosystem.config.cjs');

const tarPath = path.join(os.tmpdir(), `himjourney-crm-${Date.now()}.tgz`);
console.log('Packing app…');
execLocal('tar.exe', [
  '-C',
  REPO,
  '-czf',
  tarPath,
  '--exclude=backend/node_modules',
  '--exclude=frontend/node_modules',
  '--exclude=frontend/dist',
  '--exclude=backend/.env',
  '--exclude=backend/uploads',
  'backend',
  'frontend',
  'deploy/nginx/crm.hindholidays.com.conf',
  'deploy/ecosystem.config.cjs',
  'deploy/remote-setup.sh',
]);

const conn = await connect();
try {
  await exec(conn, `mkdir -p ${APP} /var/www/certbot /tmp`);
  console.log('Uploading archive…');
  await sftpPut(conn, tarPath, '/tmp/himjourney-crm.tgz');
  await exec(
    conn,
    `rm -rf ${APP}/backend ${APP}/frontend ${APP}/deploy && tar -xzf /tmp/himjourney-crm.tgz -C ${APP} && rm -f /tmp/himjourney-crm.tgz && chmod +x ${APP}/deploy/remote-setup.sh`,
  );
  await sftpWrite(conn, `${APP}/.env`, envBody);
  await sftpWrite(conn, `${APP}/backend/.env`, envBody);
  await exec(conn, `bash ${APP}/deploy/remote-setup.sh`);
} finally {
  conn.end();
  fs.unlink(tarPath, () => {});
}

console.log('\nDeploy finished.');
console.log('URL: https://crm.hindholidays.com');
console.log('Admin: admin@crm.com / 123456');
console.log(`Mongo user: crm_app`);
console.log(`Mongo password: ${mongoPass}`);
console.log(`Secrets file: ${secretsPath}`);
