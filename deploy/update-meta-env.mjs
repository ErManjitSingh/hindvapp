/**
 * Update Meta/Facebook lead-ads credentials on live VPS .env (no secrets in git).
 * Accepts a USER or PAGE token; prefers long-lived PAGE token via exchange + me/accounts.
 *
 * Usage:
 *   VPS_PASS=... FACEBOOK_PAGE_ACCESS_TOKEN=... FACEBOOK_APP_SECRET=... FACEBOOK_APP_ID=... \
 *     node deploy/update-meta-env.mjs
 */
import { Client } from 'ssh2';

const PASSWORD = process.env.VPS_PASS;
const APP = '/var/www/crm.hindholidays.com';
const HOST = process.env.VPS_HOST || '187.127.188.30';
const PAGE_ID = process.env.FACEBOOK_PAGE_ID || '183028372389367';

const APP_ID = process.env.FACEBOOK_APP_ID || '';
const APP_SECRET = process.env.FACEBOOK_APP_SECRET || '';
const INPUT_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '';

if (!PASSWORD) {
  console.error('Set VPS_PASS');
  process.exit(1);
}
if (!APP_SECRET || !INPUT_TOKEN) {
  console.error('Set FACEBOOK_APP_SECRET and FACEBOOK_PAGE_ACCESS_TOKEN');
  process.exit(1);
}

function connect() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on('ready', () => resolve(conn))
      .on('error', reject)
      .connect({
        host: HOST,
        username: 'root',
        password: PASSWORD,
        readyTimeout: 45000,
        hostVerifier: () => true,
      });
  });
}

function exec(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', (d) => {
        out += d.toString();
      });
      stream.stderr.on('data', (d) => {
        out += d.toString();
      });
      stream.on('close', (code) => {
        if (code !== 0) reject(new Error(`exit ${code}: ${out}`));
        else resolve(out);
      });
    });
  });
}

function sftpWrite(conn, remote, contents) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const ws = sftp.createWriteStream(remote, { mode: 0o600 });
      ws.on('error', (e) => {
        sftp.end();
        reject(e);
      });
      ws.on('close', () => {
        sftp.end();
        resolve();
      });
      ws.end(Buffer.from(contents, 'utf8'));
    });
  });
}

function upsertEnv(raw, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(raw)) return raw.replace(re, line);
  return `${raw.replace(/\s*$/, '')}\n${line}\n`;
}

