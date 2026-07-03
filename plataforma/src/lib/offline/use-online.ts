'use client';

/* ============================================================
   Detección de conexión (Fase 0 del plan offline)
   ------------------------------------------------------------
   `navigator.onLine` miente en el caso MÁS común de un restaurante:
   WiFi conectado pero sin internet (router vivo, ISP caído). Por eso:
   · online/offline del navegador → reacción inmediata.
   · ping ligero a /api/health → la verdad cuando hay dudas.
   · mientras estamos "offline", se sondea cada 15 s para detectar
     la vuelta de la señal aunque el navegador no dispare eventos.
   · cualquier código puede avisar "sospecho que no hay red" con
     reportConnectivityProblem() (p. ej. un server action que falló):
     el hook sondea al instante y el banner aparece sin esperar.
   ============================================================ */

import { useEffect, useRef, useState } from 'react';

const SUSPECT_EVENT = 'leogin:connectivity-suspect';
const PROBE_INTERVAL_MS = 15_000;
const PROBE_TIMEOUT_MS = 5_000;

/** Avisa al hook que una petición real falló (probable pérdida de señal). */
export function reportConnectivityProblem(): void {
  try { window.dispatchEvent(new Event(SUSPECT_EVENT)); } catch { /* SSR */ }
}

async function probeHealth(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch('/api/health', { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  const onlineRef = useRef(true);
  useEffect(() => { onlineRef.current = online; }, [online]);

  useEffect(() => {
    let alive = true;
    let probing = false;

    async function probe() {
      if (probing) return;
      probing = true;
      const ok = await probeHealth();
      probing = false;
      if (alive) setOnline(ok);
    }

    function onOnline() { probe(); }
    function onOffline() { setOnline(false); }
    function onSuspect() { probe(); }

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener(SUSPECT_EVENT, onSuspect);

    // Estado inicial: si el navegador ya sabe que no hay red, créele;
    // si dice que sí, no gastamos un ping (los fallos reales disparan
    // el evento de sospecha).
    if (!navigator.onLine) setOnline(false);

    // Mientras estamos offline, sondear la recuperación.
    const timer = setInterval(() => {
      if (!onlineRef.current || !navigator.onLine) probe();
    }, PROBE_INTERVAL_MS);

    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener(SUSPECT_EVENT, onSuspect);
    };
  }, []);

  return online;
}
