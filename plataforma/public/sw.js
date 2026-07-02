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
