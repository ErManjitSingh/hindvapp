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
  'frontend/src/api/axios.js',
  'frontend/src/context/AuthContext.jsx',
  'frontend/src/store/index.js',
  'frontend/src/hooks/useSidebarCounts.js',
  'frontend/src/components/TopBar.jsx',
  'frontend/src/components/sidebar/AppSidebar.jsx',
  'frontend/src/components/leads/LeadFilterBar.jsx',
  'frontend/src/components/leads/MobileLeadList.jsx',
  'frontend/src/components/leads/constants.js',
  'frontend/src/components/leads/leadFilters.js',
  'frontend/src/components/leads/LeadRowActions.jsx',
  'frontend/src/components/leads/LeadDataTable.jsx',
  'frontend/src/components/leads/LeadPreviewDrawer.jsx',
  'frontend/src/components/lead-wizard/constants.js',
  'frontend/src/components/lead-wizard/schema.js',
  'frontend/src/components/lead-wizard/leadWizardUtils.js',
  'frontend/src/components/lead-wizard/steps/StepLeadForm.jsx',
  'frontend/src/components/lead-wizard/steps/StepLeadInformation.jsx',
  'frontend/src/pages/Leads.jsx',
  'frontend/src/pages/DestinationDetail.jsx',
  'frontend/src/pages/AdminAttendancePage.jsx',
  'frontend/src/pages/DestinationAssignmentPage.jsx',
  'frontend/src/pages/SkillAssignmentPage.jsx',
  'frontend/src/components/attendance/AttendanceFilterBar.jsx',
  'frontend/src/components/hr/HrEmployeeProfilePage.jsx',
  'frontend/src/components/sales-manager/LeadAssignmentPage.jsx',
  'frontend/src/components/sales-manager/TeamLeadsPage.jsx',
  'frontend/src/components/quotations/QuotationBuilderWizard.jsx',
  'frontend/src/components/operations-manager/dashboard/OperationsDashboardCharts.jsx',
  'frontend/src/components/lead-detail/LeadTransferHistory.jsx',
];

for (const rel of files) {
  const abs = path.join(REPO, rel);
  if (!fs.existsSync(abs)) throw new Error(`Missing ${rel}`);
  if (/\.(js|jsx)$/i.test(rel)) {
    fs.writeFileSync(abs, fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n'));
  }
}

const tarPath = path.join(os.tmpdir(), `himjourney-no-branches-${Date.now()}.tgz`);
console.log('Packing…');
execLocal('tar.exe', ['-C', REPO, '-czf', tarPath, ...files]);

const conn = await connect();
try {
  console.log('Uploading…');
  await sftpPut(conn, tarPath, '/tmp/himjourney-no-branches.tgz');
  await exec(
    conn,
    [
      `tar -xzf /tmp/himjourney-no-branches.tgz -C ${APP}`,
      'rm -f /tmp/himjourney-no-branches.tgz',
      `rm -f ${APP}/frontend/src/components/leads/LeadBranchTransferModal.jsx`,
      `rm -f ${APP}/frontend/src/store/slices/branchSlice.js`,
      `cd ${APP}/frontend && NODE_OPTIONS=--max-old-space-size=2048 npm run build`,
      'curl -sS -o /dev/null -w "SITE %{http_code}\\n" https://crm.hindholidays.com/',
    ].join(' && '),
  );
} finally {
  conn.end();
  fs.unlink(tarPath, () => {});
}

console.log('\nBranch UI removal deploy finished.');
