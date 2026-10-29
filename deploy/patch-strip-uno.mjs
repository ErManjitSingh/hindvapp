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
  'frontend/src/lib/publicPackages.js',
  'frontend/src/lib/packageCabMapper.js',
  'frontend/src/lib/packageItineraryMapper.js',
  'frontend/src/lib/destinationFamilies.js',
  'frontend/src/lib/mealPlanDefaults.js',
  'frontend/src/lib/callSession.js',
  'frontend/src/api/axios.js',
  'frontend/src/context/SidebarContext.jsx',
  'frontend/src/components/lead-wizard/constants.js',
  'frontend/src/components/dashboard/AdminSalesFunnel.jsx',
  'frontend/src/components/packages/PackageManagementPage.jsx',
  'frontend/src/components/packages/PackageListTable.jsx',
  'frontend/src/components/packages/PackageGrid.jsx',
  'frontend/src/components/quotations/CatalogHotelSelector.jsx',
  'frontend/src/components/quotations/CatalogCabSelector.jsx',
  'frontend/src/components/quotations/DayWiseHotelSelector.jsx',
  'frontend/src/components/quotations/QuotationBuilderWizard.jsx',
  'frontend/src/components/quotations/PackageBuilderWorkspace.jsx',
  'frontend/src/components/quotations/quotationHydrate.js',
  'frontend/src/components/quotations/quotePdfHelpers.js',
  'frontend/src/components/quotations/PackageResourcePickerDrawer.jsx',
  'frontend/src/components/quotations/quotePdfTemplate.css',
  'frontend/src/components/quotations/partyCosting.js',
  'backend/src/routes/index.js',
  'backend/src/routes/packageRoutes.js',
  'backend/src/controllers/packageController.js',
  'backend/src/services/unoHotelsPackageService.js',
  'backend/src/services/localPackageCatalogService.js',
];

for (const rel of files) {
  const abs = path.join(REPO, rel);
  fs.writeFileSync(abs, fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n'));
}

const tarPath = path.join(os.tmpdir(), `himjourney-strip-uno-${Date.now()}.tgz`);
execLocal('tar.exe', ['-C', REPO, '-czf', tarPath, ...files]);

const conn = await connect();
try {
  await sftpPut(conn, tarPath, '/tmp/himjourney-strip-uno.tgz');
  await exec(
    conn,
    [
      `tar -xzf /tmp/himjourney-strip-uno.tgz -C ${APP}`,
      'rm -f /tmp/himjourney-strip-uno.tgz',
      `rm -f ${APP}/frontend/src/lib/unoPublicPackages.js`,
      `rm -f ${APP}/frontend/src/components/quotations/UnoHotelSelector.jsx`,
      `rm -f ${APP}/frontend/src/components/quotations/UnoCabSelector.jsx`,
      `rm -f ${APP}/frontend/src/components/packages/UnoPackageListTable.jsx`,
      `rm -f ${APP}/frontend/src/components/packages/UnoPackageGrid.jsx`,
      `cd ${APP}/frontend && NODE_OPTIONS=--max-old-space-size=2048 npm run build`,
      `grep -RIn --exclude-dir=node_modules -E 'Uno|UNO|/uno-' ${APP}/frontend/dist || true`,
      'pm2 restart hindholidays-crm-api --update-env',
      'sleep 3',
      'curl -sS http://127.0.0.1:3000/api/health',
      'echo',
    ].join(' && '),
  );
} finally {
  conn.end();
  fs.unlink(tarPath, () => {});
}
