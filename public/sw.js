// PWA Service Worker for Altrix Core — The AI-Powered Institute Operating System
// Handles offline caching strategy, push notifications, click handlers, and instant cache purging.

const CACHE_NAME = 'altrix-core-v8';
const ASSETS_TO_CACHE = [
  '/favicon.ico',
  '/pwa-512.png',
  '/placeholder.svg',
  '/robots.txt'
];

// Install: Cache essential static assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activate: Cleanup ALL old caches and immediately claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting outdated cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Message handler to allow instant manual cache purges from web client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((keys) => {
      return Promise.all(keys.map((k) => caches.delete(k)));
    }).then(() => {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: true });
      }
    });
  }
});

// Fetch: Network-First for Navigation & Assets, Network-Only for APIs
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip caching for API requests, non-GET, or external providers
  if (
    url.pathname.startsWith('/api') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // 1. Navigation requests (HTML / SPA routing): ALWAYS Network-First
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match('/index.html') || caches.match('/'))
    );
    return;
  }

  // 2. JavaScript, CSS, and Dynamic Chunks: ALWAYS Network-First with Cache Fallback
  if (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 3. Static Media/Icons: Cache-First
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      });
    })
  );
});

// Push: Handle push notifications from backend (with badges, buttons, actions, and custom vibrations)
self.addEventListener('push', (event) => {
  if (!event.data) {
    console.warn('[Service Worker] Push event received with no data.');
    return;
  }

  try {
    const payload = event.data.json();
    const title = payload.title || 'AltRix Update';
    
    // Choose icon / badge based on category
    let icon = '/pwa-512.png';
    let badge = '/pwa-512.png';
    let vibrate = [100, 50, 100]; // default vibration pattern

    if (payload.category === 'attendance') {
      vibrate = [200, 100, 200];
    } else if (payload.category === 'fees') {
      vibrate = [300, 100, 100, 100, 300];
    } else if (payload.category === 'grades') {
      vibrate = [150, 50, 150];
    }

    const options = {
      body: payload.body || 'You have a new update in AltRix.',
      icon: icon,
      badge: badge,
      vibrate: vibrate,
      data: {
        url: payload.url || '/',
        notificationId: payload.id || null,
        category: payload.category || 'general'
      },
      tag: payload.tag || 'altrix-notification',
      renotify: true,
      actions: [
        { action: 'open', title: 'Open AltRix' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (err) {
    console.error('[Service Worker] Push notification parse error:', err);
    event.waitUntil(
      self.registration.showNotification('AltRix Update', {
        body: event.data.text() || 'New alert received.',
        icon: '/pwa-512.png',
        badge: '/pwa-512.png'
      })
    );
  }
});

// Notification Click: Navigate to target URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// Set App Badges for unread counter (if supported)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_BADGE') {
    const count = event.data.count || 0;
    if (navigator.setAppBadge) {
      if (count > 0) {
        navigator.setAppBadge(count).catch(console.error);
      } else {
        navigator.clearAppBadge().catch(console.error);
      }
    }
  }
});