async function graphGet(path, params = {}) {
  const url = new URL(`https://graph.facebook.com/v21.0${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetch(url);
  return res.json();
}

function summarizeToken(debug) {
  const data = debug?.data || debug || {};
  return {
    is_valid: data.is_valid,
    type: data.type,
    expires_at: data.expires_at,
    scopes: data.scopes,
    error: data.error?.message || debug?.error?.message || null,
  };
}

async function resolveLongLivedPageToken() {
  const appTok = `${APP_ID}|${APP_SECRET}`;
  const inputDebug = await graphGet('/debug_token', {
    input_token: INPUT_TOKEN,
    access_token: appTok,
  });
  console.log('input_token', JSON.stringify(summarizeToken(inputDebug)));
  if (inputDebug?.data?.is_valid === false) {
    throw new Error(
      inputDebug?.data?.error?.message ||
        inputDebug?.error?.message ||
        'Input Meta token is invalid/expired — generate a fresh one in Graph API Explorer'
    );
  }

  let working = INPUT_TOKEN;
  const inputType = String(inputDebug?.data?.type || '').toUpperCase();

  // Exchange USER tokens (and short-lived) for long-lived user token first.
  if (inputType === 'USER' || inputType === '') {
    const exch = await graphGet('/oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: APP_ID,
      client_secret: APP_SECRET,
      fb_exchange_token: INPUT_TOKEN,
    });
    if (exch.access_token) {
      working = exch.access_token;
      console.log(
        'long_lived_user',
        JSON.stringify({ expires_in: exch.expires_in, token_len: working.length })
      );
    } else {
      console.log('long_lived_user_skip', JSON.stringify({ error: exch.error || null }));
    }
  }

  // Prefer never-expiring PAGE token. me/accounts is often empty for Business users —
  // fall back to GET /{page-id}?fields=access_token and ad account promote_pages.
  const accounts = await graphGet('/me/accounts', {
    access_token: working,
    fields: 'id,name,access_token',
    limit: '50',
  });
  if (accounts.error) {
    console.log('me_accounts_error', accounts.error.message);
  }
  const pages = Array.isArray(accounts.data) ? accounts.data : [];
  console.log(
    'pages',
    pages.map((p) => ({ id: p.id, name: p.name, token_len: (p.access_token || '').length }))
  );

  let pageToken =
    pages.find((p) => String(p.id) === String(PAGE_ID))?.access_token ||
    pages[0]?.access_token ||
    '';

  if (!pageToken) {
    const direct = await graphGet(`/${PAGE_ID}`, {
      access_token: working,
      fields: 'id,name,access_token',
    });
    if (direct.access_token) {
      pageToken = direct.access_token;
      console.log('page_token_via_direct', { id: direct.id, name: direct.name, token_len: pageToken.length });
    } else if (direct.error) {
      console.log('page_direct_error', direct.error.message);
    }
  }

  if (!pageToken) {
    const ads = await graphGet('/me/adaccounts', {
      access_token: working,
      fields: 'id,name',
      limit: '10',
    });
    for (const ad of ads.data || []) {
      const promo = await graphGet(`/${ad.id}/promote_pages`, {
        access_token: working,
        fields: 'id,name,access_token',
        limit: '20',
      });
      const hit =
        (promo.data || []).find((p) => String(p.id) === String(PAGE_ID)) ||
        (promo.data || [])[0];
      if (hit?.access_token) {
        pageToken = hit.access_token;
        console.log('page_token_via_promote_pages', {
          ad: ad.id,
          id: hit.id,
          name: hit.name,
          token_len: pageToken.length,
        });
        break;
      }
    }
  }

  if (!pageToken && inputType === 'PAGE') {
    pageToken = working;
  }
  if (!pageToken) {
    pageToken = working;
    console.log('WARN: no page token resolved — storing exchanged/input token (may expire)');
  }

  const pageDebug = await graphGet('/debug_token', {
    input_token: pageToken,
    access_token: appTok,
  });
  console.log('page_token', JSON.stringify(summarizeToken(pageDebug)));
  if (pageDebug?.data?.is_valid === false) {
    throw new Error(pageDebug?.data?.error?.message || 'Resolved page token invalid');
  }

  // Subscribe page app to leadgen.
  const sub = await fetch(
    `https://graph.facebook.com/v21.0/${PAGE_ID}/subscribed_apps?access_token=${encodeURIComponent(pageToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'subscribed_fields=leadgen',
    }
  ).then((r) => r.json());
  console.log('subscribed_apps', JSON.stringify(sub));

  return pageToken;
}

const pageToken = await resolveLongLivedPageToken();

const conn = await connect();
try {
  const current = await exec(conn, `cat ${APP}/backend/.env`);
  let next = current;
  next = upsertEnv(next, 'FACEBOOK_ENABLED', 'true');
  if (APP_ID) next = upsertEnv(next, 'FACEBOOK_APP_ID', APP_ID);
  next = upsertEnv(next, 'FACEBOOK_APP_SECRET', APP_SECRET);
  next = upsertEnv(next, 'FACEBOOK_PAGE_ACCESS_TOKEN', pageToken);
  next = upsertEnv(next, 'FACEBOOK_PAGE_ID', PAGE_ID);
  next = upsertEnv(next, 'FACEBOOK_WEBHOOK_DEBUG', 'true');
  next = upsertEnv(next, 'FACEBOOK_LEAD_POLL_MS', '30000');
  if (!/^FACEBOOK_VERIFY_TOKEN=.+/m.test(next)) {
    next = upsertEnv(next, 'FACEBOOK_VERIFY_TOKEN', 'hj_fb_verify_9xK2m');
  }

  await exec(conn, `cp -a ${APP}/backend/.env ${APP}/backend/.env.bak-meta-$(date +%Y%m%d%H%M%S)`);
  await sftpWrite(conn, `${APP}/backend/.env`, next);
  await exec(
    conn,
    `grep -E '^(FACEBOOK_|WHATSAPP_)' ${APP}/backend/.env | sed -E 's/(TOKEN|SECRET|KEY)=.*/\\1=***SET***/' && pm2 restart hindholidays-crm-api --update-env && sleep 2 && curl -sS "http://127.0.0.1:3000/api/facebook/webhook/debug?token=$(grep ^FACEBOOK_VERIFY_TOKEN= ${APP}/backend/.env | cut -d= -f2-)" | head -c 900; echo; echo META_ENV_UPDATED`
  );
} finally {
  conn.end();
}
