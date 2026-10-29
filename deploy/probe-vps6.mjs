import { Client } from 'ssh2';

const HOST = process.env.VPS_HOST || '187.127.188.30';
const PASSWORD = process.env.VPS_PASS;
if (!PASSWORD) {
  console.error('Set VPS_PASS');
  process.exit(1);
}

const remote = `
echo ==SEARCH_CREATEUSER==
grep -RIl --include='*.sh' --include='*.js' --include='*.mjs' --include='*.md' --include='*.env' 'createUser' /root /var/www /opt 2>/dev/null | head -20
echo ==SUPERADMIN==
ls /var/www/leadmanagement/superadmin 2>/dev/null | head
echo ==ALL_ENV==
find /var/www /root /opt -name '.env' 2>/dev/null | head -40
echo ==LANDING==
ls /var/www/landing.hindholidays.com | head -20
echo ==MONGO_USERS_HINT==
grep -RIl 'user: .crm' /var/www /root --include='*.js' --include='*.md' --include='*.sh' 2>/dev/null | head
echo ==IHD_API_ENV==
find /var/www/indiaholidaydestination.com /var/www/html -name '.env' 2>/dev/null | head
`.trim();

const conn = new Client();
conn
  .on('ready', () => {
    conn.exec(remote, (err, stream) => {
      if (err) throw err;
      stream.on('data', (d) => process.stdout.write(d));
      stream.stderr.on('data', (d) => process.stderr.write(d));
      stream.on('close', (code) => {
        conn.end();
        process.exit(code ?? 0);
      });
    });
  })
  .on('error', (err) => {
    console.error(err.message);
    process.exit(1);
  })
  .connect({
    host: HOST,
    port: 22,
    username: 'root',
    password: PASSWORD,
    readyTimeout: 30000,
    hostVerifier: () => true,
  });
