'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icons';

/* «Avisarme en este celular» — los avisos graves de la salud de los
   clientes (MON-04) llegan a los aparatos donde el Super Admin lo pulsó.
   Mismo service worker (/sw.js) y misma clave VAPID que los avisos de los
   restaurantes (components/admin/notifications.tsx); otra lista. */

function urlBase64ToUint8Array(b64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer as ArrayBuffer;
}

type Estado = 'cargando' | 'no-soportado' | 'sin-clave' | 'apagado' | 'encendido' | 'bloqueado';

export default function SuperPushToggle() {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return vivo && setEstado('no-soportado');
      if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return vivo && setEstado('sin-clave');
      if (Notification.permission === 'denied') return vivo && setEstado('bloqueado');
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        const sub = await reg.pushManager.getSubscription();
        if (vivo) setEstado(sub ? 'encendido' : 'apagado');
      } catch {
        if (vivo) setEstado('no-soportado');
      }
    })();
    return () => { vivo = false; };
  }, []);

  async function encender() {
    setOcupado(true);
    setError(null);
    try {
      if ((await Notification.requestPermission()) !== 'granted') {
        setEstado('bloqueado');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
      const json = sub.toJSON();
      const res = await fetch('/api/push/super', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'No se pudo activar.');
        return;
      }
      setEstado('encendido');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo activar.');
    } finally {
      setOcupado(false);
    }
  }

  async function apagar() {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/super', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        // Ojo: no se da de baja la suscripción del navegador — el mismo
        // aparato puede estar recibiendo los avisos de un restaurante.
      }
      setEstado('apagado');
    } finally {
      setOcupado(false);
    }
  }

  if (estado === 'cargando' || estado === 'no-soportado') return null;

  const texto: Record<Exclude<Estado, 'cargando' | 'no-soportado'>, string> = {
    'sin-clave': 'Los avisos al celular necesitan las claves VAPID en el servidor.',
    bloqueado: 'Este navegador tiene bloqueadas las notificaciones de Leogin. Actívalas en sus ajustes.',
    apagado: 'Te avisamos aquí de lo urgente: la PC de un local caída en horario o muchas comandas sin imprimir.',
    encendido: 'Este aparato recibe los avisos urgentes de tus clientes.',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
      <Icon name={estado === 'encendido' ? 'bellRing' : 'bell'} size={15} style={{ color: 'var(--u-text-3)' }} />
      <span className="t-mute" style={{ fontSize: 12, flex: '1 1 220px', lineHeight: 1.4 }}>{error ?? texto[estado]}</span>
      {estado === 'apagado' && (
        <Button size="sm" variant="outline" onClick={encender} disabled={ocupado}>
          {ocupado ? 'Activando…' : 'Avisarme en este celular'}
        </Button>
      )}
      {estado === 'encendido' && (
        <Button size="sm" variant="ghost" onClick={apagar} disabled={ocupado}>Dejar de avisarme aquí</Button>
      )}
    </div>
  );
}
