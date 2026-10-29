import { Client } from 'ssh2';

const PASSWORD = process.env.VPS_PASS;
const conn = new Client();
conn
  .on('ready', () => {
    conn.exec(
      'echo ==ERR==; tail -80 /root/.pm2/logs/hindholidays-crm-api-error-197.log; echo ==OUT==; tail -80 /root/.pm2/logs/hindholidays-crm-api-out-197.log',
      (err, stream) => {
        if (err) throw err;
        stream.on('data', (d) => process.stdout.write(d));
        stream.stderr.on('data', (d) => process.stderr.write(d));
        stream.on('close', () => {
          conn.end();
        });
      },
    );
  })
  .connect({
    host: '187.127.188.30',
    username: 'root',
    password: PASSWORD,
    hostVerifier: () => true,
  });
