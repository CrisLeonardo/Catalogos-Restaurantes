'use client';

/* ============================================================
   EL SALÓN — un solo lienzo para las dos pantallas
   ------------------------------------------------------------
   El salón se dibujaba CUATRO veces, con cuatro componentes:

     · Pedidos › Mesas lo pintaba en fichas, en lista y en un plano
       de pines;
     · Tomar pedidos lo pintaba OTRA VEZ, con un visor de plano
       propio (con pellizco y zoom) y su rejilla de cuadritos.

   Eran el mismo salón, la misma regla de estado (lib/table-state.ts)
   y dos dibujos distintos con dos vocabularios distintos: la leyenda
   de una decía «Te necesita · Comiendo · Libre» y la de la otra
   «Libre · Abierta · Necesita atención». Cualquier arreglo había que
   hacerlo dos veces, y de hecho ya habían empezado a separarse.

   Esto es el lienzo, y nada más: recibe las mesas ya resueltas y
   avisa de dos gestos —abrir una mesa y ejecutar su acción—. Quién
   las resuelve, qué significa abrirlas y qué barra las acompaña es
   cosa de cada pantalla, porque ahí SÍ son distintas: el dueño abre
   la cuenta al lado, el mesero entra en el ciclo de la mesa.
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from 'react';
/* `Link` es aqui `PanelLink`: traduce las rutas del panel al origen desde el
   que se sirve la pagina. Lo que no es del panel pasa de largo sin tocarse.
   Ver components/admin/panel-link.tsx. */
import Link from '@/components/admin/panel-link';
import { Icon, type IconName } from '@/components/icons';
import { FIXTURE_META, fixtureLabel } from '@/components/admin/salon/fixtures';
import { TableCard, TableRow, TablePin, type SalonTable } from '@/components/admin/salon/pieces';
import { TONE_LABEL, TONE_ORDER } from '@/lib/table-state';
import type { FloorPlan } from '@/lib/theme/defaults';

/** Las tres formas de mirar el mismo salón. */
export type SalonView = 'fichas' | 'plano' | 'lista';

function esVista(v: unknown): v is SalonView {
  return v === 'fichas' || v === 'plano' || v === 'lista';
}

/**
 * La vista elegida, recordada en este aparato.
 *
 * El lienzo se comparte, la PREFERENCIA no: el tablero del dueño vive en
 * una pantalla ancha y el del mesero en un teléfono, y quien se sabe el
 * salón de memoria abre en Plano sin que eso decida cómo lo ve el otro.
 * Con una sola clave, elegir «Lista» en el PC dejaba al mesero con la
 * vista de escritorio en la mano. Por eso cada pantalla trae la suya.
 *
 * Arranca SIEMPRE en `inicial` y aplica lo guardado después de montar:
 * leer localStorage durante el render daría un HTML de servidor distinto
 * al del cliente.
 */
export function useSalonView(key: string, inicial: SalonView = 'fichas'): [SalonView, (v: SalonView) => void] {
  const [view, setView] = useState<SalonView>(inicial);

  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (esVista(v)) setView(v);
    } catch { /* navegador sin almacenamiento: se queda con la inicial */ }
  }, [key]);

  const elegir = (v: SalonView) => {
    setView(v);
    try { localStorage.setItem(key, v); } catch { /* no-op */ }
  };

  return [view, elegir];
}

/* ── El interruptor de vista ──────────────────────────────────── */

export function SalonViewSwitch({ view, onChange }: { view: SalonView; onChange: (v: SalonView) => void }) {
  return (
    <div className="salon-seg" role="tablist" aria-label="Cómo ver el salón">
      <SegBtn on={view === 'fichas'} icon="grid" label="Fichas" onClick={() => onChange('fichas')} />
      <SegBtn on={view === 'plano'} icon="home" label="Plano" onClick={() => onChange('plano')} />
      <SegBtn on={view === 'lista'} icon="list" label="Lista" onClick={() => onChange('lista')} />
    </div>
  );
}

function SegBtn({ on, icon, label, onClick }: { on: boolean; icon: IconName; label: string; onClick: () => void }) {
  return (
    <button type="button" role="tab" aria-selected={on} data-on={on ? '1' : '0'} onClick={onClick}>
      <Icon name={icon} size={15} />
      {label}
    </button>
  );
}

