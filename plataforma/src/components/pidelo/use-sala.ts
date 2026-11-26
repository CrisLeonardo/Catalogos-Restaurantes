'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { EVENTO_ETAPA, EVENTO_PEDIDO, canalDeSala, limpiarEtapa, limpiarPedido, type EtapaDemo, type PedidoDemo } from '@/lib/pidelo';

/* La sala de «Pídelo tú mismo» por Supabase Realtime (ver lib/pidelo.ts).
   Difusión pura: nada pasa por la base ni por RLS. Se usa el cliente del
   comensal porque los dos lados son páginas públicas (la demo y la web);
   ninguna sesión de por medio.

   `listo` dice si el canal ya se suscribió: el celular espera a estarlo
   antes de mandar, y la PC lo usa para no prometer «aparece aquí» si la
   conexión falló. */
export function useSala(sala: string | null, alRecibir?: (p: PedidoDemo) => void, alCambiarEtapa?: (e: EtapaDemo) => void) {
  const canal = useRef<RealtimeChannel | null>(null);
  const [listo, setListo] = useState(false);
  const [fallo, setFallo] = useState(false);
  const recibir = useRef(alRecibir);
  useEffect(() => { recibir.current = alRecibir; }, [alRecibir]);
  const etapa = useRef(alCambiarEtapa);
  useEffect(() => { etapa.current = alCambiarEtapa; }, [alCambiarEtapa]);

  useEffect(() => {
    if (!sala) return;
    // El cliente de Supabase (~75 KB comprimidos) se pide al conectar la
    // sala, no con la página: así no retrasa que la portada responda al
    // tacto (auditoría LZ-12). `listo` ya cubre la espera.
    let vigente = true;
    let quitar: (() => void) | null = null;
    import('@/lib/supabase/client').then(({ createDinerClient }) => {
      if (!vigente) return;
      const supabase = createDinerClient();
      const ch = supabase.channel(canalDeSala(sala), { config: { broadcast: { self: false, ack: true } } });
      ch.on('broadcast', { event: EVENTO_PEDIDO }, ({ payload }) => {
        const pedido = limpiarPedido(payload);
        if (pedido) recibir.current?.(pedido);
      });
      ch.on('broadcast', { event: EVENTO_ETAPA }, ({ payload }) => {
        const e = limpiarEtapa(payload);
        if (e) etapa.current?.(e);
      });
      ch.subscribe((estado) => {
        if (estado === 'SUBSCRIBED') { setListo(true); setFallo(false); }
        if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') setFallo(true);
      });
      canal.current = ch;
      quitar = () => { supabase.removeChannel(ch); };
    }).catch(() => { if (vigente) setFallo(true); });
    return () => {
      vigente = false;
      canal.current = null;
      setListo(false);
      quitar?.();
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

  /** Avisa a la otra pantalla que el pedido pasó de etapa. */
  const enviarEtapa = useCallback((e: EtapaDemo) => {
    void canal.current?.send({ type: 'broadcast', event: EVENTO_ETAPA, payload: { etapa: e } }).catch(() => {});
  }, []);

  return { listo, fallo, enviar, enviarEtapa };
}
