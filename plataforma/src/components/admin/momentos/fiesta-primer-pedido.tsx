'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from '@/components/admin/panel-link';
import { Leo } from '@/components/leo';
import { fmtMoney } from '@/lib/money';
import { consultarPrimerPedido } from '@/lib/actions/momentos';
import type { PrimerPedido } from '@/lib/db/momentos';
import { Confeti } from '@/components/confeti';

/* ============================================================
   EL PRIMER PEDIDO ES UNA FIESTA (PLAN_MOMENTOS_PICO, P3)
   ------------------------------------------------------------
   Una sola vez en la vida del restaurante: el pedido número 1 es
   el momento que el dueño le va a contar a otros (regla del pico,
   estrategia §2.7). Se pregunta al servidor cuando entra un
   pedido nuevo (evento `order-new` de notifications.tsx) y al
   abrir el panel, por si el dueño no estaba mirando.

   Cada aparato lo recuerda en localStorage: «visto» después de
   cerrarlo, «no-aplica» cuando ya hay más pedidos de los que se
   celebran. A partir de ahí no vuelve a preguntar nunca.
   ============================================================ */

type Estado = 'visto' | 'no-aplica';

export default function FiestaPrimerPedido({ restaurantId, restaurantName }: { restaurantId: string; restaurantName: string }) {
  const [pedido, setPedido] = useState<PrimerPedido | null>(null);
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const clave = `leogin:primer-pedido:${restaurantId}`;

  useEffect(() => {
    let guardado: string | null = null;
    try { guardado = localStorage.getItem(clave); } catch { /* sin almacenamiento: pregunta igual */ }
    if (guardado) return;

    let vivo = true;
    const guardar = (v: Estado) => { try { localStorage.setItem(clave, v); } catch { /* nada */ } };
    const consultar = () => {
      consultarPrimerPedido(restaurantId)
        .then((r) => {
          if (!vivo) return;
          if (r.pedido) setPedido(r.pedido);
          else if (r.yaNoAplica) guardar('no-aplica');
        })
        .catch(() => { /* sin red: ya preguntará con el siguiente pedido */ });
    };
    consultar();
    // El aviso llega con el INSERT: se espera un instante a que la fila
    // sea visible para el conteo.
    let t: ReturnType<typeof setTimeout> | null = null;
    const alLlegar = () => { if (t) clearTimeout(t); t = setTimeout(consultar, 1200); };
    window.addEventListener('order-new', alLlegar);
    return () => {
      vivo = false;
      if (t) clearTimeout(t);
      window.removeEventListener('order-new', alLlegar);
    };
  }, [clave, restaurantId]);

  useEffect(() => {
    if (!pedido) return;
    cerrarRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido]);

  function cerrar() {
    try { localStorage.setItem(clave, 'visto'); } catch { /* nada */ }
    setPedido(null);
  }

  if (!pedido) return null;

  const detalle = [pedido.numero ? `Pedido ${pedido.numero}` : null, pedido.cliente, fmtMoney(pedido.total)]
    .filter(Boolean)
    .join(' · ');

  // A <body>: el panel anima sus contenedores con transform, y dentro de
  // uno así `position: fixed` deja de ser la pantalla entera.
  return createPortal(
    <div className="fiesta-fondo" role="dialog" aria-modal="true" aria-labelledby="fiesta-titulo">
      <div className="fiesta-tarjeta">
        <div className="fiesta-leo">
          <Confeti piezas={40} />
          <Leo id="leo-primer-pedido" expresion="feliz" size={128} />
        </div>
        <h2 id="fiesta-titulo" className="t-display" style={{ fontSize: 24, margin: '6px 0 0', color: 'var(--u-text)' }}>
          ¡Llegó tu primer pedido!
        </h2>
        <p className="t-mono" style={{ fontSize: 14, color: 'var(--u-text-2)', margin: '8px 0 0' }}>{detalle}</p>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--u-text-3)', margin: '10px 0 0', maxWidth: '34ch' }}>
          El primero de muchos. Hoy {restaurantName} empezó a vender con Leogin.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link
            href="/admin/pedidos"
            onClick={cerrar}
            className="btn-accent press inline-flex min-h-11 items-center rounded-adm-md px-5 text-[14px] font-semibold no-underline"
          >
            Ver el pedido
          </Link>
          <button
            ref={cerrarRef}
            type="button"
            onClick={cerrar}
            className="press inline-flex min-h-11 items-center rounded-adm-md border border-adm-border bg-adm-card px-5 text-[14px] font-semibold text-adm-text"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
