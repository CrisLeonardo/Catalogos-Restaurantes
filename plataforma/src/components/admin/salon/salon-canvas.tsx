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

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
/* `Link` es aqui `PanelLink`: traduce las rutas del panel al origen desde el
   que se sirve la pagina. Lo que no es del panel pasa de largo sin tocarse.
   Ver components/admin/panel-link.tsx. */
import Link from '@/components/admin/panel-link';
import { Icon, type IconName } from '@/components/icons';
import { FIXTURE_META, fixtureLabel } from '@/components/admin/salon/fixtures';
import { TableCard, TableRow, TablePin, type SalonTable } from '@/components/admin/salon/pieces';
import PlanoVisor from '@/components/admin/salon/plano-visor';
import { TONE_LABEL, TONE_ORDER, tableTone } from '@/lib/table-state';
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
    /* La cuenta va AL LADO también aquí. Estaba solo en el plano —
       `{aside}` vivía únicamente en el otro return— así que en Fichas y
       Lista, que es la vista con la que arranca el salón, tocar una mesa
       en PC no abría nada: el estado cambiaba y en la pantalla no pasaba
       nada. En el teléfono no se notaba porque ahí la cuenta sube como
       hoja desde salon-board.tsx, que sí es común a las tres vistas.

       `.salon-floor` con un solo hijo es una fila de un elemento: sin
       mesa elegida esto se pinta exactamente igual que antes. */
    return (
      <div className="salon-floor">
        <div
          style={{ flex: 1, minWidth: 0, position: 'relative' }}
          onPointerOver={congelar}
          onPointerDown={congelar}
          onPointerLeave={soltar}
        >
          {cambio && <BotonReordenar onClick={reordenar} />}
          {view === 'fichas' ? (
            <div className="salon-grid">
              {vistas.map((t, i) => {
                const libre = tableTone(t.state) === 'libre';
                /* En el teléfono las libres van en rejilla de cinco (PED-09,
                   opción A de la maqueta D-2): diecisiete renglones de 60 px
                   para enseñar un número eran ~1.000 px de scroll vacío. Las
                   libres ya vienen al final (orden por urgencia); el rótulo
                   va delante de la primera y en PC no se pinta. */
                const primeraLibre = libre && (i === 0 || tableTone(vistas[i - 1].state) !== 'libre');
                return (
                  <Fragment key={t.n}>
                    {primeraLibre && (
                      <div className="salon-libres-head">
                        <span>
                          Libres{' '}
                          <span className="t-mono" style={{ color: 'var(--u-text-4)', fontWeight: 500 }}>
                            {vistas.length - i}
                          </span>
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--u-text-3)' }}>Toca una para sentar</span>
                      </div>
                    )}
                    <TableCard
                      t={t}
                      onOpen={() => onOpen(t.n)}
                      onAction={() => onAction(t)}
                      disabled={disabled(t)}
                      busy={busyTable === t.n}
                    />
                  </Fragment>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                borderRadius: 'var(--radius-lg)', border: '1px solid var(--u-hair)', overflow: 'hidden',
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
        {aside}
      </div>
    );
  }

  return (
    <div className="salon-floor">
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--u-text-3)' }}>
          {/* Las zonas como pestañas tocables, con cuántas mesas tienen gente:
              eran texto de 12 px sin aspecto de botón y, en el teléfono,
              imposibles de acertar con el dedo. */}
          {planEnabled && levels.length > 1 && (
            <div className="salon-niveles" role="tablist" aria-label="Zona del salón">
              {levels.map((l) => {
                const delNivel = (floorPlan?.tables ?? []).filter((ft) => ft.level === l.id);
                const conGente = delNivel.filter((ft) => {
                  const t = tables.find((x) => x.n === ft.n);
                  return t && tableTone(t.state) !== 'libre';
                }).length;
                return (
                  <button
                    key={l.id}
                    type="button"
                    role="tab"
                    aria-selected={l.id === nivel}
                    data-on={l.id === nivel ? '1' : '0'}
                    onClick={() => setNivel(l.id)}
                  >
                    {l.name}
                    <span className="t-mono">{conGente}/{delNivel.length}</span>
                  </button>
                );
              })}
            </div>
          )}
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
   dibujar cae en una rejilla automática que llena el hueco, que es
   mejor que una pantalla vacía diciendo «configura tu salón».

   Cómo cabe en cada pantalla (encuadre, giro, tamaño de mesa, zoom) lo
   decide `PlanoVisor` con `lib/plano-salon.ts`, el mismo que usa el
   plano de Tomar pedidos. Antes el lienzo medía 620 px de ancho mínimo
   en el teléfono y la página entera se corría de lado.          */

/** Proporción de la ficha del plano: más ancha que alta, como siempre. */
const PIN_PROPORCION = 1.35;

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
  const colocadas = useMemo(
    () => (floorPlan?.tables ?? []).filter((t) => t.level === nivel && porN.has(t.n)),
    [floorPlan, nivel, porN],
  );
  const zonas = useMemo(() => (floorPlan?.fixtures ?? []).filter((f) => f.level === nivel), [floorPlan, nivel]);
  /* Una mesa colocada en OTRO nivel no está «fuera del plano»: está en la
     otra pestaña. Fuera es la que el dueño no colocó en ninguno. */
  const enPlano = new Set((floorPlan?.tables ?? []).map((t) => t.n));

  /* Las que el dueño no colocó siguen existiendo: se enseñan aparte en
     vez de desaparecer del salón por un descuido del plano. Van por
     número, no por urgencia: aquí se busca «la 14». */
  const fuera = tables.filter((t) => !enPlano.has(t.n)).sort((a, b) => a.n - b.n);

  const auto = colocadas.length === 0;
  const numeros = useMemo(() => (auto ? tables.map((t) => t.n) : []), [auto, tables]);

  return (
    <div className="salon-plan-row">
      <PlanoVisor
        className="salon-plan-visor"
        colocadas={colocadas}
        numeros={numeros}
        zonas={zonas}
        proporcion={PIN_PROPORCION}
        mesaMax={110}
        claveGiro="leogin:plano-giro:mesas"
        renderZona={(f) => (
          <div className="salon-zone">
            <Icon name={FIXTURE_META[f.kind].icon} size={18} />
            <span style={{ padding: '0 4px', textAlign: 'center', lineHeight: 1.1 }}>{fixtureLabel(f)}</span>
          </div>
        )}
        renderMesa={(n, geo) => {
          const t = porN.get(n);
          return t ? (
            <TablePin t={t} densidad={geo.densidad} selected={selected === n} onSelect={() => onOpen(n)} />
          ) : null;
        }}
      />

      {/* AL LADO, no debajo: eran quince mesas —tres de ellas ocupadas—
          escondidas bajo un lienzo de 708 px casi vacío. */}
      {!auto && fuera.length > 0 && (
        <div className="salon-plan-out">
          <div className="adm-label" style={{ color: 'var(--u-text-3)', marginBottom: 8 }}>
            Fuera del plano · {fuera.length}
          </div>
          <div className="salon-plan-out-pins">
            {fuera.map((t) => (
              <div key={t.n} style={{ width: 100, height: 74 }}>
                <TablePin t={t} selected={selected === t.n} onSelect={() => onOpen(t.n)} />
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
