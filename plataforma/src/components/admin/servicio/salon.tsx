'use client';

/* EL SALÓN — tres maneras de mirar el mismo local.
   ------------------------------------------------------------------
   · RIEL    — la columna de tablet/PC. Filas horizontales, una debajo
               de otra, con el total a la derecha.
   · FICHAS  — la rejilla del teléfono y de la pantalla de Mesas.
   · PLANO   — las mesas donde de verdad están, si el dueño dibujó el
               local en Ajustes › Salón.

   Las tres consumen `MesaServicio` y nada más: el color, el subtítulo y
   el orden los decide `lib/servicio/estado.ts`, para que no puedan
   contar historias distintas. Es la misma regla que sostenía el salón
   anterior, y es la que impide que el plano diga «Comiendo» donde la
   ficha dice «Falta servir».

   El PLANO es nuevo y no venía en el handoff. Se rehízo entero: el
   anterior encogía el lienzo hasta caber en el teléfono —mesas de
   dieciocho píxeles con un número dentro— y aquí se hace al revés, que
   es como se lee un mapa: el lienzo conserva un tamaño mínimo legible y
   la pantalla se desplaza por encima. */

import { useMemo } from 'react';
import { Icon } from '@/components/icons';
import { ChipEstado, ChipMano, Mono } from '@/components/admin/servicio/pieces';
import { FIXTURE_META, fixtureLabel } from '@/components/admin/salon/fixtures';
import { subtituloDeMesa, type MesaServicio } from '@/lib/servicio/estado';
import type { FloorPlan } from '@/lib/theme/defaults';

export interface SalonProps {
  mesas: MesaServicio[];
  /** La mesa abierta ahora mismo. */
  sel: number | null;
  onPick: (n: number) => void;
  money: (n: number) => string;
}

/* ════════════════════════════════════════════════════════════
   RIEL (tablet y PC)
   ════════════════════════════════════════════════════════════ */

/**
 * En el riel de 232 px el subtítulo largo se parte en dos renglones y
 * engorda las cuarenta filas de golpe, así que ahí se abrevia y el chip
 * de estado se cae: lo que dice el chip ya lo dice el subtítulo corto.
 */