/* ── La leyenda ───────────────────────────────────────────────
   Los nombres salen de `lib/table-state.ts`, igual que el estado:
   así las dos pantallas no pueden volver a llamarlo distinto. */

export function SalonLegend() {
  return (
    <div className="salon-legend">
      {TONE_ORDER.map((k) => (
        <span key={k}>
          <span aria-hidden data-tone={k} />
          {TONE_LABEL[k]}
        </span>
      ))}
    </div>
  );
}

/* ── El orden no se mueve bajo el dedo ─────────────────────────
   El salón se ordena por urgencia, y la urgencia depende del reloj,
   que avanza cada 30 segundos. Una mesa que cruza un umbral salta de
   sitio sin avisar y se lleva su botón con ella: en hora pico eso es
   pulsar «Cobrar» en la mesa equivocada.

   Mientras el puntero (o el dedo) está sobre el salón, el orden se
   congela con el que se está viendo. Los DATOS siguen al día —el
   estado, el monto, el reloj de cada ficha—, lo único que se queda
   quieto es en qué fila está cada mesa. Si mientras tanto el orden
   real cambia, se ofrece reordenar en vez de hacerlo por sorpresa. */
const DESHIELO_MS = 8000;
/** Tras salir del salón, un respiro corto antes de recolocar. */
const SALIDA_MS = 700;

