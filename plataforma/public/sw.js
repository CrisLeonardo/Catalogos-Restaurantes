/* ============================================================
   SERVICE WORKER — push notifications + resiliencia de conexión (Fase 1)
   · Push: muestra la notificación en la barra del sistema del dispositivo
     incluso cuando el navegador está cerrado (sin cambios, ver abajo).
   · Fetch: precache del shell + caché del catálogo para que el comensal
     siga viendo el último menú si se corta la señal. Nunca cachea
     /admin, /super ni /central — mostrar ahí un estado viejo (pedidos,
     cocina) como si fuera el actual es peligroso, no solo desactualizado.
   Ver plataforma/docs/ARQUITECTURA_OFFLINE.md.
   ============================================================ */

const CACHE_VERSION = 'v3';
const STATIC_CACHE = `leogin-static-${CACHE_VERSION}`;
const PAGES_CACHE = `leogin-pages-${CACHE_VERSION}`;
const CACHE_NAMES = [STATIC_CACHE, PAGES_CACHE];
const OFFLINE_URL = '/offline.html';

/* El proxy (proxy.ts §3) reescribe SLUG-admin.dominio/algo → /admin/algo y
   SLUG-central.dominio/algo → /central/algo del lado del servidor: es
   transparente para el navegador, así que el `pathname` que ve ESTE fetch
   nunca lleva el prefijo "/admin" ni "/central" cuando el panel vive en su
   propio subdominio (el patrón de producción desde la migración a *-admin).
   Sin esto, `isBackofficePath('/pedidos')` daba `false` en ese subdominio —
   el candado de "nunca cachear el back-office" tenía un agujero del tamaño
   de la app entera ahí. Se calcula una sola vez: el host del Service Worker
   no cambia durante su vida. */
const BACKOFFICE_HOST = /^[a-z0-9-]+-(admin|central)(\.|$)/i.test(self.location.hostname);

const PRECACHE_ASSETS = [
  '/icon-192.png',
  '/icon-512.png',
  '/badge.svg',
  '/logo-mark.svg',
  OFFLINE_URL,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_ASSETS)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => !CACHE_NAMES.includes(k)).map((k) => caches.delete(k))),
      ),
    ]),
  );
});

/* ── Reglas de qué se cachea ─────────────────────────────────── */

/** /admin, /super y /central nunca se sirven cacheados (Nivel 1: cocina,
    mesero, pedidos — un estado viejo ahí puede hacer que se cocine dos
    veces o se confunda al mesero). Esas pantallas ya reconectan Realtime
    con su propio backoff; ver notifications.tsx / orders-panel.tsx. */
function isBackofficePath(pathname) {
  return BACKOFFICE_HOST
    || pathname.startsWith('/admin')
    || pathname.startsWith('/super')
    || pathname.startsWith('/central');
}

function isStaticAsset(pathname) {
  return pathname.startsWith('/_next/static/') || /\.(png|jpe?g|webp|gif|svg|ico|woff2?|ttf)$/.test(pathname);
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    return offline || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Las Server Actions (createOrder, etc.) van por POST — se dejan pasar
  // intactas, así nunca interfieren con la cola de reintento del checkout.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isBackofficePath(url.pathname)) return; // sin caché ni fallback aquí

  if (req.mode === 'navigate') {
    event.respondWith(networkFirstPage(req));
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
});

/* ── Push recibido del servidor (sin cambios) ───────────────── */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = {};
  try { data = event.data.json(); } catch { return; }

  const title = data.title || '🛎 Nuevo pedido';
  const options = {
    body:               data.body || 'Revisa los pedidos.',
    icon:               data.icon || '/icon-192.png',
    badge:              '/badge.svg',
    tag:                data.tag  || 'new-order',
    requireInteraction: data.requireInteraction === true,
    vibrate:            data.vibrate || [200, 100, 200],
    data:               { url: data.url || '/admin/pedidos' },
  };

  // Reenvía a las pestañas del admin ya abiertas: el push llega rápido y
  // sin depender del socket de Realtime, así que estas pestañas pueden
  // reaccionar (refrescar/sonar) al instante en vez de esperar su propio
  // canal o el polling de respaldo.
  const notifyClients = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((list) => {
      list.forEach((client) => client.postMessage({ type: 'push-notify', pushType: data.type || null }));
    });

  event.waitUntil(Promise.all([self.registration.showNotification(title, options), notifyClients]));
});

/* ── Clic en la notificación (sin cambios) ──────────────────── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/admin/pedidos';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // Si ya hay una pestaña del admin abierta, navega en ella.
      for (const client of list) {
        if (client.url.includes('/admin') && 'focus' in client) {
          if ('navigate' in client) client.navigate(url);
          return client.focus();
        }
      }
      // Si no, abre una nueva pestaña.
      return self.clients.openWindow(url);
    }),
  );
});
