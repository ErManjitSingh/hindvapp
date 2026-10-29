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
  'backend/src/constants/leadPipeline.js',
  'backend/src/models/Lead.js',
  'backend/src/scripts/migrateLeadPipelineStatuses.js',
  'backend/src/utils/normalizeLeadInput.js',
  'backend/src/utils/followUpHelpers.js',
  'backend/src/utils/queryHelpers.js',
  'backend/src/controllers/leadController.js',
  'backend/src/controllers/enterpriseLeadController.js',
  'backend/src/controllers/salesExecutiveController.js',
  'backend/src/services/assignmentCoreService.js',
  'backend/src/services/leadConversionService.js',
  'backend/src/services/leadExecutiveStallService.js',
  'backend/src/services/quotationCreateService.js',
  'backend/src/services/quotationWhatsAppSendService.js',
  'backend/src/services/navCountsService.js',
  'backend/src/services/dashboardService.js',
  'frontend/src/lib/leadPipeline.js',
  'frontend/src/lib/leadTemperatureStatus.js',
  'frontend/src/lib/leadStatusLabel.js',
  'frontend/src/lib/executiveStatusDisplay.js',
  'frontend/src/utils/leadUtils.js',
  'frontend/src/components/leads/constants.js',
  'frontend/src/components/leads/BulkStatusModal.jsx',
  'frontend/src/components/leads/LeadPipelineUpdateModal.jsx',
  'frontend/src/components/leads/PostCallFollowUpModal.jsx',
  'frontend/src/components/leads/CallNoteModal.jsx',
  'frontend/src/components/leads/MobileLeadList.jsx',
  'frontend/src/components/followups/AddFollowUpModal.jsx',
  'frontend/src/components/whatsapp/modals/ChangeStatusModal.jsx',
  'frontend/src/components/whatsapp/constants.js',
  'frontend/src/components/lead-detail/leadDetailData.js',
  'frontend/src/components/lead-detail/LeadStatusPipeline.jsx',
  'frontend/src/components/dashboard/LeadStatusOverviewCard.jsx',
  'frontend/src/components/sales-executive/ExecutiveLeadDetailPage.jsx',
  'frontend/src/pages/LeadDetail.jsx',
  'frontend/src/pages/settings/LeadStatusesPage.jsx',
  'frontend/src/pages/settings/SettingsPage.jsx',
];

for (const rel of files) {
  const abs = path.join(REPO, rel);
  if (!fs.existsSync(abs)) throw new Error(`Missing ${rel}`);
  if (/\.(js|jsx|mjs|cjs)$/i.test(rel)) {
    fs.writeFileSync(abs, fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n'));
  }
}

const tarPath = path.join(os.tmpdir(), `himjourney-lead-pipeline-${Date.now()}.tgz`);
console.log('Packing…');
execLocal('tar.exe', ['-C', REPO, '-czf', tarPath, ...files]);

const conn = await connect();
try {
  console.log('Uploading…');
  await sftpPut(conn, tarPath, '/tmp/himjourney-lead-pipeline.tgz');
  await exec(
    conn,
    [
      `tar -xzf /tmp/himjourney-lead-pipeline.tgz -C ${APP}`,
      'rm -f /tmp/himjourney-lead-pipeline.tgz',
      `cd ${APP}/backend && node src/scripts/migrateLeadPipelineStatuses.js`,
      'pm2 restart hindholidays-crm-api --update-env',
      'sleep 4',
      `cd ${APP}/frontend && NODE_OPTIONS=--max-old-space-size=2048 npm run build`,
      'curl -sS -o /dev/null -w "SITE %{http_code}\\n" https://crm.hindholidays.com/',
      'curl -sS -o /dev/null -w "API %{http_code}\\n" https://crm.hindholidays.com/api/health',
    ].join(' && '),
  );
} finally {
  conn.end();
  fs.unlink(tarPath, () => {});
}

console.log('\nLead pipeline deploy finished.');
