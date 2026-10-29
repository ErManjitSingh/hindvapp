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
const HOST = process.env.VPS_HOST || '187.127.188.30';

if (!PASSWORD) {
  console.error('Set VPS_PASS');
  process.exit(1);
}

const localIndex = fs.readFileSync(path.join(REPO, 'frontend/dist/index.html'), 'utf8');
const localHash = (localIndex.match(/index-[A-Za-z0-9_-]+\.js/) || [])[0];
if (!localHash) {
  console.error('No local frontend build — run npm run build in frontend/');
  process.exit(1);
}
console.log('Local bundle:', localHash);

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
        host: HOST,
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
        if (code !== 0) reject(new Error(`remote exit ${code}\n${stderr}`));
        else resolve({ stdout, stderr });
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

const tarPath = path.join(os.tmpdir(), `himjourney-fix-${Date.now()}.tgz`);
console.log('Packing…');
execLocal('tar', [
  '-C',
  REPO,
  '-czf',
  tarPath,
  '--exclude=backend/node_modules',
  '--exclude=backend/.env',
  '--exclude=backend/uploads',
  'backend',
  'frontend/dist',
]);
console.log('Tar MB:', (fs.statSync(tarPath).size / 1024 / 1024).toFixed(1));

const remoteScript = `
set -e
APP='${APP}'
EXPECTED='${localHash}'
test -f "\$APP/backend/.env"
cp -a "\$APP/backend/.env" /tmp/hj-backend.env.bak
rm -rf /tmp/hj-extract
mkdir -p /tmp/hj-extract
tar -xzf /tmp/himjourney-fix.tgz -C /tmp/hj-extract
test -f /tmp/hj-extract/frontend/dist/index.html
grep -q "\$EXPECTED" /tmp/hj-extract/frontend/dist/index.html
echo EXTRACT_OK

rsync -a --delete --exclude node_modules --exclude .env --exclude uploads /tmp/hj-extract/backend/ "\$APP/backend/"
cp -a /tmp/hj-backend.env.bak "\$APP/backend/.env"

rm -rf "\$APP/frontend/dist"
mkdir -p "\$APP/frontend/dist"
rsync -a /tmp/hj-extract/frontend/dist/ "\$APP/frontend/dist/"
chmod -R a+rX "\$APP/frontend/dist"
grep -q "\$EXPECTED" "\$APP/frontend/dist/index.html"
echo FRONTEND_SYNC_OK
stat -c '%y %n' "\$APP/frontend/dist/index.html" "\$APP/backend/src/services/navCountsService.js"
grep -n 'newLead:' "\$APP/backend/src/services/navCountsService.js" | head -3

cd "\$APP/backend" && npm ci --omit=dev
cd "\$APP/backend" && node src/scripts/backfillClosedLeadTempNa.js
cd "\$APP/backend" && node src/scripts/backfillBookedLeadPayments.js
cd "\$APP/backend" && node src/scripts/backfillRevertExecutiveLeadSources.js
cd "\$APP/backend" && node src/scripts/backfillConfirmOpsBookings.js
pm2 restart hindholidays-crm-api --update-env
nginx -s reload || true
rm -rf /tmp/hj-extract /tmp/himjourney-fix.tgz
sleep 1
curl -s https://crm.hindholidays.com/ | grep -o 'index-[A-Za-z0-9_-]*\\.js' | head -1
echo DEPLOY_VERIFIED
`;

const conn = await connect();
try {
  console.log('Uploading…');
  await sftpPut(conn, tarPath, '/tmp/himjourney-fix.tgz');
  await exec(conn, remoteScript);
} finally {
  conn.end();
  fs.unlink(tarPath, () => {});
}
console.log('Done.');
