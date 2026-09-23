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
import { SalonPlano, hayPlano, nivelesConMesas } from '@/components/admin/servicio/salon';
import { mesasDeServicio } from '@/lib/servicio/estado';
import { buildSalonTables, type SalonTable } from '@/components/admin/salon/pieces';
import { useSalonLive } from '@/components/admin/salon/use-salon-live';
import {
  getTableBill, serveTableReady, resolveTableCalls,
  undoServeTable, undoResolveTableCalls,
} from '@/lib/actions/orders';
import { seatTable, updateSeating, unseatTable } from '@/lib/actions/table-sessions';
import { buildBillLines, billBreakdown } from '@/lib/bill-split';
import { fmtMin, METRICA_LABEL, METRICA_POR_PUESTO, type SalonUmbrales, type SalonMetrica } from '@/lib/table-state';
import type { TableOccupancy, TableCall } from '@/lib/db/orders';
import type { TableSeating, WaiterOption } from '@/lib/db/table-sessions';
import type { FloorPlan } from '@/lib/theme/defaults';

interface Props {
  tableCount: number;
  occupancy: Record<number, TableOccupancy>;
  calls: Record<number, TableCall>;
  /** Mesas sentadas sin pedido todavía (migración 128). */
  seatings: Record<number, TableSeating>;
  /** A quién se le puede dar una mesa. */
  waiters: WaiterOption[];
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

/** Lo que FALTA por cobrar de una mesa: lo cobrado por partes ya no es deuda. */
function debe(t: { occ?: { total: number; paid?: number } | null }): number {
  return Math.max(0, (t.occ?.total ?? 0) - (t.occ?.paid ?? 0));
}

export default function SalonBoard({
  tableCount, occupancy, calls, seatings, waiters, currency, restaurantId,
  waiterHref, floorPlan, turnsToday, umbrales,
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

  /* ── Qué número lleva grande cada ficha (M-21) ────────────
     Arranca en «tiempo», que es lo que vigila el encargado, y se recuerda
     por aparato: la tablet del mostrador y el teléfono del dueño no miran
     lo mismo. La del mesero arranca en «total» y no se toca desde aquí. */
  const [metrica, setMetrica] = useState<SalonMetrica>(METRICA_POR_PUESTO.mando);
  useEffect(() => {
    try {
      const v = localStorage.getItem('leogin:salon-metrica');
      if (v === 'total' || v === 'tiempo' || v === 'pax' || v === 'etapa') setMetrica(v);
    } catch { /* navegador sin almacenamiento: se queda con la de fábrica */ }
  }, []);
  const elegirMetrica = useCallback((m: SalonMetrica) => {
    setMetrica(m);
    try { localStorage.setItem('leogin:salon-metrica', m); } catch { /* no-op */ }
  }, []);

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

  /* `puesto: 'mando'` es lo único que se le dice distinto al lienzo respecto
     de «Tomar pedidos», y cambia una palabra: sobre una mesa libre, aquí el
     verbo es «Sentar» —anotar quién llegó, aunque tarden en pedir— y allá es
     «Abrir mesa» —voy a apuntarles ya—. Todo lo demás lo deciden las mismas
     reglas, que es lo que impide que las dos pantallas se contradigan. */
  const salon = useMemo(
    () => buildSalonTables({
      tableCount, occupancy, calls, now, floorPlan, money, moneyShort: moneyCorto, umbrales,
      seatings, puesto: 'mando', metrica,
    }),
    [tableCount, occupancy, calls, now, floorPlan, money, moneyCorto, umbrales, seatings, metrica],
  );

  /* «Te necesitan» cuenta las ALARMAS, no todo lo que tiene un reloj
     corrido. Con el criterio viejo el contador decía 6 de 8 mesas en un
     salón normal, y un número que casi siempre es «casi todas» no es un
     número: es ruido con cifras. Lo pendiente se ve en la ficha. */
  const urgentes = useMemo(() => salon.filter((t) => t.state.level === 'alarma'), [salon]);
  /* «Mesas con gente» cuenta también las SENTADAS sin pedido (migración 128).
     Antes solo contaba las que ya tenían comanda, así que el número mentía
     durante los primeros minutos de cada mesa —justo cuando el encargado
     mira la tira para saber si le queda sitio—. */
  const abiertas = useMemo(() => salon.filter((t) => t.occ || t.seat), [salon]);
  const sinCobrar = useMemo(() => abiertas.reduce((s, t) => s + debe(t), 0), [abiertas]);
  /* El denominador incluye las mesas fuera de configuración: si hay gente en
     la 25 de un salón de 20, «8 / 20» sería mentira en las dos cifras. */
  const totalMesas = useMemo(() => Math.max(tableCount, salon.length), [tableCount, salon.length]);

  /* ── El plano, con el lenguaje del módulo de servicio ─────
     `mesasDeServicio` recibe lo mismo que ya tiene esta pantalla; el
     carrito va vacío porque aquí no se apunta nada: el puesto de mando no
     toma pedidos. */
  const mesasServicio = useMemo(() => mesasDeServicio({
    tableCount, occupancy, calls, seatings,
    sinEnviar: {}, totalSinEnviar: {},
    floorPlan, now,
  }), [tableCount, occupancy, calls, seatings, floorPlan, now]);

  const conPlano = hayPlano(floorPlan);
  const nivelesPlano = useMemo(() => nivelesConMesas(floorPlan), [floorPlan]);
  const [nivel, setNivel] = useState<string | null>(null);
  const nivelActivo = nivel ?? nivelesPlano[0]?.id ?? '';

  /* ── El filtro de la tira (M-19) ──────────────────────────
     Tocar «Te necesitan · 5» deja en pantalla esas cinco mesas. Antes la
     tira contaba y el encargado tenía que volver a buscarlas con los ojos
     entre las veinte. Volver a tocar la misma celda lo apaga. */
  const [filtro, setFiltro] = useState<'todas' | 'urgentes' | 'abiertas' | 'sin-cobrar'>('todas');
  const alFiltrar = useCallback((f: 'urgentes' | 'abiertas' | 'sin-cobrar') => {
    setFiltro((prev) => (prev === f ? 'todas' : f));
  }, []);

  const salonVisible = useMemo(() => {
    if (filtro === 'urgentes') return salon.filter((t) => t.state.level === 'alarma');
    if (filtro === 'abiertas') return salon.filter((t) => t.occ || t.seat);
    /* «Sin cobrar» es dinero, no ocupación: una mesa sentada sin pedir no
       debe nada, así que no entra aunque tenga gente. */
    if (filtro === 'sin-cobrar') return salon.filter((t) => debe(t) > 0.004);
    return salon;
  }, [salon, filtro]);

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
    /* Sin pedidos no hay cuenta que traer: una mesa libre, y desde la
       migración 128 también una recién sentada. Pedirla igual sería un
       viaje al servidor para que devolviera una lista vacía. */
    if (!mesa || !mesa.occ) { setBill(null); setBillError(null); return; }
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

  /* ── El puesto de mando: sentar y repartir ────────────────
     Estas cuatro no tocan pedidos, y por eso viven aquí y no en el panel
     de mesero: son el reparto del salón. El acuse es corto porque nada de
     esto se pierde —queda escrito en la mesa, a la vista— y porque las
     cuatro se deshacen haciendo lo contrario. */
  const conMesa = useCallback((n: number, fn: () => Promise<{ error?: string }>, hecho: string) => {
    setPendiente(n);
    startAction(async () => {
      const res = await fn();
      setPendiente(null);
      setAviso({ text: res.error ?? hecho });
      router.refresh();
    });
  }, [router]);

  const sentar = useCallback((n: number, pax: number | null, waiterId: string | null) => {
    const quien = waiters.find((w) => w.id === waiterId)?.name;
    conMesa(
      n,
      () => seatTable(restaurantId, n, { partySize: pax, waiterId }),
      `Mesa ${n}: sentada${pax ? ` · ${pax} ${pax === 1 ? 'persona' : 'personas'}` : ''}${quien ? ` · atiende ${quien}` : ''}.`,
    );
  }, [restaurantId, waiters, conMesa]);

  const asignar = useCallback((n: number, waiterId: string | null) => {
    const quien = waiters.find((w) => w.id === waiterId)?.name;
    conMesa(
      n,
      () => updateSeating(restaurantId, n, { waiterId }),
      quien ? `Mesa ${n}: la atiende ${quien}.` : `Mesa ${n}: sin mesero asignado.`,
    );
  }, [restaurantId, waiters, conMesa]);

  const cambiarPersonas = useCallback((n: number, pax: number | null) => {
    conMesa(
      n,
      () => updateSeating(restaurantId, n, { partySize: pax }),
      pax ? `Mesa ${n}: ${pax} ${pax === 1 ? 'persona' : 'personas'}.` : `Mesa ${n}: sin contar personas.`,
    );
  }, [restaurantId, conMesa]);

  const soltar = useCallback((n: number) => {
    conMesa(n, () => unseatTable(restaurantId, n), `Mesa ${n}: libre otra vez.`);
    setSel(null);
  }, [restaurantId, conMesa]);

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
      /* «Sentar» abre la mesa AQUÍ. No viaja al panel de mesero y no lo
         necesita: anotar quién llegó es trabajo de esta pantalla, y tiene
         que funcionar en un plan que no incluya tomar pedidos. Se abre el
         panel en vez de sentar de un toque porque cuántos son y a quién le
         toca se preguntan una sola vez, al sentar; después ya nadie
         vuelve a apuntarlo. */
      case 'sentar':
        setSel(t.n);
        return;
      case 'tomar':
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
    (t: SalonTable) => !waiterHref && (
      t.action.kind === 'cobrar' || t.action.kind === 'agregar'
      || t.action.kind === 'abrir' || t.action.kind === 'tomar'
    ),
    [waiterHref],
  );

  if (tableCount <= 0) {
    return (
      <div style={{ fontSize: 14, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
        Todavía no hay mesas configuradas. Ponles número en Ajustes › Salón y el salón aparece aquí.
      </div>
    );
  }

  /* «Sentados hace…» cuenta desde lo PRIMERO que pasó en la mesa: sentarse,
     si alguien la sentó, y si no el primer pedido. Al revés diría que una
     mesa que lleva media hora esperando la carta lleva cinco minutos.
     El orden no se da por hecho: asignarle mesero a una mesa que ya tenía
     pedidos abre un turno posterior a ellos. */
  const sentadosDe = (t: SalonTable) => {
    const a = t.seat?.seatedAt;
    const b = t.occ?.since;
    const desde = a && b ? (a < b ? a : b) : a ?? b;
    if (!desde || now == null) return null;
    return fmtMin((now - new Date(desde).getTime()) / 60000);
  };

  const panel = elegida ? (
    /* `key` con el número: el borrador de «cuántos son» y «a quién le toca»
       vive dentro del panel, y al saltar de una mesa a otra tiene que
       empezar en blanco. Sin esto, sentar la 5 heredaría lo tecleado en la 4. */
    <BillPanel
      key={elegida.n}
      t={elegida}
      data={bill}
      loading={billLoading}
      error={billError}
      money={money}
      sentados={sentadosDe(elegida)}
      canWaiter={!!waiterHref}
      waiters={waiters}
      busy={pendiente === elegida.n}
      onClose={() => setSel(null)}
      onCobrar={() => irAlMesero(elegida.n, 'cobrar')}
      onDividir={() => irAlMesero(elegida.n, 'dividir')}
      onAgregar={() => irAlMesero(elegida.n, 'agregar')}
      onSentar={(pax, waiterId) => sentar(elegida.n, pax, waiterId)}
      onAsignar={(waiterId) => asignar(elegida.n, waiterId)}
      onPersonas={(pax) => cambiarPersonas(elegida.n, pax)}
      onSoltar={() => soltar(elegida.n)}
    />
  ) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── La barra de arriba. Idéntica en las tres vistas: lo único
             que cambia al tocar el interruptor es el lienzo de abajo. ── */}
      <div className="salon-top">
        <div className="salon-summary">
          <Celda
            label="Mesas con gente"
            value={`${abiertas.length} / ${totalMesas}`}
            activo={filtro === 'abiertas'}
            onClick={abiertas.length > 0 ? () => alFiltrar('abiertas') : undefined}
          />
          <Celda
            label="Te necesitan"
            value={String(urgentes.length)}
            accent={urgentes.length > 0}
            activo={filtro === 'urgentes'}
            onClick={urgentes.length > 0 ? () => alFiltrar('urgentes') : undefined}
          />
          <Celda
            label="Sin cobrar"
            value={money(sinCobrar)}
            activo={filtro === 'sin-cobrar'}
            onClick={sinCobrar > 0 ? () => alFiltrar('sin-cobrar') : undefined}
          />
          {/* «Rotación hoy · 12» en un salón de 20 no dice si es bueno ni si
              son 12 mesas o 12 vueltas. Es el número de CIERRES de mesa de
              hoy, así que eso es lo que dice ahora, con la vuelta por mesa
              debajo para darle escala (M-20). Y no filtra nada: lo cerrado
              ya no está en el salón. */}
          <Celda
            label="Mesas cerradas hoy"
            value={String(turnsToday)}
            hint={tableCount > 0 && turnsToday > 0
              ? `${(turnsToday / tableCount).toFixed(1)} vueltas por mesa`
              : null}
          />
        </div>

        <SalonViewSwitch view={view} onChange={elegirVista} />

        {/* Cuál de los cuatro datos va grande en la ficha (M-21). Solo en
            Fichas y Lista: en el plano los pines ya enseñan lo suyo, y no
            hay sitio para otro renglón. */}
        {view !== 'plano' && (
          <div className="salon-seg" role="group" aria-label="Qué dato enseña cada mesa">
            {(['tiempo', 'total', 'pax', 'etapa'] as SalonMetrica[]).map((m) => (
              <button
                key={m}
                type="button"
                data-on={metrica === m ? '1' : '0'}
                aria-pressed={metrica === m}
                onClick={() => elegirMetrica(m)}
              >
                {METRICA_LABEL[m]}
              </button>
            ))}
          </div>
        )}

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
          {/* Con una mesa abierta al lado, este botón lleva A ESA MESA, no a
              un pedido nuevo — es la conducta correcta y la que nadie
              anunciaba (M-17). Nombrar el destino cuesta dos palabras. */}
          {sel != null ? `Tomar pedido · Mesa ${sel}` : 'Tomar pedido'}
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

      {/* EL PLANO ES EL MISMO QUE EL DE TOMAR PEDIDOS (rediseño 2026-09-17).
          ------------------------------------------------------------
          Dos pantallas dibujando dos planos del mismo local es cómo se
          llega a que uno diga «Comiendo» donde el otro dice «Falta
          servir». Las FICHAS y la LISTA sí siguen siendo las de mando
          —una mesa, una acción, con la métrica que el encargado elige—,
          porque ahí el trabajo es otro: repartir el salón, no cobrarlo. */}
      {view === 'plano' && conPlano && floorPlan ? (
        <div className="salon-floor">
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {nivelesPlano.length > 1 && (
              <div className="sv-hs">
                {nivelesPlano.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className="sv-pill"
                    data-on={nivelActivo === l.id ? '1' : '0'}
                    onClick={() => setNivel(l.id)}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            )}
            <SalonPlano
              mesas={mesasServicio}
              sel={sel}
              onPick={setSel}
              money={moneyCorto}
              floorPlan={floorPlan}
              nivel={nivelActivo}
            />
          </div>
          {!comoHoja ? panel : null}
        </div>
      ) : (
        <SalonCanvas
          view={view}
          tables={salonVisible}
          floorPlan={floorPlan}
          selected={sel}
          onOpen={setSel}
          onAction={hacer}
          actionDisabled={accionDeshabilitada}
          busyTable={pendiente}
          aside={!comoHoja ? panel : null}
        />
      )}

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

      {/* Filtrar esconde mesas, y esconder sin decirlo es la forma más
          rápida de que alguien crea que el salón se vació. La salida está
          en el mismo renglón. */}
      {filtro !== 'todas' && (
        <div
          role="status"
          style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            padding: '9px 13px', borderRadius: 11, fontSize: 13,
            border: '1px solid color-mix(in srgb, var(--brand-accent) 30%, transparent)',
            background: 'color-mix(in srgb, var(--brand-accent) 7%, transparent)',
          }}
        >
          <span style={{ flex: 1, minWidth: 180, color: 'var(--u-text-2)' }}>
            Viendo {salonVisible.length}{' '}
            {salonVisible.length === 1 ? 'mesa' : 'mesas'} de {salon.length}:{' '}
            {filtro === 'urgentes' ? 'las que te necesitan ya'
              : filtro === 'abiertas' ? 'las que tienen gente'
                : 'las que deben algo'}.
          </span>
          <button
            type="button"
            onClick={() => setFiltro('todas')}
            className="press"
            style={{
              flexShrink: 0, height: 32, padding: '0 13px', borderRadius: 9, cursor: 'pointer',
              border: '1px solid var(--u-hair-2)', background: 'var(--adm-card)',
              color: 'var(--u-text)', fontSize: 12.5, fontWeight: 600,
            }}
          >
            Ver todas
          </button>
        </div>
      )}

      {view !== 'plano' && filtro === 'todas' && (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--u-text-4)', lineHeight: 1.5, padding: '0 2px' }}>
          Las mesas se ordenan por urgencia, no por número. Una mesa libre no dice nada: solo se pinta la que
          necesita a alguien ahora.
        </p>
      )}
    </div>
  );
}