export function SalonRiel({ mesas, sel, onPick, money, estrecho }: SalonProps & { estrecho: boolean }) {
  return (
    <>
      {mesas.map((m) => (
        <button
          key={m.n}
          type="button"
          className="sv-mesa"
          data-st={m.estado}
          data-on={m.n === sel ? '1' : '0'}
          onClick={() => onPick(m.n)}
        >
          <span className="sv-mesa-n">{m.n}</span>
          <span className="sv-mesa-id">
            <span className="sv-mesa-title">{m.etiqueta}</span>
            <span className="sv-mesa-sub">{subtituloDeMesa(m, estrecho)}</span>
          </span>
          <span className="sv-mesa-right">
            {m.total > 0 && <span className="sv-mesa-total">{money(m.total)}</span>}
            {m.atencion
              ? <ChipMano atencion={m.atencion} corto />
              : (!estrecho && m.estado !== 'libre' && <ChipEstado estado={m.estado} />)}
          </span>
        </button>
      ))}
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   FICHAS (teléfono y pantalla de Mesas)
   ════════════════════════════════════════════════════════════ */

export function SalonFichas({ mesas, sel, onPick, money }: SalonProps) {
  return (
    <div className="sv-grid">
      {mesas.map((m) => (
        <button
          key={m.n}
          type="button"
          className="sv-card"
          data-st={m.estado}
          data-on={m.n === sel ? '1' : '0'}
          onClick={() => onPick(m.n)}
        >
          <span className="sv-card-top">
            <span className="sv-card-n">{m.n}</span>
            {m.atencion ? <ChipMano atencion={m.atencion} corto /> : <ChipEstado estado={m.estado} big />}
          </span>
          <span style={{ display: 'block', textAlign: 'left' }}>
            {/* El alias del plano («Terraza 2») y el nombre que alguien le
                puso esta noche («cumpleaños de Sofi») son cosas distintas y
                caben las dos: el primero identifica la mesa, el segundo
                identifica a la gente. */}
            {(m.nombre || m.alias) && (
              <span className="sv-card-name">{m.nombre || m.alias}</span>
            )}
            <span className="sv-card-sub">{subtituloDeMesa(m)}</span>
          </span>
          {m.total > 0 && <span className="sv-card-total">{money(m.total)}</span>}
        </button>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   PLANO
   ════════════════════════════════════════════════════════════ */

/** ¿Hay plano que enseñar? Sin mesas colocadas, el plano está vacío. */
export function hayPlano(floorPlan: FloorPlan | null): boolean {
  return !!floorPlan?.enabled && floorPlan.tables.length > 0;
}

/** Los niveles que de verdad tienen algo dibujado. */
export function nivelesConMesas(floorPlan: FloorPlan | null): { id: string; name: string }[] {
  if (!floorPlan?.enabled) return [];
  const usados = new Set([
    ...floorPlan.tables.map((t) => t.level),
    ...(floorPlan.fixtures ?? []).map((f) => f.level),
  ]);
  return floorPlan.levels.filter((l) => usados.has(l.id));
}

/* ── El ENCUADRE ───────────────────────────────────────────────
   Un plano dibujado casi nunca llena el lienzo: si el dueño colocó todo
   en la mitad de arriba, enseñar el local entero deja media pantalla de
   vacío y las mesas del tamaño de una moneda. Se enseña el TROZO que
   tiene algo, con aire alrededor.

   Esta idea —la mejor que tenía el plano anterior— se conserva tal cual,
   con sus mismos números: están medidos contra planos de verdad. */
interface Encuadre { x: number; y: number; w: number; h: number }
const COMPLETO: Encuadre = { x: 0, y: 0, w: 1, h: 1 };
/** Aire alrededor de lo dibujado, en fracción del lienzo. */
const MARGEN = 0.09;
/** Por debajo de esto el recorte amplía demasiado y desorienta. */
const MIN_LADO = 0.36;
/** Con menos vacío que esto no vale la pena recortar. */
const MAX_APROVECHADO = 0.72;

function tramo(a: number, b: number): readonly [number, number] {
  let lo = a - MARGEN;
  let hi = b + MARGEN;
  if (hi - lo < MIN_LADO) {
    const centro = (lo + hi) / 2;
    lo = centro - MIN_LADO / 2;
    hi = centro + MIN_LADO / 2;
  }
  // Empujar hacia dentro antes de recortar: así el ancho se conserva
  // cuando el contenido está pegado a un canto.
  if (lo < 0) { hi -= lo; lo = 0; }
  if (hi > 1) { lo -= hi - 1; hi = 1; }
  return [Math.max(0, lo), Math.min(1, hi)] as const;
}

function encuadrar(cajas: { x0: number; y0: number; x1: number; y1: number }[]): Encuadre {
  if (cajas.length === 0) return COMPLETO;
  const [x0, x1] = tramo(Math.min(...cajas.map((c) => c.x0)), Math.max(...cajas.map((c) => c.x1)));
  const [y0, y1] = tramo(Math.min(...cajas.map((c) => c.y0)), Math.max(...cajas.map((c) => c.y1)));
  const enc = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  return enc.w * enc.h >= MAX_APROVECHADO ? COMPLETO : enc;
}

export function SalonPlano({
  mesas, sel, onPick, money, floorPlan, nivel,
}: SalonProps & { floorPlan: FloorPlan; nivel: string }) {
  const porNumero = new Map(mesas.map((m) => [m.n, m]));
  const colocadas = floorPlan.tables.filter((t) => t.level === nivel && porNumero.has(t.n));
  const fixtures = (floorPlan.fixtures ?? []).filter((f) => f.level === nivel);

  /* Las que el dueño NO colocó no desaparecen: una mesa con gente que no
     esté en el plano seguiría teniendo dinero dentro, y esconderla es el
     hallazgo M-03 otra vez con otra forma. */
  const colocadasN = new Set(floorPlan.tables.map((t) => t.n));
  const sueltas = mesas.filter((m) => !colocadasN.has(m.n));

  const enc = useMemo(() => encuadrar([
    ...colocadas.map((t) => ({ x0: t.x, y0: t.y, x1: t.x, y1: t.y })),
    ...fixtures.map((f) => ({
      x0: f.x - f.w / 2, y0: f.y - f.h / 2, x1: f.x + f.w / 2, y1: f.y + f.h / 2,
    })),
  ]), [colocadas, fixtures]);

  /** De coordenada del local a coordenada del trozo que se está viendo. */
  const px = (x: number) => ((x - enc.x) / enc.w) * 100;
  const py = (y: number) => ((y - enc.y) / enc.h) * 100;

  return (
    <div className="sv-plano-wrap sv-vs">
      {/* La proporción es la del TROZO enseñado, no la del local entero:
          recortar la mitad del alto y conservar el 4:3 volvería a dejar el
          vacío que el recorte acaba de quitar. */}
      <div className="sv-plano" style={{ aspectRatio: `${4 * enc.w} / ${3 * enc.h}` }}>
        {fixtures.map((f) => {
          const meta = FIXTURE_META[f.kind];
          return (
            <div
              key={f.id}
              className="sv-plano-fix"
              style={{
                left: `${px(f.x - f.w / 2)}%`, top: `${py(f.y - f.h / 2)}%`,
                width: `${(f.w / enc.w) * 100}%`, height: `${(f.h / enc.h) * 100}%`,
              }}
            >
              <Icon name={meta.icon} size={13} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {fixtureLabel(f)}
              </span>
            </div>
          );
        })}

        {colocadas.map((t) => {
          const m = porNumero.get(t.n);
          if (!m) return null;
          return (
            <button
              key={t.n}
              type="button"
              className="sv-plano-mesa"
              data-st={m.estado}
              data-shape={t.shape ?? 'square'}
              data-on={m.n === sel ? '1' : '0'}
              style={{ left: `${px(t.x)}%`, top: `${py(t.y)}%` }}
              title={`${m.etiqueta} · ${subtituloDeMesa(m)}`}
              onClick={() => onPick(m.n)}
            >
              <span className="sv-plano-n">{m.n}</span>
              {m.total > 0
                ? <span className="sv-plano-total">{money(m.total)}</span>
                : <span className="sv-plano-sub">{m.sillas ? `${m.sillas} p.` : ''}</span>}
              {m.estado !== 'libre' && m.total === 0 && (
                <span className="sv-plano-sub">{m.minutos != null ? `${m.minutos} min` : ''}</span>
              )}
              {m.atencion && <span className="sv-plano-mano" aria-hidden />}
            </button>
          );
        })}
      </div>

      {sueltas.length > 0 && (
        <div className="sv-plano-fuera">
          <div className="sv-kicker">
            Fuera del plano · {sueltas.length}
            <span className="sv-rule" />
          </div>
          <div className="sv-grid">
            {sueltas.map((m) => (
              <button
                key={m.n}
                type="button"
                className="sv-card"
                data-st={m.estado}
                data-on={m.n === sel ? '1' : '0'}
                onClick={() => onPick(m.n)}
              >
                <span className="sv-card-top">
                  <span className="sv-card-n">{m.n}</span>
                  {m.atencion ? <ChipMano atencion={m.atencion} corto /> : <ChipEstado estado={m.estado} big />}
                </span>
                <span className="sv-card-sub">{subtituloDeMesa(m)}</span>
                {m.total > 0 && <Mono size={15} className="sv-card-total">{money(m.total)}</Mono>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
