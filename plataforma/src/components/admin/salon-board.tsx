'use client';

/* ============================================================
   EL SALÓN — una pantalla, tres formas de mirarlo
   ------------------------------------------------------------
   «Mesas» era un cuadrito de 86 px con número, monto y una palabra:
   no decía quién atiende, cuánta gente hay, hace cuánto están
   sentados, en qué va la comida ni qué hay que hacer. El plano daba
   todavía menos: un pin con un número.

   Ahora es UNA pantalla con una barra superior que no se mueve
   —resumen, interruptor y «Tomar pedido»— y tres lienzos debajo:

     · Fichas — el salón ordenado POR URGENCIA, no por número. En
                hora pico nadie busca «la mesa 7»: busca qué atender
                primero.
     · Plano  — el salón como está el local. Es como el mesero nuevo
                lo aprende, y ahora cada mesa cuenta lo mismo que su
                ficha. Al tocarla, la cuenta se abre AL LADO.
     · Lista  — el mismo salón de corrido, para leerlo entero de una
                vez con los montos alineados por la coma.

   Dos reglas que sostienen todo lo demás:
     1. Una mesa = UNA acción. Nada de menús de opciones: la ficha
        enseña lo que toca hacer ahora (`lib/table-state.ts`).
     2. Una mesa libre no dice nada. Solo lleva color la que necesita
        a alguien.

   El estado sale de `lib/table-state.ts`, la MISMA regla que usa el
   teléfono del mesero: si una mesa sale en acento aquí, sale en
   acento allá.
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Icon, type IconName } from '@/components/icons';
import { FIXTURE_META, fixtureLabel } from '@/components/admin/floor-map';
import { fmtMoney } from '@/components/admin/orders-panel';
import type { PanelCurrency } from '@/components/admin/order-card';
import BillPanel, { type BillData } from '@/components/admin/salon/bill-panel';
import { TableCard, TableRow, TablePin, type SalonTable } from '@/components/admin/salon/pieces';
import { getTableBill, serveTableReady, resolveTableCalls } from '@/lib/actions/orders';
import { buildBillLines, billBreakdown } from '@/lib/bill-split';
import {
  tablesWithState, needsAttention, byUrgency, tableStage, tableAction, fmtMin,
} from '@/lib/table-state';
import type { TableOccupancy, TableCall } from '@/lib/db/orders';
import type { FloorPlan } from '@/lib/theme/defaults';

/** Las tres vistas del interruptor. */
type View = 'fichas' | 'plano' | 'lista';

/* La elección se recuerda POR NAVEGADOR, que en la práctica es por
   persona: el encargado abre en Fichas y quien se sabe el salón de
   memoria abre en Plano, sin volver a elegir cada noche. */
const VIEW_KEY = 'leogin:salon-vista';

interface Props {
  tableCount: number;
  occupancy: Record<number, TableOccupancy>;
  calls: Record<number, TableCall>;
  currency: PanelCurrency;
  restaurantId: string;
  /** A dónde manda tomar/cobrar un pedido; null si el plan no lo incluye. */
  waiterHref: string | null;
  floorPlan: FloorPlan | null;
  /** Cuántas veces se ocupó una mesa hoy. */
  turnsToday: number;
}

