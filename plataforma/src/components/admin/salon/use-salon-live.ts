'use client';

/* ============================================================
   EL SALÓN, EN VIVO
   ------------------------------------------------------------
   Las dos pantallas del salón miran el mismo local, pero no se
   enteraban igual de lo que pasaba en él:

     · «Tomar pedidos» estaba suscrito a Realtime y reaccionaba al
       momento;
     · «Pedidos › Mesas» se refrescaba con un temporizador de 60 s y
       nada más — el encargado, que es quien reparte el trabajo,
       podía estar un minuto entero mirando un salón que ya no era.

   Y encima cada una traía su propia copia del mismo montaje: canal,
   freno de ráfagas y (solo en una) reconexión. Aquí vive una sola
   vez.

   Tres cosas que hacen falta y que se aprendieron a golpes:

     1. FRENO DE RÁFAGAS. La cola del hub sincronizando veinte
        pedidos de golpe disparaba un re-render completo POR EVENTO
        y congelaba la tablet. Máximo un refresco cada 2,5 s.
     2. RECONEXIÓN CON ESPERA CRECIENTE. Sin ella el canal se muere
        en silencio (red inestable, portátil suspendido) y la
        pantalla se queda congelada hasta que alguien recarga.
     3. RED DE SEGURIDAD. Un temporizador lento por si el canal
        nunca llegó a conectarse.
   ============================================================ */

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { syncRealtimeAuth } from '@/lib/supabase/realtime-auth';

/** Un pedido nuevo o cambiado, o una llamada de mesa: las dos cosas
    cambian el salón exactamente igual. */
const TABLAS = ['orders', 'waiter_calls'] as const;

const COALESCE_MS = 2500;
/** Por si el canal nunca conectó. Lento a propósito: es una red, no el
    mecanismo (antes ESTE temporizador era el único que había, a 60 s). */
const FALLBACK_MS = 5 * 60_000;

export function useSalonLive(canal: string) {
  const router = useRouter();

  /* Freno de ráfagas: el primer evento programa el refresco y los
     siguientes caen dentro de la misma ventana. El último evento de una
     ráfaga siempre queda cubierto. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef(0);
  const refreshSoon = useCallback(() => {
    if (timer.current) return;
    const wait = Math.max(0, COALESCE_MS - (Date.now() - last.current));
    timer.current = setTimeout(() => {
      timer.current = null;
      last.current = Date.now();
      router.refresh();
    }, wait);
  }, [router]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;

    const supabase = createClient();
    const { ready, stop: stopAuthSync } = syncRealtimeAuth(supabase);

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let espera = 2000;

    function connect() {
      if (cancelled) return;
      let cerrando = false;

      /* El sufijo aleatorio evita que dos pestañas del mismo panel
         peleen por el mismo nombre de canal. */
      let ch = supabase.channel(`${canal}-${crypto.randomUUID().slice(0, 8)}`);
      for (const table of TABLAS) {
        ch = ch
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, refreshSoon)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, refreshSoon);
      }

      ch.subscribe((status) => {
        if (cancelled || cerrando) return;
        if (status === 'SUBSCRIBED') { espera = 2000; return; }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          cerrando = true;
          supabase.removeChannel(ch);
          retry = setTimeout(connect, espera);
          espera = Math.min(espera * 2, 30_000);
        }
      });

      channel = ch;
    }

    (async () => {
      await ready;
      connect();
    })();

    const red = setInterval(() => router.refresh(), FALLBACK_MS);

    return () => {
      cancelled = true;
      clearInterval(red);
      if (retry) clearTimeout(retry);
      if (channel) supabase.removeChannel(channel);
      stopAuthSync();
    };
  }, [canal, refreshSoon, router]);
}
