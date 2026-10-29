const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { port, corsOrigins } = require('./config/env');
const { connectDB, getDbStatus } = require('./config/db');
const { connectRedis } = require('./config/redis');
const { ensureIndexes } = require('./config/ensureIndexes');
const apiRoutes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const { applySecurityMiddleware } = require('./middleware/security');
const { apiLimiter } = require('./middleware/rateLimiter');
const { initializeSocket } = require('./socket');
const { NOTIFICATIONS_ENABLED } = require('./config/notifications');
const { startNotificationScheduler } = require('./services/notificationScheduler');
const { purgeOldActivityLogs } = require('./services/activityService');
const { startEmailInboxPoller } = require('./services/emailInboxService');
const { archiveOldTrips } = require('./services/operationsArchiveService');
const { validateEnvOnBoot: validateFacebookEnv } = require('./services/facebookLeadWebhookService');
const { startFacebookLeadPoller } = require('./services/facebookLeadPollerService');
const channels = require('./config/channels');
const {
  reconcileSessions,
  SESSION_RECONCILE_INTERVAL_MS,
} = require('./services/sessionReconciliationService');

const app = express();

// Behind Nginx — trust exactly the first proxy hop for correct per-client rate limits.
// `true` trusts an unbounded proxy chain, which express-rate-limit rejects as unsafe
// (a client could spoof X-Forwarded-For to bypass IP-based limits) — `1` matches the
// actual single-nginx-hop topology this app runs behind.
app.set('trust proxy', 1);

applySecurityMiddleware(app);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  })
);

app.use(
  express.json({
    limit: '16mb',
    verify: (req, _res, buf) => {
      const url = String(req.originalUrl || req.url || '');
      if (
        url.startsWith('/api/webhooks/facebook') ||
        url.startsWith('/api/facebook/webhook') ||
        url.startsWith('/api/webhooks/whatsapp')
      ) {
        req.rawBody = buf;
      }
    },
  })
);
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  maxAge: '7d',
  etag: true,
  lastModified: true,
  immutable: false,
}));

app.get('/api/health', (req, res) => {
  const db = getDbStatus();
  res.status(200).json({
    status: 'ok',
    service: 'hindholidays-crm-api',
    database: db,
    time: new Date().toISOString(),
  });
});

app.get('/api', (req, res) => {
  res.json({ message: 'HindHolidays API', version: '1.0.0' });
});

app.use('/api', apiLimiter, apiRoutes);
app.use(errorHandler);

async function start() {
  await connectDB();
  await connectRedis();
  await ensureIndexes();
  await purgeOldActivityLogs();

  const httpServer = http.createServer(app);
  initializeSocket(httpServer);
  if (NOTIFICATIONS_ENABLED) {
    startNotificationScheduler();
  } else {
    console.log('[NotificationScheduler] Disabled (set NOTIFICATIONS_ENABLED=true to enable)');
  }
  if (channels.email) {
    startEmailInboxPoller();
  } else {
    console.log('[EmailInbox] Disabled until EMAIL_ENABLED=true');
  }

  archiveOldTrips().catch(() => {});
  setInterval(() => archiveOldTrips().catch(() => {}), 24 * 60 * 60 * 1000);
  setInterval(() => purgeOldActivityLogs().catch(() => {}), 60 * 60 * 1000);

  reconcileSessions().catch(() => {});
  setInterval(() => reconcileSessions().catch(() => {}), SESSION_RECONCILE_INTERVAL_MS);

  httpServer.listen(port, () => {
    console.log(`[API] Running on http://127.0.0.1:${port}`);
    console.log(`[API] Health: http://127.0.0.1:${port}/api/health`);
    if (channels.facebook) {
      console.log('[API] Facebook webhook: /api/facebook/webhook');
      validateFacebookEnv();
      startFacebookLeadPoller();
    } else {
      console.log('[API] Meta lead webhook disconnected');
    }
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error('[API] Failed to start:', err.message);
    process.exit(1);
  });
}

module.exports = app;