export default function SalonBoard({
  tableCount, occupancy, calls, currency, restaurantId, waiterHref, floorPlan, turnsToday,
}: Props) {
  const router = useRouter();

  /* El reloj entra por estado y arranca en null: los avisos por tiempo
     dependen de la hora del cliente, y pintarlos en el HTML del servidor
     haría que el primer render no coincida. */
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Traer el salón de vuelta cada minuto: es un tablero, no un formulario.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(id);
  }, [router]);

  /* La vista. Arranca SIEMPRE en 'fichas' y la preferencia se aplica
     después de montar: leer localStorage durante el render daría un HTML
     de servidor distinto al del cliente. */
  const [view, setView] = useState<View>('fichas');
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === 'fichas' || v === 'plano' || v === 'lista') setView(v);
    } catch { /* navegador sin almacenamiento: se queda en Fichas */ }
  }, []);
  const elegirVista = useCallback((v: View) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* no-op */ }
  }, []);

  /* En el teléfono la cuenta no cabe al lado de nada: sube como hoja. */
  const [esTelefono, setEsTelefono] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => setEsTelefono(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  /* ── El salón, resuelto ───────────────────────────────────── */
  const base = useMemo(
    () => tablesWithState(tableCount, occupancy, calls, now),
    [tableCount, occupancy, calls, now],
  );

  const money = useCallback((n: number) => fmtMoney(n, currency), [currency]);
  /** Monto abreviado del plano: «Q412», «Q1.2k». En 100 px no cabe más. */
  const moneyCorto = useCallback((n: number) => (
    n >= 1000
      ? `${currency.position === 'suffix' ? '' : currency.symbol}${(n / 1000).toFixed(1)}k${currency.position === 'suffix' ? currency.symbol : ''}`
      : fmtMoney(n, currency, 0)
  ), [currency]);

  /** Sillas de cada mesa según el plano del dueño — lo que enseña una
      mesa libre («2 pers»), que es su capacidad, no quién está sentado. */
  const sillas = useMemo(() => {
    const m: Record<number, number> = {};
    for (const t of floorPlan?.tables ?? []) if (t.seats) m[t.n] = t.seats;
    return m;
  }, [floorPlan]);

  const salon: SalonTable[] = useMemo(() => base.map((t) => {
    const stage = tableStage(t.occ, t.state);
    const pax = t.occ?.partySize ?? (t.occ ? null : sillas[t.n] ?? null);
    const desde = stage.since ? new Date(stage.since).getTime() : NaN;
    return {
      n: t.n,
      state: t.state,
      stage,
      occ: t.occ,
      action: tableAction(t.state),
      total: t.occ ? money(t.occ.total) : null,
      totalCorto: t.occ ? moneyCorto(t.occ.total) : null,
      pax: pax != null ? `${pax} pers` : null,
      tiempo: now != null && Number.isFinite(desde) ? fmtMin((now - desde) / 60000) : null,
    };
  }), [base, sillas, money, moneyCorto, now]);

  /* El orden del salón: primero lo que pide algo, luego lo que está en
     marcha, y al final las libres. El número de mesa solo manda DENTRO
     de cada grupo. */
  const porUrgencia = useMemo(() => {
    const porN = new Map(salon.map((s) => [s.n, s]));
    return byUrgency(base).map((t) => porN.get(t.n)).filter((s): s is SalonTable => !!s);
  }, [salon, base]);

  const urgentes = useMemo(() => needsAttention(base), [base]);
  const abiertas = useMemo(() => base.filter((t) => t.occ), [base]);
  const sinCobrar = useMemo(() => abiertas.reduce((s, t) => s + (t.occ?.total ?? 0), 0), [abiertas]);

  /* ── La mesa elegida y su cuenta ──────────────────────────── */
  const [sel, setSel] = useState<number | null>(null);
  const [bill, setBill] = useState<BillData | null>(null);
  const [billLoading, setBillLoading] = useState(false);
  const [billError, setBillError] = useState<string | null>(null);
  const billFor = useRef<number | null>(null);

  const elegida = sel != null ? salon.find((s) => s.n === sel) ?? null : null;

  useEffect(() => {
    if (sel == null) { billFor.current = null; setBill(null); setBillError(null); return; }
    const mesa = salon.find((s) => s.n === sel);
    if (!mesa || mesa.state.kind === 'libre') { setBill(null); setBillError(null); return; }
    if (billFor.current === sel) return;

    billFor.current = sel;
    let vivo = true;
    setBillLoading(true);
    setBillError(null);
    getTableBill(restaurantId, sel).then((res) => {
      if (!vivo) return;
      setBillLoading(false);
      if ('error' in res) { setBillError(res.error); setBill(null); return; }
      setBill({ lines: buildBillLines(res.orders), breakdown: billBreakdown(res.orders) });
    }).catch(() => {
      /* Sin `catch`, una caída de red deja el panel en «Cargando la
         cuenta…» para siempre: el mesero se queda mirando una pantalla
         que no va a cambiar nunca y sin nada que tocar. */
      if (!vivo) return;
      setBillLoading(false);
      setBillError('No se pudo traer la cuenta. Revisa la conexión y vuelve a tocar la mesa.');
      setBill(null);
      billFor.current = null;
    });
    return () => { vivo = false; };
  }, [sel, salon, restaurantId]);

  /* ── Las acciones ─────────────────────────────────────────── */
  const [pendiente, setPendiente] = useState<number | null>(null);
  const [, startAction] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);

  const irAlMesero = useCallback((n: number | null, intent?: 'cobrar' | 'dividir' | 'agregar') => {
    if (!waiterHref) return;
    const q = new URLSearchParams();
    if (n != null) q.set('mesa', String(n));
    if (intent) q.set('ir', intent);
    router.push(q.size > 0 ? `${waiterHref}?${q.toString()}` : waiterHref);
  }, [waiterHref, router]);

  const hacer = useCallback((t: SalonTable) => {
    switch (t.action.kind) {
      case 'llevar':
        setPendiente(t.n);
        startAction(async () => {
          const res = await serveTableReady(restaurantId, t.n);
          setPendiente(null);
          if (res.error) { setAviso(res.error); return; }
          setAviso(`Mesa ${t.n}: comida marcada como servida.`);
          router.refresh();
        });
        return;
      case 'atender':
        setPendiente(t.n);
        startAction(async () => {
          const res = await resolveTableCalls(restaurantId, t.n);
          setPendiente(null);
          if (res.error) { setAviso(res.error); return; }
          setAviso(`Mesa ${t.n}: llamada atendida.`);
          router.refresh();
        });
        return;
      case 'cobrar':
        irAlMesero(t.n, 'cobrar');
        return;
      case 'revisar':
      case 'agregar':
      case 'abrir':
      default:
        irAlMesero(t.n, 'agregar');
    }
  }, [restaurantId, router, irAlMesero]);

  // El acuse dura lo que tarda en leerse y se va solo.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  const accionDeshabilitada = useCallback(
    (t: SalonTable) => !waiterHref && (t.action.kind === 'cobrar' || t.action.kind === 'agregar' || t.action.kind === 'abrir' || t.action.kind === 'revisar'),
    [waiterHref],
  );

  /* ── Niveles del plano ────────────────────────────────────── */
  const planEnabled = !!floorPlan?.enabled && (floorPlan?.levels.length ?? 0) > 0;
  const levels = useMemo(() => floorPlan?.levels ?? [], [floorPlan]);
  const [nivel, setNivel] = useState<string>('');
  useEffect(() => {
    setNivel((prev) => (prev && levels.some((l) => l.id === prev) ? prev : levels[0]?.id ?? ''));
  }, [levels]);

  if (tableCount <= 0) {
    return (
      <div style={{ fontSize: 14, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
        Todavía no hay mesas configuradas. Ponles número en Ajustes › Salón y el salón aparece aquí.
      </div>
    );
  }

  const sentadosDe = (t: SalonTable) => {
    if (!t.occ || now == null) return null;
    return fmtMin((now - new Date(t.occ.since).getTime()) / 60000);
  };

  const panel = elegida ? (
    <BillPanel
      t={elegida}
      data={bill}
      loading={billLoading}
      error={billError}
      money={money}
      sentados={sentadosDe(elegida)}
      canWaiter={!!waiterHref}
      onClose={() => setSel(null)}
      onCobrar={() => irAlMesero(elegida.n, 'cobrar')}
      onDividir={() => irAlMesero(elegida.n, 'dividir')}
      onAgregar={() => irAlMesero(elegida.n, 'agregar')}
    />
  ) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── La barra de arriba. Idéntica en las tres vistas: lo único
             que cambia al tocar el interruptor es el lienzo de abajo. ── */}
      <div className="salon-top">
        <div className="salon-summary">
          <Celda label="Mesas con gente" value={`${abiertas.length} / ${tableCount}`} />
          <Celda label="Te necesitan" value={String(urgentes.length)} accent={urgentes.length > 0} />
          <Celda label="Sin cobrar" value={money(sinCobrar)} />
          <Celda label="Rotación hoy" value={String(turnsToday)} />
        </div>

        <div className="salon-seg" role="tablist" aria-label="Cómo ver el salón">
          <SegBtn on={view === 'fichas'} icon="grid" label="Fichas" onClick={() => elegirVista('fichas')} />
          <SegBtn on={view === 'plano'} icon="home" label="Plano" onClick={() => elegirVista('plano')} />
          <SegBtn on={view === 'lista'} icon="list" label="Lista" onClick={() => elegirVista('lista')} />
        </div>

        <button
          type="button"
          onClick={() => irAlMesero(sel)}
          disabled={!waiterHref}
          className="press btn-accent"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexShrink: 0,
            height: 44, padding: '0 18px', borderRadius: 12, border: 'none',
            fontSize: 14.5, fontWeight: 600, cursor: waiterHref ? 'pointer' : 'default',
            opacity: waiterHref ? 1 : 0.55,
          }}
        >
          <Icon name="plus" size={17} strokeWidth={2} />
          Tomar pedido
        </button>
      </div>

      {aviso && (
        <div
          role="status"
          style={{
            padding: '10px 14px', borderRadius: 12, fontSize: 13, fontWeight: 500, color: 'var(--u-text-2)',
            border: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
          }}
        >
          {aviso}
        </div>
      )}

      {/* ── Lienzo: Fichas ─────────────────────────────────────── */}
      {view === 'fichas' && (
        <div className="salon-grid">
          {porUrgencia.map((t) => (
            <TableCard
              key={t.n}
              t={t}
              onOpen={() => setSel(t.n)}
              onAction={() => hacer(t)}
              disabled={accionDeshabilitada(t)}
              busy={pendiente === t.n}
            />
          ))}
        </div>
      )}

      {/* ── Lienzo: Lista ──────────────────────────────────────── */}
      {view === 'lista' && (
        <div
          style={{
            borderRadius: 14, border: '1px solid var(--u-hair)', overflow: 'hidden',
            background: 'var(--adm-card)', boxShadow: 'var(--adm-shadow-xs)',
          }}
        >
          {porUrgencia.map((t, i) => (
            <TableRow
              key={t.n}
              t={t}
              primera={i === 0}
              onOpen={() => setSel(t.n)}
              onAction={() => hacer(t)}
              disabled={accionDeshabilitada(t)}
              busy={pendiente === t.n}
            />
          ))}
        </div>
      )}

      {/* ── Lienzo: Plano ──────────────────────────────────────── */}
      {view === 'plano' && (
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
              <Muestra kind="atencion">Te necesita</Muestra>
              <Muestra kind="abierta">Comiendo</Muestra>
              <Muestra kind="libre">Libre</Muestra>
            </div>

            <PlanoDelSalon
              salon={salon}
              floorPlan={planEnabled ? floorPlan : null}
              nivel={nivel}
              sel={sel}
              onSelect={setSel}
            />
          </div>

          {!esTelefono && panel}
        </div>
      )}

      {/* En el teléfono la mesa elegida sube como hoja, en cualquier vista:
          336 px de panel al lado no existen a 390 px de ancho. */}
      {esTelefono && panel && (
        <div
          onClick={() => setSel(null)}
          className="waiter-sheet-scrim"
          style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="anim-slide-up waiter-sheet"
            style={{ width: '100%', maxWidth: 460, maxHeight: '86dvh', display: 'flex', overflow: 'hidden' }}
          >
            {panel}
          </div>
        </div>
      )}

      {view !== 'plano' && (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--u-text-4)', lineHeight: 1.5, padding: '0 2px' }}>
          Las mesas se ordenan por urgencia, no por número. Una mesa libre no dice nada: solo se pinta la que
          necesita a alguien ahora.
        </p>
      )}
    </div>
  );
}

