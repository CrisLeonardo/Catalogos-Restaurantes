/* Service Worker — notificaciones de pedidos nuevos
   Muestra la notificación en la barra del sistema (incluso con la pestaña en segundo plano).
   Se activa cuando Supabase Realtime detecta un pedido nuevo y el cliente lo despacha
   desde AdminNotifications. */

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { return; }
  event.waitUntil(
    self.registration.showNotification(data.title || '🛎 Nuevo pedido', {
      body: data.body || 'Revisa los pedidos.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'new-order',
      requireInteraction: false,
      data: { url: data.url || '/admin/pedidos' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/admin/pedidos';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes('/admin') && 'focus' in client) {
          if ('navigate' in client) client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
