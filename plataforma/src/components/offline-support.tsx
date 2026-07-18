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

export default function OfflineSupport() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
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