function useOrdenEstable(tables: SalonTable[]) {
  const [orden, setOrden] = useState<number[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Sin memoizar a propósito: así `congelar` lee el `tables` de ESTE
     render en vez de tener que espejarlo en otra ref. Son tres manejadores
     de puntero; rehacerlos no cuesta nada. */
  const rearmar = (ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOrden(null), ms);
  };

  const congelar = () => {
    setOrden((prev) => prev ?? tables.map((t) => t.n));
    rearmar(DESHIELO_MS);
  };

  const soltar = () => rearmar(SALIDA_MS);

  const reordenar = () => {
    if (timer.current) clearTimeout(timer.current);
    setOrden(null);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const vistas = useMemo(() => {
    if (!orden) return tables;
    const pos = new Map(orden.map((n, i) => [n, i]));
    // Una mesa que no estaba cuando se congeló (mesa nueva) va al final,
    // no al azar: el resto no se mueve por su culpa.
    return [...tables].sort((a, b) => (pos.get(a.n) ?? 1e6) - (pos.get(b.n) ?? 1e6) || a.n - b.n);
  }, [tables, orden]);

  const cambio = orden != null && tables.some((t, i) => vistas[i]?.n !== t.n);

  return { vistas, cambio, congelar, soltar, reordenar };
}

/* ── El lienzo ────────────────────────────────────────────────── */

interface Props {
  view: SalonView;
  /** Las mesas ya resueltas y en el orden en que hay que mirarlas. */
  tables: SalonTable[];
  floorPlan: FloorPlan | null;
  /** Mesa elegida (la que tiene la cuenta abierta al lado). */
  selected: number | null;
  /** Tocar la mesa. Cada pantalla decide qué significa. */
  onOpen: (n: number) => void;
  /** Tocar su única acción («Cobrar», «Llevar a la mesa»…). */
  onAction: (t: SalonTable) => void;
  /** Cuándo esa acción no lleva a ninguna parte (plan sin panel de mesero). */
  actionDisabled?: (t: SalonTable) => boolean;
  /** La mesa cuya acción está en marcha ahora mismo. */
  busyTable?: number | null;
  /** Lo que va al lado del plano en escritorio (la cuenta de la mesa). */
  aside?: React.ReactNode;
}

export default function SalonCanvas({
  view, tables, floorPlan, selected, onOpen, onAction, actionDisabled, busyTable, aside,
}: Props) {
  const planEnabled = !!floorPlan?.enabled && (floorPlan?.levels.length ?? 0) > 0;
  const levels = useMemo(() => floorPlan?.levels ?? [], [floorPlan]);
  const [nivel, setNivel] = useState<string>('');
  useEffect(() => {
    setNivel((prev) => (prev && levels.some((l) => l.id === prev) ? prev : levels[0]?.id ?? ''));
  }, [levels]);

  const disabled = (t: SalonTable) => actionDisabled?.(t) ?? false;

  /* Solo las vistas ordenadas por urgencia se congelan. En el plano cada
     mesa está donde está el mueble: ahí nada se mueve nunca. */
  const { vistas, cambio, congelar, soltar, reordenar } = useOrdenEstable(tables);

  if (view === 'fichas' || view === 'lista') {
    return (
      <div
        style={{ position: 'relative' }}
        onPointerOver={congelar}
        onPointerDown={congelar}
        onPointerLeave={soltar}
      >
        {cambio && <BotonReordenar onClick={reordenar} />}
        {view === 'fichas' ? (
          <div className="salon-grid">
            {vistas.map((t) => (
              <TableCard
                key={t.n}
                t={t}
                onOpen={() => onOpen(t.n)}
                onAction={() => onAction(t)}
                disabled={disabled(t)}
                busy={busyTable === t.n}
              />
            ))}
          </div>
        ) : (
          <div
            style={{
              borderRadius: 14, border: '1px solid var(--u-hair)', overflow: 'hidden',
              background: 'var(--adm-card)', boxShadow: 'var(--adm-shadow-xs)',
            }}
          >
            {vistas.map((t, i) => (
              <TableRow
                key={t.n}
                t={t}
                primera={i === 0}
                onOpen={() => onOpen(t.n)}
                onAction={() => onAction(t)}
                disabled={disabled(t)}
                busy={busyTable === t.n}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="salon-floor">
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--u-text-3)' }}>
          {levels.length > 1 && levels.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setNivel(l.id)}
              style={{
                border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5,
                fontWeight: l.id === nivel ? 600 : 400,
                color: l.id === nivel ? 'var(--u-text-2)' : 'var(--u-text-4)',
              }}
            >
              {l.name}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <SalonLegend />
        </div>

        <Plano
          tables={tables}
          floorPlan={planEnabled ? floorPlan : null}
          nivel={nivel}
          selected={selected}
          onOpen={onOpen}
        />
      </div>

      {aside}
    </div>
  );
}

/** El aviso de que el salón cambió de orden mientras se miraba. */
function BotonReordenar({ onClick }: { onClick: () => void }) {
  return (
    <div className="salon-reordenar">
      <button type="button" onClick={onClick} className="press">
        <Icon name="clock" size={14} />
        El salón cambió · reordenar
      </button>
    </div>
  );
}

/* ── El plano ─────────────────────────────────────────────────
   Las zonas fijas (barra, caja, cocina) salen del plano que el dueño
   dibujó en Ajustes › Salón — no están quemadas aquí. Un plano sin
   dibujar cae en una cuadrícula automática, que es mejor que una
   pantalla vacía diciendo «configura tu salón».                */

/* ── Recortar el plano a lo que hay dibujado ───────────────────
   El lienzo era 16:10 fijo. Con un plano de prueba —cinco mesas
   colocadas de veinte— medía 1.132 × 708 px con el 85 % en blanco, y
   las quince restantes vivían debajo de ese vacío, fuera de la
   primera pantalla. Un plano a medio dibujar es el estado normal de
   un restaurante que acaba de empezar, y la vista lo castigaba.

   El encuadre es la caja que ocupa lo dibujado, con aire alrededor
   —los pines miden 100 px y se dibujan CENTRADOS en su punto, así que
   sin margen se salen— y con un mínimo para que una sola mesa no se
   coma la pantalla. Las coordenadas siguen siendo las del dueño: lo
   que cambia es qué trozo del local se enseña, no dónde está cada
   mesa dentro de él.                                            */
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

function Plano({
  tables, floorPlan, nivel, selected, onOpen,
}: {
  tables: SalonTable[];
  floorPlan: FloorPlan | null;
  nivel: string;
  selected: number | null;
  onOpen: (n: number) => void;
}) {
  const porN = useMemo(() => new Map(tables.map((t) => [t.n, t])), [tables]);
  const colocadas = (floorPlan?.tables ?? []).filter((t) => t.level === nivel && porN.has(t.n));
  const zonas = (floorPlan?.fixtures ?? []).filter((f) => f.level === nivel);
  const enPlano = new Set(colocadas.map((t) => t.n));

  /* Las que el dueño no colocó siguen existiendo: se enseñan aparte en
     vez de desaparecer del salón por un descuido del plano. Van por
     número, no por urgencia: aquí se busca «la 14». */
  const fuera = tables.filter((t) => !enPlano.has(t.n)).sort((a, b) => a.n - b.n);

  // Sin plano dibujado: se reparten en rejilla dentro del mismo lienzo, para
  // que cambiar de vista siga significando algo.
  const auto = colocadas.length === 0;
  const cols = Math.max(1, Math.min(6, Math.ceil(Math.sqrt(tables.length))));
  const filas = Math.max(1, Math.ceil(tables.length / cols));

  /* Con la rejilla automática el lienzo ya está lleno de lado a lado: no
     hay nada que recortar. Con plano dibujado, se enseña el trozo del
     local que tiene algo. */
  const enc = useMemo(() => (auto ? COMPLETO : encuadrar([
    ...colocadas.map((t) => ({ x0: t.x, y0: t.y, x1: t.x, y1: t.y })),
    ...zonas.map((f) => ({ x0: f.x - f.w / 2, y0: f.y - f.h / 2, x1: f.x + f.w / 2, y1: f.y + f.h / 2 })),
  ])), [auto, colocadas, zonas]);

  /** De coordenada del local a coordenada del trozo que se está viendo. */
  const px = (x: number) => ((x - enc.x) / enc.w) * 100;
  const py = (y: number) => ((y - enc.y) / enc.h) * 100;

  return (
    <div className="salon-plan-row">
      {/* La proporción es la del TROZO enseñado, calculada sobre el 16:10
          del local entero: recortar la mitad de alto da un lienzo el doble
          de ancho que alto, y ese vacío deja de existir. En el teléfono el
          envoltorio se desplaza en horizontal para que no se pisen. */}
      <div className="salon-floor-scroll" style={{ flex: 1, minWidth: 0 }}>
        <div
          className="salon-canvas"
          style={{
            aspectRatio: `${16 * enc.w} / ${10 * enc.h}`,
            flex: '0 0 auto',
            minHeight: enc === COMPLETO ? undefined : 240,
          }}
        >
          {zonas.map((f) => (
            <div
              key={f.id}
              className="salon-zone"
              style={{
                left: `${px(f.x - f.w / 2)}%`,
                top: `${py(f.y - f.h / 2)}%`,
                width: `${(f.w / enc.w) * 100}%`,
                height: `${(f.h / enc.h) * 100}%`,
              }}
            >
              <Icon name={FIXTURE_META[f.kind].icon} size={18} />
              <span style={{ padding: '0 4px', textAlign: 'center', lineHeight: 1.1 }}>{fixtureLabel(f)}</span>
            </div>
          ))}

          {auto
            ? tables.map((t, i) => (
              <TablePin
                key={t.n}
                t={t}
                x={((i % cols) + 0.5) / cols}
                y={(Math.floor(i / cols) + 0.5) / filas}
                selected={selected === t.n}
                onSelect={() => onOpen(t.n)}
              />
            ))
            : colocadas.map((ft) => {
              const t = porN.get(ft.n);
              if (!t) return null;
              return (
                <TablePin
                  key={ft.n}
                  t={t}
                  x={px(ft.x) / 100}
                  y={py(ft.y) / 100}
                  selected={selected === ft.n}
                  onSelect={() => onOpen(ft.n)}
                />
              );
            })}
        </div>
      </div>

      {/* AL LADO, no debajo: eran quince mesas —tres de ellas ocupadas—
          escondidas bajo un lienzo de 708 px casi vacío. */}
      {!auto && fuera.length > 0 && (
        <div className="salon-plan-out">
          <div className="adm-label" style={{ color: 'var(--u-text-3)', marginBottom: 8 }}>
            Fuera del plano · {fuera.length}
          </div>
          <div className="salon-plan-out-pins">
            {fuera.map((t) => (
              <div key={t.n} style={{ position: 'relative', width: 100, height: 74 }}>
                <TablePin t={t} x={0.5} y={0.5} selected={selected === t.n} onSelect={() => onOpen(t.n)} />
              </div>
            ))}
          </div>
          <Link href="/admin/ajustes/salon" className="salon-plan-out-link">
            Colocarlas en el plano
            <Icon name="chevronRight" size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}
