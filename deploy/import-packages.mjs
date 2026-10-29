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
        keepaliveCountMax: 60,
        hostVerifier: () => true,
      });
  });
}

function exec(conn, command) {
  return new Promise((resolve, reject) => {
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
  'backend/src/models/Package.js',
  'backend/src/services/localPackageCatalogService.js',
  'backend/src/services/unoHotelsPackageService.js',
  'backend/src/services/navCountsService.js',
  'backend/src/controllers/unoHotelsPackageController.js',
  'backend/src/controllers/packageController.js',
  'backend/src/routes/packageRoutes.js',
  'backend/src/config/ensureIndexes.js',
  'backend/src/scripts/importUnoPackages.js',
  'backend/package.json',
];

for (const rel of files) {
  const abs = path.join(REPO, rel);
  fs.writeFileSync(abs, fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n'));
}

const tarPath = path.join(os.tmpdir(), `himjourney-packages-${Date.now()}.tgz`);
execLocal('tar.exe', ['-C', REPO, '-czf', tarPath, ...files]);

const conn = await connect();
try {
  await sftpPut(conn, tarPath, '/tmp/himjourney-packages.tgz');
  await exec(
    conn,
    [
      `tar -xzf /tmp/himjourney-packages.tgz -C ${APP}`,
      'rm -f /tmp/himjourney-packages.tgz',
      'pm2 restart hindholidays-crm-api --update-env',
      'sleep 3',
      'curl -sS http://127.0.0.1:3000/api/health',
      'echo',
    ].join(' && '),
  );
  await exec(
    conn,
    [
      'pkill -f src/scripts/importUnoPackages.js || true',
      `cd ${APP}/backend`,
      'nohup node src/scripts/importUnoPackages.js > /tmp/import-uno-packages.log 2>&1 </dev/null &',
      'echo IMPORT_PID=$!',
      'sleep 3',
      'head -n 50 /tmp/import-uno-packages.log || true',
    ].join('\n'),
  );
} finally {
  conn.end();
  fs.unlink(tarPath, () => {});
}
