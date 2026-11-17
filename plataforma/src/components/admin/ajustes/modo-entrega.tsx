'use client';

/* «¿A dónde repartes?» (ficha 2.8, R28.1–3). Una manera elegida a propósito;
   «A cualquier dirección» ya no es lo que pasa por no agregar zonas. Y
   «Prueba una distancia» dice si un cliente queda dentro antes de que pida. */

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { elegirModoDeEntrega } from '@/lib/actions/restaurant';
import type { ModoEntrega } from '@/lib/ajustes-estado';
import s from './ajustes.module.css';

const OPCIONES: { v: 'zonas' | 'distancia' | 'cualquiera'; label: string }[] = [
  { v: 'zonas', label: 'Por zonas' },
  { v: 'distancia', label: 'Por distancia' },
  { v: 'cualquiera', label: 'A cualquier dirección' },
];

export default function ModoDeEntrega({ restaurantId, modo: modoGuardado, zonas, editorZonas, editorDistancia }: {
  restaurantId: string;
  modo: ModoEntrega;
  zonas: number;
  editorZonas: ReactNode;
  editorDistancia: ReactNode;
}) {
  /* «Por zonas» sin zonas todavía no cambia nada en la base (sin zonas ni
     radio es «a cualquier dirección»): la pantalla recuerda la elección para
     enseñar el editor y que se escriba la primera. */
  const [vista, setVista] = useState<ModoEntrega>(modoGuardado);
  const modo = vista;
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function elegir(v: 'zonas' | 'distancia' | 'cualquiera') {
    if (v === modo || pendiente) return;
    if (v === 'zonas' && modoGuardado === 'cualquiera') { setVista('zonas'); return; }
    if (zonas > 0 && v !== 'zonas') {
      const ok = await confirm({
        title: `¿Quitar tus ${zonas} ${zonas === 1 ? 'zona' : 'zonas'}?`,
        description: v === 'distancia'
          ? 'Desde ahora se reparte por distancia desde tu local. Las zonas se guardan apagadas: si vuelves a «Por zonas» y las escribes igual, regresan.'
          : 'Desde ahora cualquier dirección puede pedirte a domicilio. Las zonas se guardan apagadas.',
        confirmLabel: 'Quitar las zonas',
        destructive: true,
      });
      if (!ok) return;
    }
    setError(null);
    start(async () => {
      const r = await elegirModoDeEntrega(restaurantId, v);
      if ('error' in r) { setError(r.error); return; }
      setVista(v);
      router.refresh();
    });
  }

  return (
    <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
      <b style={{ fontSize: 15, color: 'var(--u-text)' }}>¿A dónde repartes?</b>
      <div className={s.seg} role="radiogroup" aria-label="Cómo repartes a domicilio" aria-busy={pendiente}>
        {OPCIONES.map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={modo === o.v} data-on={modo === o.v ? '1' : undefined}
            disabled={pendiente} onClick={() => elegir(o.v)}>{o.label}</button>
        ))}
      </div>
      {modo === 'ambos' && (
        <p className={s.aviso} style={{ margin: 0 }}>
          <strong>Hoy usas zonas y distancia a la vez:</strong> el cliente tiene que elegir una zona y además estar dentro de la distancia. Elige una de las dos si no lo quieres así.
        </p>
      )}
      {modo === 'cualquiera' && (
        <p className={s.aviso} style={{ margin: 0 }}>
          <strong>Cualquier dirección puede pedirte a domicilio.</strong> Si no llegas a todas partes, elige zonas o una distancia.
        </p>
      )}
      {modo === 'zonas' && modoGuardado === 'cualquiera' && (
        <p className={s.nota} style={{ margin: 0 }}>Agrega tu primera zona y guárdala: hasta entonces cualquier dirección puede pedirte.</p>
      )}
      {error && <p className={s.error} role="alert" style={{ margin: 0 }}>{error}</p>}
      {dialog}
      {(modo === 'distancia' || modo === 'ambos') && editorDistancia}
      {(modo === 'zonas' || modo === 'ambos') && editorZonas}
    </div>
  );
}
