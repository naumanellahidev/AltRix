// PWA Service Worker for AltRix Parent Portal
// Handles offline caching strategy, push notifications, click handlers, and app badges.

const CACHE_NAME = 'altrix-parent-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/pwa-512.png',
  '/placeholder.svg',
  '/robots.txt'
];

// Install: Cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Cleanup old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Stale-While-Revalidate pattern for cached assets, network-only for APIs
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip caching for API requests or Supabase traffic
  if (
    url.pathname.startsWith('/api') ||
    url.hostname.includes('supabase.co') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch new version in background to update cache
        fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {/* Ignore backend fetch errors when offline */});
        return cachedResponse;
      }
      return fetch(event.request);
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
      body: payload.body || '',
      icon: icon,
      badge: badge,
      tag: payload.category || 'general',
      data: {
        id: payload.id,
        action_url: payload.action_url || '',
        category: payload.category
      },
      vibrate: vibrate,
      requireInteraction: payload.category === 'fees' || payload.category === 'attendance',
      actions: []
    };

    // Add contextual action buttons
    if (payload.category === 'fees') {
      options.actions = [
        { action: 'pay', title: 'Pay Fee Now' },
        { action: 'dismiss', title: 'Dismiss' }
      ];
    } else if (payload.category === 'attendance') {
      options.actions = [
        { action: 'view_attendance', title: 'View Attendance' }
      ];
    } else if (payload.category === 'messages') {
      options.actions = [
        { action: 'reply', title: 'View Messages' }
      ];
    }

    // Set badge count on the PWA icon if supported
    if ('setAppBadge' in self.navigator) {
      // Increment app badge count asynchronously
      self.navigator.setAppBadge().catch(err => console.warn('Failed to set badge count:', err));
    }

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (e) {
    console.error('[Service Worker] Failed to parse push payload:', e);
  }
});

// Click: Handle clicking on notifications or their action buttons
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  notification.close();

  // Clear app badge if clicked
  if ('clearAppBadge' in self.navigator) {
    self.navigator.clearAppBadge().catch(() => {});
  }

  const action = event.action;
  const data = notification.data || {};
  let actionUrl = data.action_url || '';

  // Override url if specific action buttons were clicked
  if (action === 'pay') {
    actionUrl = actionUrl.includes('/fees') ? actionUrl : `${actionUrl}/fees`;
  } else if (action === 'view_attendance') {
    actionUrl = actionUrl.includes('/attendance') ? actionUrl : `${actionUrl}/attendance`;
  }

  const targetUrl = actionUrl ? `${self.location.origin}${actionUrl}` : self.location.origin;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window or open a new one
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      
      // If window isn't on the exact page but exists, navigate it
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('focus' in client && 'navigate' in client) {
          client.focus();
          return client.navigate(targetUrl);
        }
      }

      // If no window is open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
