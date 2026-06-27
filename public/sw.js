// PWA Web Push Service Worker for handling background notifications
self.addEventListener('push', function (event) {
  if (!event.data) {
    console.warn('[Service Worker] Push event received with no data.');
    return;
  }

  try {
    const payload = event.data.json();
    const title = payload.title || 'New Update';
    const options = {
      body: payload.body || '',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      tag: payload.category || 'general',
      data: {
        id: payload.id,
        action_url: payload.action_url || ''
      },
      requireInteraction: false
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (e) {
    console.error('[Service Worker] Failed to parse push payload:', e);
  }
});

self.addEventListener('notificationclick', function (event) {
  const notification = event.notification;
  notification.close();

  const actionUrl = notification.data ? notification.data.action_url : '';
  const targetUrl = actionUrl ? `${self.location.origin}${actionUrl}` : self.location.origin;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // If there is already a window open, focus it and navigate to the target URL
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client && actionUrl) {
            return client.navigate(targetUrl);
          }
          return;
        }
      }
      // If no window is open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
