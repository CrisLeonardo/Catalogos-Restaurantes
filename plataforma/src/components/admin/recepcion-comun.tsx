'use client';

/* Piezas que comparten Reservas y Espera (línea N «nada saturado», 2026-11-17).
   Maqueta aprobada: docs/diseno/MAQUETA_RECEPCION_NADA_SATURADO_2026-11-17.html

   Una sola fila de mandos: las pestañas de la pantalla y el botón para anotar.
   «Revisar» solo aparece si quedó algo de días anteriores. */

import { Tabs } from '@base-ui/react/tabs';
import { Icon } from '@/components/icons';
import s from './recepcion.module.css';

export type Pestana<T extends string> = { valor: T; texto: string; cuenta: number; aviso?: boolean };

export function Mandos<T extends string>({
  valor, onCambio, pestanas, etiqueta, boton, botonCorto, onBoton,
}: {
  valor: T;
  onCambio: (v: T) => void;
  pestanas: Pestana<T>[];
  etiqueta: string;
  /** Texto del botón en la PC («Nueva reserva»). */
  boton: string;
  /** Texto del botón en el teléfono («Nueva»). */
  botonCorto: string;
  onBoton: () => void;
}) {
  return (
    <div className={s.mandos}>
      <Tabs.Root value={valor} onValueChange={(v) => onCambio(v as T)} className={s.pestanasRaiz}>
        <Tabs.List className={s.pestanas} aria-label={etiqueta}>
          {pestanas.map((p) => (
            <Tabs.Tab key={p.valor} value={p.valor} className={s.pestana} data-aviso={p.aviso ? '' : undefined}>
              {p.texto}
              {p.cuenta > 0 && <em>{p.cuenta}</em>}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.Root>
      <button type="button" className={s.anotar} onClick={onBoton}>
        <Icon name="plus" size={18} />
        <span className={s.soloTelefono}>{botonCorto}</span>
        <span className={s.soloPc}>{boton}</span>
      </button>
    </div>
  );
}

/** Mensaje de lo que acaba de pasar o del error, arriba de la lista. */
export function Aviso({ error, hecho }: { error: string | null; hecho: string | null }) {
  if (error) return <div className={s.error} role="alert">{error}</div>;
  if (hecho) return <div className={`${s.caja} ${s.bien} ${s.hecho}`} role="status">{hecho}</div>;
  return null;
}

export const personas = (n: number) => `${n} ${n === 1 ? 'persona' : 'personas'}`;
