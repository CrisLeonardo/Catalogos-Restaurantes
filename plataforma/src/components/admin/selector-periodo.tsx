'use client';

/* ============================================================
   SELECTOR DE PERIODO — Finanzas y Analítica (línea N, 2026-11-18)
   ------------------------------------------------------------
   Antes eran ocho mandos (dos fechas, «Aplicar», tres atajos y la
   descarga) en dos filas, antes del primer número. Ahora es una
   línea, igual que en Resumen: 7 · 30 · 90 días · Otro…. Las fechas
   exactas son lo menos usado y van en una hoja.

   Los atajos cuentan desde `hoy`, el día de NEGOCIO que calcula el
   servidor (migración 145): a la 1:30 «hoy» sigue siendo la noche que
   no ha cerrado. Antes salían del reloj del aparato.
   ============================================================ */

import { useId, useState, useTransition, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { HojaOperativa } from '@/components/ui/hoja-operativa';
import { Button } from '@/components/ui/button';
import { panelBaseFrom, panelHref } from '@/lib/panel-links';
import { rangoEnPalabras } from '@/lib/rango-en-palabras';
import s from './negocio.module.css';

function correr(ymd: string, dias: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const ATAJOS = [7, 30, 90] as const;

export default function SelectorPeriodo({
  from, to, hoy, basePath, children,
}: {
  from: string;
  to: string;
  /** Día de negocio de hoy (YYYY-MM-DD). */
  hoy: string;
  /** Ruta interna de la pantalla, p. ej. `/admin/finanzas`. */
  basePath: string;
  /** Lo que va a la derecha del selector (la descarga en Finanzas). */
  children?: ReactNode;
}) {
  const router = useRouter();
  const base = panelBaseFrom(usePathname());
  const [cargando, startTransition] = useTransition();
  const [hoja, setHoja] = useState(false);

  const atajo = ATAJOS.find((d) => to === hoy && from === correr(hoy, -(d - 1)));

  function ir(desde: string, hasta: string) {
    startTransition(() => router.push(`${panelHref(base, basePath)}?from=${desde}&to=${hasta}`));
  }

  return (
    <div className={s.periodo}>
      <div className={s.segmentos} role="group" aria-label="Periodo" aria-busy={cargando || undefined}>
        {ATAJOS.map((d) => (
          <button
            key={d}
            type="button"
            className={s.segmento}
            aria-pressed={atajo === d}
            aria-label={`Ver los últimos ${d} días`}
            onClick={() => { if (atajo !== d) ir(correr(hoy, -(d - 1)), hoy); }}
          >
            {d} días
          </button>
        ))}
        <button
          type="button"
          className={s.segmento}
          aria-pressed={atajo == null}
          aria-label={atajo == null ? `Fechas elegidas: ${rangoEnPalabras(from, to, hoy)}. Cambiarlas` : 'Elegir otras fechas'}
          onClick={() => setHoja(true)}
        >
          Otro…
        </button>
      </div>
      {children}
      {hoja && (
        <HojaFechas
          from={from}
          to={to}
          hoy={hoy}
          onClose={() => setHoja(false)}
          onVer={(desde, hasta) => { setHoja(false); ir(desde, hasta); }}
        />
      )}
    </div>
  );
}

function HojaFechas({
  from, to, hoy, onClose, onVer,
}: {
  from: string; to: string; hoy: string;
  onClose: () => void;
  onVer: (desde: string, hasta: string) => void;
}) {
  const id = useId();
  const [desde, setDesde] = useState(from);
  const [hasta, setHasta] = useState(to);
  const valido = /^\d{4}-\d{2}-\d{2}$/.test(desde) && /^\d{4}-\d{2}-\d{2}$/.test(hasta);
  const alReves = valido && desde > hasta;

  return (
    <HojaOperativa
      label="Elegir las fechas"
      className="hoja-negocio"
      onClose={onClose}
      footer={(
        <Button
          type="button"
          size="action"
          className="w-full"
          disabled={!valido || alReves}
          onClick={() => onVer(desde, hasta)}
        >
          {valido && !alReves ? `Ver ${rangoEnPalabras(desde, hasta, hoy)}` : 'Elige las dos fechas'}
        </Button>
      )}
    >
      <div className={s.hojaCuerpo}>
        <p className={s.nota}>Cuentan por día de negocio: lo vendido después de la medianoche, antes del cierre, es del día anterior.</p>
        <div className={s.dos}>
          <label className={s.campo} htmlFor={`${id}-desde`}>
            Desde
            <input id={`${id}-desde`} type="date" value={desde} max={hoy} onChange={(e) => setDesde(e.target.value)} className="adm-field" />
          </label>
          <label className={s.campo} htmlFor={`${id}-hasta`}>
            Hasta
            <input id={`${id}-hasta`} type="date" value={hasta} max={hoy} onChange={(e) => setHasta(e.target.value)} className="adm-field" />
          </label>
        </div>
        {alReves && <p className={s.error} role="alert">«Desde» va antes de «Hasta».</p>}
      </div>
    </HojaOperativa>
  );
}
