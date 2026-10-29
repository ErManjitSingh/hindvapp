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
  'backend/package.json',
  'backend/src/models/Hotel.js',
  'backend/src/config/permissions.js',
  'backend/src/controllers/packageController.js',
  'backend/src/routes/packageRoutes.js',
  'backend/src/services/localHotelCatalogService.js',
  'backend/src/services/operationsService.js',
  'backend/src/scripts/importPackageHotels.js',
  'backend/src/scripts/syncSalesExecutivePackages.js',
  'frontend/src/lib/rolePermissions.js',
  'frontend/src/routes/lazyRoutes.js',
  'frontend/src/App.jsx',
  'frontend/src/pages/HotelControlPage.jsx',
  'frontend/src/components/packages/PackageManagementPage.jsx',
  'frontend/src/components/packages/PackageFormModal.jsx',
  'frontend/src/components/sidebar/sidebar-config.js',
  'frontend/src/components/sales-executive/sidebar-config.js',
  'frontend/src/components/quotations/QuotationBuilderWizard.jsx',
  'frontend/src/components/operations-manager/hotels/OperationsHotelsPage.jsx',
];

for (const rel of files) {
  const abs = path.join(REPO, rel);
  fs.writeFileSync(abs, fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n'));
}

const tarPath = path.join(os.tmpdir(), `himjourney-hotel-control-${Date.now()}.tgz`);
execLocal('tar.exe', ['-C', REPO, '-czf', tarPath, ...files]);

const conn = await connect();
try {
  await sftpPut(conn, tarPath, '/tmp/himjourney-hotel-control.tgz');
  await exec(
    conn,
    [
      `tar -xzf /tmp/himjourney-hotel-control.tgz -C ${APP}`,
      'rm -f /tmp/himjourney-hotel-control.tgz',
      `cd ${APP}/frontend && NODE_OPTIONS=--max-old-space-size=2048 npm run build`,
      'pm2 restart hindholidays-crm-api --update-env',
      'sleep 4',
      `cd ${APP}/backend && node src/scripts/syncSalesExecutivePackages.js`,
      `cd ${APP}/backend && node src/scripts/importPackageHotels.js`,
      'curl -sS http://127.0.0.1:3000/api/health',
      'echo',
    ].join(' && '),
  );
} finally {
  conn.end();
  fs.unlink(tarPath, () => {});
}
