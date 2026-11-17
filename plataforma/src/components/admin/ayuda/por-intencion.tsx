'use client';

/* ============================================================
   AYUDA POR LO QUE NECESITAS (ficha 2.9)
   ------------------------------------------------------------
     · CasosComunes ... los cinco casos de todos los días, a un toque.
     · Respuestas ..... la primera resuelve: un botón a la pantalla
                        exacta, o el diagnóstico en vivo de «No me
                        entran pedidos». Si la persona no puede abrir
                        esa pantalla, se dice a quién pedírselo.
   El índice está en `lib/ayuda/intenciones.ts`.
   ============================================================ */

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from '@/components/admin/panel-link';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { diagnosticoDePedidos } from '@/lib/actions/ayuda';
import { reanudarPedidos } from '@/lib/actions/restaurant';
import { INTENCIONES, type IdIntencion, type Intencion } from '@/lib/ayuda/intenciones';
import type { PuntoDiagnostico } from '@/lib/ayuda/diagnostico';
import s from './ayuda.module.css';

export function CasosComunes({ onElegir }: { onElegir: (titulo: string) => void }) {
  return (
    <div className={s.chips}>
      {INTENCIONES.filter((i) => i.comun).map((i) => (
        <button key={i.id} type="button" className={s.chip} onClick={() => onElegir(i.titulo)}>{i.titulo}</button>
      ))}
    </div>
  );
}

export function Respuestas({ intenciones, abribles, restaurantId, onGuia, onElegir }: {
  intenciones: Intencion[];
  abribles: ReadonlySet<IdIntencion>;
  restaurantId: string | null;
  /** Abre y lleva a la guía del centro de ayuda. */
  onGuia: (id: string) => void;
  onElegir: (titulo: string) => void;
}) {
  if (intenciones.length === 0) return null;
  const [primera, ...otras] = intenciones;
  return (
    <div className={s.respuestas}>
      {primera.diagnostico
        ? <Diagnostico titulo={primera.titulo} restaurantId={restaurantId} />
        : <Respuesta it={primera} abrible={abribles.has(primera.id)} onGuia={onGuia} />}
      {otras.length > 0 && (
        <div className={s.tambien}>
          <span className={s.rotulo}>También</span>
          {otras.slice(0, 3).map((it) => (
            <button key={it.id} type="button" className={s.otra} onClick={() => onElegir(it.titulo)}>
              <span>{it.titulo}</span><Icon name="chevronRight" size={15} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Respuesta({ it, abrible, onGuia }: { it: Intencion; abrible: boolean; onGuia: (id: string) => void }) {
  return (
    <section className={s.respuesta} aria-label={it.titulo}>
      <h2>{it.titulo}</h2>
      <p>{abrible || !it.sinPermiso ? it.respuesta : it.sinPermiso}</p>
      {abrible && it.ruta && it.accion && (
        <Button render={<Link href={it.ruta} />} size="touch" className="w-full">{it.accion}</Button>
      )}
      {it.guia && (
        <Button type="button" variant="outline" size="touch" className="w-full" onClick={() => onGuia(it.guia!)}>
          Ver la guía paso a paso
        </Button>
      )}
    </section>
  );
}

function Diagnostico({ titulo, restaurantId }: { titulo: string; restaurantId: string | null }) {
  const router = useRouter();
  const [puntos, setPuntos] = useState<PuntoDiagnostico[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();

  function revisar() {
    start(async () => {
      const r = await diagnosticoDePedidos();
      if ('error' in r) { setError(r.error); return; }
      setError(null);
      setPuntos(r.puntos);
    });
  }
  useEffect(() => { revisar(); }, []);

  function reanudar() {
    if (!restaurantId) return;
    start(async () => {
      const r = await reanudarPedidos(restaurantId);
      if (r && 'error' in r && r.error) { setError(r.error); return; }
      router.refresh();
      const d = await diagnosticoDePedidos();
      if (!('error' in d)) setPuntos(d.puntos);
    });
  }

  const todoBien = puntos?.every((p) => p.ok);
  return (
    <section className={s.respuesta} aria-label={titulo} aria-busy={pendiente}>
      <h2>Revisamos tu restaurante</h2>
      {error && <p className={s.error} role="alert">{error}</p>}
      {!puntos && !error && <p>Revisando…</p>}
      {puntos && (
        <ul className={s.puntos} role="list">
          {puntos.map((p) => (
            <li key={p.key}>
              <span className={s.ico} data-ok={p.ok ? '1' : undefined} aria-hidden>
                <Icon name={p.ok ? 'check' : 'alertCircle'} size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <b>{p.titulo}</b>
                {p.detalle && <small>{p.detalle}</small>}
              </span>
              {p.accion?.tipo === 'reanudar' && (
                <Button type="button" size="md" disabled={pendiente} onClick={reanudar}>Reanudar</Button>
              )}
              {p.accion?.tipo === 'ir' && (
                <Button render={<Link href={p.accion.ruta} />} variant="outline" size="md">{p.accion.label}</Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {todoBien && (
        <p>Todo está en orden de nuestro lado. Si un cliente dice que no puede pedir, pídele una captura y escríbenos abajo.</p>
      )}
      {puntos && (
        <Button type="button" variant="outline" size="touch" className="w-full" disabled={pendiente} onClick={revisar}>
          {pendiente ? 'Revisando…' : 'Revisar de nuevo'}
        </Button>
      )}
    </section>
  );
}
