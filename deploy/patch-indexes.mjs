import fs from 'fs';
import { Client } from 'ssh2';

const PASSWORD = process.env.VPS_PASS;
const APP = '/var/www/crm.hindholidays.com';
const files = [
  ['backend/src/config/ensureIndexes.js', `${APP}/backend/src/config/ensureIndexes.js`],
  ['backend/src/config/db.js', `${APP}/backend/src/config/db.js`],
];
const repo = 'd:/travel-crm -him-solan';

function put(conn, local, remote) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const body = fs.readFileSync(local).toString('utf8').replace(/\r\n/g, '\n');
      const ws = sftp.createWriteStream(remote);
      ws.on('close', () => {
        sftp.end();
        resolve();
      });
      ws.on('error', (e) => {
        sftp.end();
        reject(e);
      });
      ws.end(body);
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

const conn = new Client();
conn
  .on('ready', async () => {
    try {
      for (const [rel, remote] of files) {
        console.log('upload', rel);
        await put(conn, `${repo}/${rel}`, remote);
      }
      await exec(
        conn,
        'pm2 restart hindholidays-crm-api && sleep 5 && echo ==HEALTH== && curl -sS http://127.0.0.1:3000/api/health && echo && echo ==ERR== && tail -8 /root/.pm2/logs/hindholidays-crm-api-error-197.log && echo ==OUT== && tail -15 /root/.pm2/logs/hindholidays-crm-api-out-197.log',
      );
    } catch (e) {
      console.error(e.message);
      process.exitCode = 1;
    } finally {
      conn.end();
    }
  })
  .connect({
    host: '187.127.188.30',
    username: 'root',
    password: PASSWORD,
    hostVerifier: () => true,
  });
