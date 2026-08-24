'use client';

/* ============================================================
   OFFLINE SUPPORT — Fase 1 de la arquitectura offline
   ------------------------------------------------------------
   · Registra /sw.js (precache + caché del catálogo). Idempotente con el
     registro que ya hace admin/notifications.tsx para push: el navegador
     devuelve el registro existente si ya estaba registrado.
   · Muestra una barra fija superior cuando el dispositivo pierde
     conexión. Puramente informativa — no implica que se estén cacheando
     datos (en /admin, /super y /central el Service Worker deliberadamente
     no cachea nada, ver public/sw.js).
   ============================================================ */

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';
import { getStableLinkPrefix } from '@/lib/tenant-client';

export default function OfflineSupport() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      // Bajo el link estable de mesa (dominio raíz), el scope tiene que
      // quedar acotado a `/m/<restaurantId>/` — si no, el SW de un
      // restaurante interceptaría fetches de otro restaurante (o de la
      // landing) bajo el mismo dominio raíz. En el caso normal (subdominio
      // propio del tenant, o panel admin) el prefijo es null y el scope por
      // defecto ('/') sigue igual que siempre.
      const prefix = getStableLinkPrefix();
      const options = prefix ? { scope: `${prefix}/` } : undefined;
      navigator.serviceWorker.register('/sw.js', options).then((reg) => {
        // El SW nuevo ya se activa solo (skipWaiting + clients.claim en
        // sw.js), pero una pestaña que quedó abierta desde antes no se
        // entera: sigue corriendo el JS viejo en memoria aunque el SW ya
        // cambió de dueño. `controllerchange` es el aviso de que eso pasó
        // — recargar es lo único que trae el bundle nuevo a esa pestaña.
        // Guardia contra doble disparo: el evento puede llegar más de una
        // vez si hay varias pestañas del mismo origen.
        let reloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloaded) return;
          reloaded = true;
          window.location.reload();
        });
        // El navegador solo revisa si hay un sw.js nuevo al navegar; en una
        // PWA instalada que rara vez navega (se reabre desde el ícono y ya)
        // eso puede tardar. Forzar la revisión ahora adelanta el aviso.
        reg.update().catch(() => {});
      }).catch(() => {});
    }

    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="anim-fade-up"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 'calc(8px + env(safe-area-inset-top, 0px)) 16px 8px',
        background: '#f59e0b',
        color: '#1a1206',
        fontSize: 12.5,
        fontWeight: 700,
        textAlign: 'center',
      }}
    >
      <Icon name="alertCircle" size={15} />
      Sin conexión — mostrando la última información guardada
    </div>
  );
}
