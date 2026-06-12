/* ============================================================
   Service Worker — Web Push notifications para el panel admin
   · Muestra la notificación en la barra del sistema del dispositivo
     incluso cuando el navegador está cerrado.
   · El servidor (createOrder) dispara el push usando VAPID.
   ============================================================ */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/* ── Push recibido del servidor ─────────────────────────────── */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = {};
  try { data = event.data.json(); } catch { return; }

  const title = data.title || '🛎 Nuevo pedido';
  const options = {
    body:             data.body || 'Revisa los pedidos.',
    icon:             '/icon-192.png',
    badge:            '/icon-192.png',
    tag:              data.tag  || 'new-order',
    requireInteraction: false,
    data:             { url: data.url || '/admin/pedidos' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
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
