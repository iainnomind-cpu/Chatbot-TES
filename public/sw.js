// === Service Worker — TES CRM ===
// Maneja caché offline + notificaciones push

const CACHE_NAME = 'tes-crm-v1';
const OFFLINE_URL = '/';

// Recursos a cachear al instalar
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// ─── INSTALACIÓN ────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Error pre-cacheando:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ─── ACTIVACIÓN ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activado');
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH: Network-first para APIs, Cache-first para assets ─
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // No interceptar requests de otras origenes
  if (url.origin !== self.location.origin) return;

  // APIs siempre van a la red (no cachear)
  if (url.pathname.startsWith('/api/')) return;

  // Para el resto: Network-first con fallback a caché
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Solo cachear respuestas exitosas de tipo basic
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Sin red: buscar en caché
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // Si es navegación, mostrar la página principal cacheada
          if (request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
        });
      })
  );
});

// ─── PUSH NOTIFICATIONS ─────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'TES CRM', body: 'Tienes un nuevo mensaje', url: '/inbox' };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (e) {
    console.warn('[SW] Error parsing push data:', e);
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: data.tag || 'tes-notif',
    renotify: true,
    data: { url: data.url || '/inbox' },
    vibrate: [200, 100, 200],
    actions: [
      { action: 'open', title: 'Ver mensaje' },
      { action: 'close', title: 'Cerrar' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ─── CLICK EN NOTIFICACIÓN ──────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  const urlDestino = event.notification.data?.url || '/inbox';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si ya hay una ventana abierta, enfocarla y navegar
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          return client.navigate(urlDestino);
        }
      }
      // Si no hay ventana, abrir una nueva
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlDestino);
      }
    })
  );
});