/* ── Piezas de la barra superior ──────────────────────────────── */

function Celda({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="salon-summary-label">{label}</div>
      <div className="salon-summary-value" style={accent ? { color: 'var(--brand-accent-ink)' } : undefined}>
        {value}
      </div>
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

function Muestra({ kind, children }: { kind: 'atencion' | 'abierta' | 'libre'; children: React.ReactNode }) {
  const estilo =
    kind === 'atencion'
      ? { border: '1.5px solid var(--brand-accent)', background: 'color-mix(in srgb, var(--brand-accent) 14%, transparent)' }
      : kind === 'abierta'
        ? { border: '1.5px solid var(--u-hair-2)', background: 'var(--adm-card)' }
        : { border: '1.5px dashed var(--u-hair-2)', background: 'transparent' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span aria-hidden style={{ width: 10, height: 10, borderRadius: 4, flexShrink: 0, ...estilo }} />
      {children}
    </span>
  );
}

/* ── El plano ─────────────────────────────────────────────────
   Las zonas fijas (barra, caja, cocina) salen del plano que el dueño
   dibujó en Ajustes › Salón — no están quemadas aquí. Un plano sin
   dibujar cae en una cuadrícula automática, que es mejor que una
   pantalla vacía diciendo «configura tu salón».                */
function PlanoDelSalon({
  salon, floorPlan, nivel, sel, onSelect,
}: {
  salon: SalonTable[];
  floorPlan: FloorPlan | null;
  nivel: string;
  sel: number | null;
  onSelect: (n: number) => void;
}) {
  const colocadas = (floorPlan?.tables ?? []).filter((t) => t.level === nivel && t.n <= salon.length);
  const zonas = (floorPlan?.fixtures ?? []).filter((f) => f.level === nivel);
  const enPlano = new Set(colocadas.map((t) => t.n));
  const fuera = salon.filter((t) => !enPlano.has(t.n));

  // Sin plano dibujado: se reparten en rejilla dentro del mismo lienzo, para
  // que cambiar de vista siga significando algo.
  const auto = colocadas.length === 0;
  const cols = Math.max(1, Math.min(6, Math.ceil(Math.sqrt(salon.length))));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
      {/* 16:10 fijo: el plano es el local, y un local no cambia de forma
          porque la ventana sea más alta. En el teléfono el envoltorio se
          desplaza en horizontal para que las mesas no se pisen. */}
      <div className="salon-floor-scroll">
      <div className="salon-canvas" style={{ aspectRatio: '16 / 10', flex: '0 0 auto' }}>
        {zonas.map((f) => (
          <div
            key={f.id}
            className="salon-zone"
            style={{
              left: `${(f.x - f.w / 2) * 100}%`,
              top: `${(f.y - f.h / 2) * 100}%`,
              width: `${f.w * 100}%`,
              height: `${f.h * 100}%`,
            }}
          >
            <Icon name={FIXTURE_META[f.kind].icon} size={18} />
            <span style={{ padding: '0 4px', textAlign: 'center', lineHeight: 1.1 }}>{fixtureLabel(f)}</span>
          </div>
        ))}

        {auto
          ? salon.map((t, i) => (
            <TablePin
              key={t.n}
              t={t}
              x={((i % cols) + 0.5) / cols}
              y={(Math.floor(i / cols) + 0.5) / Math.ceil(salon.length / cols)}
              selected={sel === t.n}
              onSelect={() => onSelect(t.n)}
            />
          ))
          : colocadas.map((ft) => {
            const t = salon.find((s) => s.n === ft.n);
            if (!t) return null;
            return (
              <TablePin key={ft.n} t={t} x={ft.x} y={ft.y} selected={sel === ft.n} onSelect={() => onSelect(ft.n)} />
            );
          })}
      </div>
      </div>

      {/* Las que el dueño no colocó siguen existiendo: se enseñan debajo en
          vez de desaparecer del salón por un descuido del plano. */}
      {!auto && fuera.length > 0 && (
        <div>
          <div className="adm-label" style={{ color: 'var(--u-text-3)', marginBottom: 8 }}>Fuera del plano</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {fuera.map((t) => (
              <div key={t.n} style={{ position: 'relative', width: 100, height: 74 }}>
                <TablePin t={t} x={0.5} y={0.5} selected={sel === t.n} onSelect={() => onSelect(t.n)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
