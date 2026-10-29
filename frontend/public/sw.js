/**
 * Web Push service worker. Deliberately minimal — no caching/offline strategy, this file exists
 * only to receive push events while no CRM tab is open and show/route the resulting notification.
 * See frontend/src/lib/pushNotifications.js for registration and frontend/src/context/
 * NotificationContext.jsx for when it's registered (same moment the app already asks for
 * Notification permission).
 */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'HindHolidays', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'HindHolidays';
  const options = {
    body: data.body || '',
    icon: '/favicon.ico',
    tag: data.tag || undefined,
    data: { href: data.href || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = event.notification.data?.href || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(href);
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(href);
      return undefined;
    })
  );
});
