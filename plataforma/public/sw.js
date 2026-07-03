/* ============================================================
   Service Worker Leogin
   1) Web Push (panel admin) — notificación en la barra del sistema.
   2) OFFLINE (Fase 0 del plan): el menú del comensal y las pantallas
      del staff abren con el último snapshot cuando no hay señal.

   Estrategias:
   · Navegaciones (HTML) y payloads RSC → network-first con respaldo
     en caché por URL. Con señal SIEMPRE se ve lo fresco; sin señal,
     el último snapshot + banner (lo pinta la app con useOnline).
   · /_next/static → cache-first (assets inmutables con hash).
   · Imágenes y fuentes (Google Fonts) → stale-while-revalidate.
   · JAMÁS se cachean: POST/server actions, /auth/*, /api/*, Supabase.

   Versionado (lección de ERRORES.md): subir VERSION invalida TODOS
   los cachés viejos en activate. Las navegaciones son network-first,
   así que nunca se sirve HTML viejo estando en línea.
   ============================================================ */

const VERSION = 'v1';
const PAGE_CACHE   = `leogin-pages-${VERSION}`;
const STATIC_CACHE = `leogin-static-${VERSION}`;
const MEDIA_CACHE  = `leogin-media-${VERSION}`;
const CURRENT = new Set([PAGE_CACHE, STATIC_CACHE, MEDIA_CACHE]);

const MEDIA_MAX_ENTRIES = 80;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('leogin-') && !CURRENT.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

/* ── Utilidades de caché ────────────────────────────────────── */

async function putSafe(cacheName, request, response) {
  // Solo respuestas completas y sanas (nada de errores ni parciales 206).
  if (!response || response.status !== 200 || response.type === 'opaque') return;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
    if (cacheName === MEDIA_CACHE) trimCache(cache);
  } catch {
    /* cuota llena u otro fallo: cachear es best-effort */
  }
}

async function trimCache(cache) {
  try {
    const keys = await cache.keys();
    if (keys.length > MEDIA_MAX_ENTRIES) {
      // FIFO simple: borra las más viejas (keys() preserva orden de inserción).
      await Promise.all(keys.slice(0, keys.length - MEDIA_MAX_ENTRIES).map((k) => cache.delete(k)));
    }
  } catch { /* best-effort */ }
}

function offlineFallbackHtml() {
  return new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sin conexión</title>
<style>
  body{margin:0;min-height:100svh;display:grid;place-items:center;background:#0b0b0c;color:#F5F3EF;font-family:system-ui,sans-serif;text-align:center;padding:24px}
  .card{max-width:340px}
  h1{font-size:20px;margin:0 0 8px}
  p{font-size:14px;line-height:1.5;color:rgba(245,243,239,.7);margin:0 0 18px}
  button{background:#D97757;color:#fff;border:none;border-radius:999px;padding:12px 22px;font-size:14px;font-weight:600;cursor:pointer}
</style></head><body><div class="card">
<h1>Sin conexión</h1>
<p>No hay internet y esta página no se había abierto antes en este dispositivo. Revisa tu señal e intenta de nuevo.</p>
<button onclick="location.reload()">Reintentar</button>
</div></body></html>`,
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

/* ── Fetch: enrutador de estrategias ───────────────────────── */

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // server actions/POST: siempre red

  const url = new URL(req.url);

  // Mismo origen: rutas excluidas del caché (estado vivo o sensibles).
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

    // Assets inmutables de Next (nombre con hash) → cache-first.
    if (url.pathname.startsWith('/_next/static/')) {
      event.respondWith(cacheFirst(STATIC_CACHE, req));
      return;
    }

    // Imágenes optimizadas / públicas → stale-while-revalidate.
    if (url.pathname.startsWith('/_next/image') || req.destination === 'image') {
      event.respondWith(staleWhileRevalidate(MEDIA_CACHE, req));
      return;
    }

    // Navegaciones y payloads RSC (navegación del App Router) → network-first.
    const isRsc = url.searchParams.has('_rsc') || req.headers.get('RSC') === '1';
    if (req.mode === 'navigate' || isRsc) {
      event.respondWith(networkFirst(PAGE_CACHE, req, req.mode === 'navigate'));
      return;
    }
    return; // resto del mismo origen: red normal
  }

  // Google Fonts (tipografías de los tenants) → cache-first (inmutables).
  if (url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com') {
    event.respondWith(cacheFirst(STATIC_CACHE, req));
    return;
  }

  // Supabase (imágenes del menú en Storage) → SWR solo para imágenes.
  if (req.destination === 'image') {
    event.respondWith(staleWhileRevalidate(MEDIA_CACHE, req));
  }
  // Cualquier otro tercero (Supabase auth/rest/realtime): red normal.
});

async function cacheFirst(cacheName, req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  putSafe(cacheName, req, res);
  return res;
}

async function networkFirst(cacheName, req, isNavigation) {
  try {
    const res = await fetch(req);
    putSafe(cacheName, req, res);
    return res;
  } catch {
    const hit = await caches.match(req);
    if (hit) return hit;
    return isNavigation ? offlineFallbackHtml() : Response.error();
  }
}

async function staleWhileRevalidate(cacheName, req) {
  const hit = await caches.match(req);
  const refresh = fetch(req)
    .then((res) => { putSafe(cacheName, req, res); return res; })
    .catch(() => null);
  return hit ?? (await refresh) ?? Response.error();
}

/* ── Push recibido del servidor ─────────────────────────────── */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = {};
  try { data = event.data.json(); } catch { return; }

  const title = data.title || '🛎 Nuevo pedido';
  const options = {
    body:               data.body || 'Revisa los pedidos.',
    icon:               '/icon-192.png',
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

/* ── Clic en la notificación ───────────────────────────────── */
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
