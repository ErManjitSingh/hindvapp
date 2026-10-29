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
  'frontend/index.html',
  'frontend/src/config/branding.js',
  'frontend/src/lib/greeting.js',
  'frontend/src/lib/quotationPdfBlob.js',
  'frontend/src/lib/emailContact.js',
  'frontend/src/lib/emailHtmlLayout.js',
  'frontend/src/lib/logPackageDebug.js',
  'frontend/src/providers/AppProviders.jsx',
  'frontend/src/components/packages/PackageFormModal.jsx',
  'frontend/src/components/packages/PackageManagementPage.jsx',
  'frontend/src/components/channels/ChannelUnavailable.jsx',
  'frontend/src/components/quotations/QuotationBuilderWizard.jsx',
  'frontend/src/components/quotations/UnoCabSelector.jsx',
  'frontend/src/components/quotations/UnoHotelSelector.jsx',
  'frontend/src/components/quotations/PackageBuilderWorkspace.jsx',
  'frontend/src/components/quotations/quoteTemplateDefaults.js',
  'frontend/src/components/reports/ExportActions.jsx',
  'frontend/src/components/sidebar/SidebarBrand.jsx',
  'frontend/src/pages/hr/HrLogin.jsx',
  'backend/src/config/company.js',
  'backend/src/utils/emailHtmlLayout.js',
  'backend/src/services/emailService.js',
  'backend/src/services/unoHotelsApiClient.js',
  'backend/src/services/unoHotelsPackageService.js',
  'backend/src/services/paymentReceiptService.js',
  'backend/src/services/operationsVoucherService.js',
];

for (const rel of files) {
  const abs = path.join(REPO, rel);
  fs.writeFileSync(abs, fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n'));
}

const tarPath = path.join(os.tmpdir(), `himjourney-labels-${Date.now()}.tgz`);
execLocal('tar.exe', ['-C', REPO, '-czf', tarPath, ...files]);

const conn = await connect();
try {
  await sftpPut(conn, tarPath, '/tmp/himjourney-labels.tgz');
  await exec(
    conn,
    [
      `tar -xzf /tmp/himjourney-labels.tgz -C ${APP}`,
      'rm -f /tmp/himjourney-labels.tgz',
      `cd ${APP}/frontend && NODE_OPTIONS=--max-old-space-size=2048 npm run build`,
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
