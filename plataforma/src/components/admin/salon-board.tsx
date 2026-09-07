'use client';

/* ============================================================
   EL SALÓN DEL DUEÑO — qué está pasando ahora mismo
   ------------------------------------------------------------
   Una barra superior que no se mueve —resumen, interruptor y
   «Tomar pedido»— y debajo el lienzo del salón, que es el MISMO
   que usa el panel de mesero (salon/salon-canvas.tsx). Antes cada
   pantalla dibujaba su propio salón, con su propio plano y su
   propio vocabulario; ahora la diferencia entre las dos es solo
   lo que pasa al tocar una mesa:

     · aquí se abre su cuenta AL LADO, sin perder de vista el salón;
     · en el mesero se entra en el ciclo de esa mesa.

   Dos reglas que sostienen lo demás:
     1. Una mesa = UNA acción. Nada de menús de opciones: la ficha
        enseña lo que toca hacer ahora (`lib/table-state.ts`).
     2. Una mesa libre no dice nada. Solo lleva color la que necesita
        a alguien.
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Icon } from '@/components/icons';
import { fmtMoney } from '@/components/admin/orders-panel';
import type { PanelCurrency } from '@/components/admin/order-card';
import BillPanel, { type BillData } from '@/components/admin/salon/bill-panel';
import SalonCanvas, { SalonViewSwitch, useSalonView } from '@/components/admin/salon/salon-canvas';
import { buildSalonTables, type SalonTable } from '@/components/admin/salon/pieces';
import { useSalonLive } from '@/components/admin/salon/use-salon-live';
import {
  getTableBill, serveTableReady, resolveTableCalls,
  undoServeTable, undoResolveTableCalls,
} from '@/lib/actions/orders';
import { buildBillLines, billBreakdown } from '@/lib/bill-split';
import { fmtMin, type SalonUmbrales } from '@/lib/table-state';
import type { TableOccupancy, TableCall } from '@/lib/db/orders';
import type { FloorPlan } from '@/lib/theme/defaults';

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
  /** Los relojes del salón de este restaurante (Ajustes › Pedidos). */
  umbrales?: SalonUmbrales;
}