/* ── Piezas de la barra superior ──────────────────────────────── */

/**
 * Una celda de la tira de resumen.
 *
 * Con `onClick` es un BOTÓN que filtra el salón a lo que acaba de contar
 * (M-19). Antes las cuatro eran `<div>` pelados: «Te necesitan · 5» es el
 * número más importante de la pantalla y era texto muerto, así que quien
 * lo leía tenía que volver a buscar con los ojos las cinco mesas que la
 * tira acababa de contar. Las que no filtran nada —«Mesas cerradas hoy»,
 * que no es un subconjunto del salón— siguen siendo texto.
 */
function Celda({ label, value, hint, accent, activo, onClick }: {
  label: string;
  value: string;
  hint?: string | null;
  accent?: boolean;
  activo?: boolean;
  onClick?: () => void;
}) {
  const cuerpo = (
    <>
      <div className="salon-summary-label">{label}</div>
      <div className="salon-summary-value" style={accent ? { color: 'var(--brand-accent-ink)' } : undefined}>
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 1, lineHeight: 1.3 }}>
          {hint}
        </div>
      )}
    </>
  );

  if (!onClick) return <div>{cuerpo}</div>;

  /* Sin estilos en línea: el relleno, la línea que separa y la marca de
     «filtrando» las pone `.salon-summary > button` en globals.css, para que
     una celda tocable y una que no lo es midan exactamente igual. */
  return (
    <button type="button" onClick={onClick} aria-pressed={!!activo} className="press">
      {cuerpo}
    </button>
  );
}
