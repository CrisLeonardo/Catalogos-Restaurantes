'use client';

/* ============================================================
   HOJA «AGOTAR» (auditoría 1.10: O04, F17)
   ------------------------------------------------------------
   Agotar dice hasta cuándo. La misma hoja sale en Catálogo, en el lote
   y en Inventario; la ficha y Servicio usan las mismas opciones
   (OPCIONES_AGOTADO). Por omisión «Hasta mañana» (decisión del dueño,
   2026-11-09). Maqueta: docs/diseno/MAQUETA_INVENTARIO_2026-11-09.html.
   ============================================================ */

import { useState } from 'react';
import { HojaOperativa } from '@/components/ui/hoja-operativa';
import { Button } from '@/components/ui/button';
import { AGOTADO_POR_OMISION, OPCIONES_AGOTADO, type AgotadoHasta } from '@/lib/product-availability';
import s from './hoja-agotar.module.css';

/** «Vuelve mañana a las 05:00, al empezar el día.» con la hora de corte del local. */
export function detalleDeOpcion(key: AgotadoHasta, horaCorte?: string): string {
  if (key === 'manana' && horaCorte) return `Vuelve mañana a las ${horaCorte}, al empezar el día.`;
  return OPCIONES_AGOTADO.find((o) => o.key === key)?.detalle ?? '';
}

/** Las tres opciones como radios; la usan la hoja y la ficha del platillo. */
export function OpcionesAgotado({ value, onChange, name, horaCorte }: {
  value: AgotadoHasta; onChange: (v: AgotadoHasta) => void; name: string; horaCorte?: string;
}) {
  return (
    <div className={s.opciones} role="radiogroup" aria-label="Hasta cuándo queda agotado">
      {OPCIONES_AGOTADO.map((o) => (
        <label key={o.key} className={s.op} data-sel={value === o.key ? '1' : undefined}>
          <input type="radio" name={name} value={o.key} checked={value === o.key} onChange={() => onChange(o.key)} />
          <span>
            <b>{o.label}</b>
            <span>{detalleDeOpcion(o.key, horaCorte)}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

export default function HojaAgotar({ titulo, horaCorte, onConfirmar, onClose }: {
  /** «Agotar «Horchata»» o «Agotar 3 platillos». */
  titulo: string;
  horaCorte?: string;
  onConfirmar: (hasta: AgotadoHasta) => Promise<string | void>;
  onClose: () => void;
}) {
  const [hasta, setHasta] = useState<AgotadoHasta>(AGOTADO_POR_OMISION);
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const etiqueta = OPCIONES_AGOTADO.find((o) => o.key === hasta)?.label.toLowerCase() ?? '';

  async function confirmar() {
    setPendiente(true);
    setError(null);
    const r = await onConfirmar(hasta);
    setPendiente(false);
    if (r) setError(r);
  }

  return (
    <HojaOperativa
      label={titulo}
      onClose={onClose}
      resumen={<p className={s.resumen}>Se ve en el menú pero no se puede pedir. ¿Hasta cuándo?</p>}
      footer={(
        <div className={s.pie}>
          <Button type="button" size="touch" onClick={confirmar} disabled={pendiente}>
            {pendiente ? 'Agotando…' : `Agotar ${etiqueta}`}
          </Button>
          <Button type="button" size="touch" variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
      )}
    >
      <OpcionesAgotado value={hasta} onChange={setHasta} name="agotar-hasta" horaCorte={horaCorte} />
      {error && <p role="alert" className={s.error}>{error}</p>}
    </HojaOperativa>
  );
}
