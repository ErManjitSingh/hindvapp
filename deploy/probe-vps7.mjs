import { Client } from 'ssh2';

const HOST = process.env.VPS_HOST || '187.127.188.30';
const PASSWORD = process.env.VPS_PASS;
if (!PASSWORD) {
  console.error('Set VPS_PASS');
  process.exit(1);
}

const remote = `
python3 - <<'PY'
import os, re, subprocess, glob
files = [
 '/var/www/hpuj/.env',
 '/var/www/theshimlarides.com/.env',
 '/var/www/hpuj.in/.env',
 '/var/www/landing.hindholidays.com/.env',
 '/var/www/leadmanagement/backend/.env',
 '/var/www/leadmanagement/superadmin/.env',
 '/var/www/treks.indiaholidaydestination.com/.env',
 '/var/www/api.treks.indiaholidaydestination.com/.env',
 '/var/www/api.treks.indiaholidaydestination.com/app/backend/.env',
]
for f in files:
    if not os.path.isfile(f):
        print(f, 'MISSING')
        continue
    text = open(f, errors='replace').read()
    keys = re.findall(r'^([A-Z0-9_]*MONGO[A-Z0-9_]*)=', text, re.M)
    users = []
    for m in re.finditer(r'mongodb(?:\\+srv)?://([^:]+):', text):
        users.append(m.group(1))
    print(f, 'mongo_keys=', keys, 'users=', users)
PY
echo ==TRY_ROLES==
python3 - <<'PY'
import os, re, subprocess, json
files = [
 '/var/www/hpuj/.env',
 '/var/www/theshimlarides.com/.env',
 '/var/www/hpuj.in/.env',
 '/var/www/landing.hindholidays.com/.env',
 '/var/www/leadmanagement/superadmin/.env',
 '/var/www/treks.indiaholidaydestination.com/.env',
 '/var/www/api.treks.indiaholidaydestination.com/.env',
 '/var/www/api.treks.indiaholidaydestination.com/app/backend/.env',
]
seen=set()
for f in files:
    if not os.path.isfile(f):
        continue
    text=open(f, errors='replace').read()
    m=re.search(r'^(?:MONGO_URI|MONGODB_URI|DATABASE_URL)=(.*)$', text, re.M)
    if not m:
        continue
    uri=m.group(1).strip().strip('"').strip("'")
    um=re.search(r'mongodb(?:\\+srv)?://([^:]+):', uri)
    user=um.group(1) if um else '?'
    if uri in seen:
        continue
    seen.add(uri)
    r=subprocess.run(['mongosh', uri, '--quiet', '--eval', 'const s=db.runCommand({connectionStatus:1}); printjson(s.authInfo.authenticatedUsers); printjson(s.authInfo.authenticatedUserRoles);'], capture_output=True, text=True, timeout=20)
    print('FILE', f)
    print('USER', user)
    print(r.stdout[-1500:])
    if r.stderr.strip():
        print('ERR', r.stderr[-300:])
    print('---')
PY
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
