'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createDinerClient } from '@/lib/supabase/client';
import { EVENTO_PEDIDO, canalDeSala, limpiarPedido, type PedidoDemo } from '@/lib/pidelo';

/* La sala de «Pídelo tú mismo» por Supabase Realtime (ver lib/pidelo.ts).
   Difusión pura: nada pasa por la base ni por RLS. Se usa el cliente del
   comensal porque los dos lados son páginas públicas (la demo y la web);
   ninguna sesión de por medio.

   `listo` dice si el canal ya se suscribió: el celular espera a estarlo
   antes de mandar, y la PC lo usa para no prometer «aparece aquí» si la
   conexión falló. */
export function useSala(sala: string | null, alRecibir?: (p: PedidoDemo) => void) {
  const canal = useRef<RealtimeChannel | null>(null);
  const [listo, setListo] = useState(false);
  const [fallo, setFallo] = useState(false);
  const recibir = useRef(alRecibir);
  useEffect(() => { recibir.current = alRecibir; }, [alRecibir]);

  useEffect(() => {
    if (!sala) return;
    const supabase = createDinerClient();
    const ch = supabase.channel(canalDeSala(sala), { config: { broadcast: { self: false, ack: true } } });
    ch.on('broadcast', { event: EVENTO_PEDIDO }, ({ payload }) => {
      const pedido = limpiarPedido(payload);
      if (pedido) recibir.current?.(pedido);
    });
    ch.subscribe((estado) => {
      if (estado === 'SUBSCRIBED') { setListo(true); setFallo(false); }
      if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') setFallo(true);
    });
    canal.current = ch;
    return () => {
      canal.current = null;
      setListo(false);
      supabase.removeChannel(ch);
    };
  }, [sala]);

  /** Manda el pedido a la sala. Devuelve si el canal lo aceptó. */
  const enviar = useCallback(async (pedido: PedidoDemo): Promise<boolean> => {
    const ch = canal.current;
    if (!ch) return false;
    try {
      const r = await ch.send({ type: 'broadcast', event: EVENTO_PEDIDO, payload: pedido });
      return r === 'ok';
    } catch {
      return false;
    }
  }, []);

  return { listo, fallo, enviar };
}