export default function SalonBoard({
  tableCount, occupancy, calls, currency, restaurantId, waiterHref, floorPlan, turnsToday, umbrales,
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

  /* El salón cambia aunque nadie toque esta pantalla, y el encargado es
     justo quien no puede enterarse tarde. Antes esto era un
     `router.refresh()` cada 60 s y ya está. */
  useSalonLive(`salon-${restaurantId}`);

  const [view, elegirVista] = useSalonView('leogin:salon-vista', 'fichas');

  /* Cuando la cuenta no cabe AL LADO, sube como hoja.
     ------------------------------------------------------------------
     El corte tiene que ser el MISMO en el que `.salon-floor` deja de ser
     una fila (1180 px), y estaba en 767. Entre esos dos anchos —que es
     justo la tablet del encargado— el panel dejaba de ir al lado pero
     tampoco subía como hoja: se montaba a todo el ancho DEBAJO de las
     veinte fichas, y nada desplazaba la pantalla hasta él. Medido a
     1024×768: la cuenta aparecía en `top: 1334px` con `scrollTop 0`, o sea
     566 px por debajo del borde inferior. Tocar una mesa parecía no hacer
     nada.

     Es el mismo fallo que se arregló el 2026-09-06 (`{aside}` vivía solo
     en la vista Plano) un paso más allá: el panel ya se monta, pero donde
     nadie mira. Lo que se abre tiene que verse.

     La hoja ya sabe comportarse en pantalla ancha: `.waiter-sheet` se
     centra y se redondea a partir de 720 px, así que en la tablet sale
     como un diálogo de 460 px, no como una hoja pegada abajo. */
  const [comoHoja, setComoHoja] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1180px)');
    const apply = () => setComoHoja(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  /* ── El salón, resuelto ───────────────────────────────────── */
  const money = useCallback((n: number) => fmtMoney(n, currency), [currency]);
  /** Monto abreviado del plano: «Q412», «Q1.2k». En 100 px no cabe más. */
  const moneyCorto = useCallback((n: number) => (
    n >= 1000
      ? `${currency.position === 'suffix' ? '' : currency.symbol}${(n / 1000).toFixed(1)}k${currency.position === 'suffix' ? currency.symbol : ''}`
      : fmtMoney(n, currency, 0)
  ), [currency]);

  const salon = useMemo(
    () => buildSalonTables({ tableCount, occupancy, calls, now, floorPlan, money, moneyShort: moneyCorto, umbrales }),
    [tableCount, occupancy, calls, now, floorPlan, money, moneyCorto, umbrales],
  );

  /* «Te necesitan» cuenta las ALARMAS, no todo lo que tiene un reloj
     corrido. Con el criterio viejo el contador decía 6 de 8 mesas en un
     salón normal, y un número que casi siempre es «casi todas» no es un
     número: es ruido con cifras. Lo pendiente se ve en la ficha. */
  const urgentes = useMemo(() => salon.filter((t) => t.state.level === 'alarma'), [salon]);
  const abiertas = useMemo(() => salon.filter((t) => t.occ), [salon]);
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
  /* El acuse lleva su propio DESHACER cuando lo que se hizo se puede
     deshacer. «Servido» y «Atendida» son de un solo toque, desde una ficha
     de una rejilla que se reordena sola: acertar en la mesa de al lado
     dejaba comida dada por servida (y su reloj de «sin cobrar» corriendo)
     o borraba a alguien con la mano levantada, y lo único que quedaba era
     este aviso de cuatro segundos sin salida. */
  const [aviso, setAviso] = useState<{ text: string; undo?: () => void } | null>(null);

  /* Ir al mesero es un viaje de IDA Y VUELTA, no una puerta de un solo
     sentido. Antes se llegaba allí y no había forma de volver al salón:
     la única salida era el menú —Pedidos › Mesas, tres toques— y quien
     tocaba «Cobrar» en una ficha para atender UNA mesa se quedaba en la
     otra pantalla. `volver=salon` hace que la flecha de la cabecera
     devuelva aquí. */
  const irAlMesero = useCallback((n: number | null, intent?: 'cobrar' | 'dividir' | 'agregar') => {
    if (!waiterHref) return;
    const q = new URLSearchParams();
    if (n != null) q.set('mesa', String(n));
    if (intent) q.set('ir', intent);
    q.set('volver', 'salon');
    router.push(`${waiterHref}?${q.toString()}`);
  }, [waiterHref, router]);

  /** Devuelve a «lista» la comida que se acaba de dar por servida. */
  const deshacerServir = useCallback((n: number, ids: string[]) => {
    setPendiente(n);
    startAction(async () => {
      const res = await undoServeTable(restaurantId, ids);
      setPendiente(null);
      setAviso({ text: res.error ?? `Mesa ${n}: deshecho. La comida vuelve a estar lista.` });
      router.refresh();
    });
  }, [restaurantId, router]);

  /** Devuelve a pendientes las llamadas que se acaban de dar por atendidas. */
  const deshacerAtender = useCallback((n: number, ids: string[]) => {
    setPendiente(n);
    startAction(async () => {
      const res = await undoResolveTableCalls(restaurantId, ids);
      setPendiente(null);
      setAviso({ text: res.error ?? `Mesa ${n}: deshecho. Vuelve a estar llamando.` });
      router.refresh();
    });
  }, [restaurantId, router]);

  const hacer = useCallback((t: SalonTable) => {
    switch (t.action.kind) {
      case 'llevar':
        setPendiente(t.n);
        startAction(async () => {
          const res = await serveTableReady(restaurantId, t.n);
          setPendiente(null);
          if (res.error) { setAviso({ text: res.error }); return; }
          const ids = res.ids ?? [];
          setAviso({
            text: `Mesa ${t.n}: comida marcada como servida.`,
            undo: ids.length > 0 ? () => deshacerServir(t.n, ids) : undefined,
          });
          router.refresh();
        });
        return;
      case 'atender':
        setPendiente(t.n);
        startAction(async () => {
          const res = await resolveTableCalls(restaurantId, t.n);
          setPendiente(null);
          if (res.error) { setAviso({ text: res.error }); return; }
          const ids = res.ids ?? [];
          setAviso({
            text: `Mesa ${t.n}: llamada atendida.`,
            undo: ids.length > 0 ? () => deshacerAtender(t.n, ids) : undefined,
          });
          router.refresh();
        });
        return;
      case 'cobrar':
        irAlMesero(t.n, 'cobrar');
        return;
      /* «Ver la comanda» y «Revisar la mesa» NO se van a ninguna parte: lo
         que piden es mirar, y la cuenta ya se abre aquí al lado (o como
         hoja en el teléfono) con el salón todavía a la vista. Mandar al
         mesero para leer una lista que esta pantalla ya sabe pintar era
         cambiar de aplicación para no hacer nada.

         Además así funciona sin el panel de mesero: un Estándar con
         «comer en local» puede revisar una mesa aunque su plan no incluya
         tomar pedidos. Ver `accionDeshabilitada`. */
      case 'revisar':
        setSel(t.n);
        return;
      case 'agregar':
      case 'abrir':
      default:
        /* Estas dos SÍ siguen viajando, y es a propósito: abrir una mesa y
           agregar platillos necesitan el motor de la comanda —carrito,
           borrador, cola sin conexión, respaldo al hub— que vive entero en
           waiter-panel.tsx. Rehacerlo aquí sería una segunda verdad sobre
           la misma mesa, que es justo lo que bill-panel.tsx se prohíbe. */
        irAlMesero(t.n, 'agregar');
    }
  }, [restaurantId, router, irAlMesero, deshacerServir, deshacerAtender]);

  /* El acuse dura lo que tarda en leerse y se va solo. Con «deshacer»
     dura más: cuatro segundos son los que tarda alguien en LEER que se
     equivocó, y para entonces el botón ya no estaría. */
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), aviso.undo ? 9000 : 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  /* Sin panel de mesero solo se apagan las acciones que de verdad viajan
     allí. «Revisar» salió de la lista al dejar de ser un viaje. */
  const accionDeshabilitada = useCallback(
    (t: SalonTable) => !waiterHref && (t.action.kind === 'cobrar' || t.action.kind === 'agregar' || t.action.kind === 'abrir'),
    [waiterHref],
  );

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

        <SalonViewSwitch view={view} onChange={elegirVista} />

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
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            padding: '10px 14px', borderRadius: 12, fontSize: 13, fontWeight: 500, color: 'var(--u-text-2)',
            border: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
          }}
        >
          <span style={{ flex: 1, minWidth: 160 }}>{aviso.text}</span>
          {aviso.undo && (
            <button
              type="button"
              onClick={aviso.undo}
              className="press"
              style={{
                flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7,
                height: 34, padding: '0 14px', borderRadius: 9, cursor: 'pointer',
                border: '1px solid var(--u-hair-2)', background: 'var(--adm-card)',
                color: 'var(--u-text)', fontSize: 13, fontWeight: 600,
              }}
            >
              <Icon name="clock" size={14} />
              Deshacer
            </button>
          )}
        </div>
      )}

      <SalonCanvas
        view={view}
        tables={salon}
        floorPlan={floorPlan}
        selected={sel}
        onOpen={setSel}
        onAction={hacer}
        actionDisabled={accionDeshabilitada}
        busyTable={pendiente}
        aside={!comoHoja ? panel : null}
      />

      {/* Sin sitio al lado, la mesa elegida sube como hoja, en cualquier
          vista: 336 px de panel al lado no existen ni a 390 px de ancho ni
          en una tablet de 1024, donde la fila ya se partió en columna. */}
      {comoHoja && panel && (
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
