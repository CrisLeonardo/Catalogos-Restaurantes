'use client';

/* ============================================================
   Soporte offline (Fase 0): registro del Service Worker + banner
   de conexión. Se monta una vez por superficie (menú del comensal,
   panel admin, mesero, cocina, panel de grupo).

   El SW (public/sw.js) cachea el app-shell y las páginas visitadas:
   con este componente montado, la pantalla abre aunque no haya señal
   y este banner avisa que se trabaja con la última copia.
   ============================================================ */

import { useEffect } from 'react';
import { useOnline } from '@/lib/offline/use-online';

export default function OfflineSupport({ label }: { label?: string }) {
  const online = useOnline();

  // Registro del SW (idempotente; notifications.tsx también lo registra al
  // activar push — register() con la misma URL devuelve el mismo registro).
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => { /* opcional */ });
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '8px 14px calc(8px)',
        background: '#b45309', color: '#fff',
        fontSize: 12.5, fontWeight: 600, letterSpacing: '0.01em',
        boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
      }}
    >
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: '#fff', opacity: 0.9, animation: 'pulse-ring 2s infinite' }} />
      {label ?? 'Sin conexión — trabajando con la última copia. Todo lo pendiente se enviará al volver la señal.'}
    </div>
  );
}
