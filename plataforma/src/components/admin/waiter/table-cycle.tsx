'use client';

/* ============================================================
   UNA MESA, TODO SU CICLO
   ------------------------------------------------------------
   El buscador de platillos funciona y no se toca. Lo que faltaba era
   todo lo de alrededor: no había tiempos de cocina, no había asiento
   por plato, y para juntar dos mesas o cobrar había que salirse de la
   pantalla y volver.

   Esta pantalla acompaña la mesa de principio a fin —pedir, enviar,
   agregar la segunda ronda, mover, juntar y cobrar— y tiene una sola
   barra abajo que SIEMPRE dice el siguiente paso. Esa barra es la
   pieza clave: mientras hay platos nuevos dice «Enviar a cocina»;
   cuando ya comieron dice «Cobrar Q412.50». Así nadie tiene que
   aprenderse dónde vive cada botón.

   Cuatro tramos arriba cuentan en qué va la comida (pedido → cocina →
   servida → cobrar) con la hora de cada paso. Es la misma etapa que
   pinta la ficha del salón (`lib/table-state.ts`): la mesa cuenta lo
   mismo se mire desde donde se mire.
   ============================================================ */

import { useMemo, useState } from 'react';
import { Icon, type IconName } from '@/components/icons';
import DishFinder from '@/components/admin/waiter/dish-finder';
import { TIEMPOS, type CartLine } from '@/components/admin/waiter/cart';
import BillLine, { estadoDePlato } from '@/components/admin/salon/bill-line';
import { fmtMin, STAGES, type TableState, type TableStage } from '@/lib/table-state';
import { buildBillLines, billBreakdown } from '@/lib/bill-split';
import type { OrderWithItems, TableOccupancy } from '@/lib/db/orders';
import type { Category, OrderStatus, Product } from '@/types';

/** Una línea de la cuenta, venga de cocina o del carrito sin enviar. */
interface CycleLine {
  key: string;
  qty: number;
  name: string;
  /** Opciones elegidas, en texto. */
  detail: string | null;
  note: string | null;
  price: number;
  seat: number | null;
  /** null = todavía sin enviar a cocina. */
  status: OrderStatus | null;
  /** Tiempo de la comida (M-06). Solo lo llevan las líneas del carrito:
      lo ya enviado se lee del papel, no de aquí. */
  course?: number;
  itemId?: string;
  lineId?: string;
  /** Solo en las líneas YA enviadas: a qué pedido pertenecen. Es lo que
      permite corregirlas sin salir de esta pantalla (M-08). */
  orderId?: string;
}

/** Lo que la barra de abajo dice y ofrece en este momento. */
export interface NextStep {
  nota: string;
  accion: string;
  icon: IconName;
  /** El atajo, cuando lo tiene. */
  kbd?: string;
  /* `enviar` manda el CARRITO (platos que todavía no son un pedido);
     `mandar` manda una comanda que YA existe y que nadie pasó a cocina —
     un pedido que el comensal hizo desde el QR y que sigue en NEW. Son dos
     momentos distintos y nunca coinciden en pantalla: el carrito manda. */
  kind: 'enviar' | 'mandar' | 'agregar' | 'cobrar' | 'servir';
  /** Acción secundaria, si toca: imprimir la cuenta, o mandar de una vez
      todo lo apuntado cuando la barra está ofreciendo marchar un tiempo. */
  secundaria?: 'imprimir' | 'enviar-todo';
  /** Con `kind: 'enviar'`, qué tiempo se manda. `null` = todo (M-06). */
  tiempo?: number | null;
}

/**
 * Cuántos asientos se pueden repartir como mucho.
 *
 * Estaba en 12 y escrito a mano en dos sitios, así que una mesa larga de
 * catorce —cumpleaños, empresa: la que más factura de la noche— no se
 * podía repartir por asiento (M-13). El número real lo pone la mesa; esto
 * es solo el techo para que un `party_size` tecleado mal (la base admite
 * 100) no llene el teléfono del mesero de píldoras.
 */
const MAX_ASIENTOS = 40;

/** "20:12" en la hora del aparato. Solo se llama con el reloj ya montado. */
function hora(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function desde(iso: string | null | undefined, now: number | null): string | null {
  if (!iso || now == null) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return fmtMin((now - t) / 60000);
}

interface Props {
  /** null = pedido para llevar (sin mesa). */
  mesa: number | null;
  titulo: string;
  occ: TableOccupancy | undefined;
  /** Comensales sentados. Puede venir de la mesa ya abierta o de lo que
      el mesero acaba de anotar en una mesa que todavía no tiene pedido. */
  personas: number | null;
  state: TableState;
  stage: TableStage;
  /** Los pedidos YA enviados de esta mesa. [] mientras cargan o si es para llevar. */
  orders: OrderWithItems[];
  ordersLoading: boolean;
  cart: CartLine[];
  now: number | null;

  products: Product[];
  categories: Category[];
  money: (n: number) => string;
  tipPercent: number;
  tipApplies: boolean;

  /* El buscador de siempre — su comportamiento no cambia. */
  onPick: (p: Product, qty: number) => void;
  qtyOf: (productId: string) => number;
  onDec: (productId: string) => void;
  /** null cuando no hay nada que enviar (apaga Ctrl+Enter). Con un tiempo
      manda SOLO ese (marchar, M-06); sin él, todo lo apuntado. */
  onSend: ((soloTiempo?: number | null) => void) | null;
  finderFocus: boolean;

  /* El resto del ciclo. */
  /** Asiento activo: a dónde se apuntan los platos que se agreguen ahora.
      `null` = a la mesa, sin dueño. */
  asiento: number | null;
  onAsiento: (s: number | null) => void;
  onSeatCart: (lineId: string, seat: number | null) => void;
  /** Tiempo al que van los platos que se agreguen ahora. `null` = ninguno:
      salen con lo que haya (M-06). */
  tiempo: number | null;
  onTiempo: (t: number | null) => void;
  onCourseCart: (lineId: string, course: number | undefined) => void;
  onSeatItem: (itemId: string, seat: number | null) => void;
  onIncCart: (lineId: string) => void;
  onDecCart: (lineId: string) => void;
  onEditCart: (line: CartLine) => void;
  onParty: (n: number | null) => void;
  onJuntar: () => void;
  onMover: () => void;
  onNota: () => void;
  onCobrar: () => void;
  onImprimir: () => void;
  onServir: () => void;
  /** Pasa a cocina la comanda que el comensal dejó pedida desde el QR y que
      sigue sin enviar (NEW → PREP: es lo que imprime el papel). */
  onMandarACocina: () => void;
  /** Abre la anulación de un plato YA enviado (motivo + aprobación de
      encargado si hace falta). Es el mismo camino que la pantalla de
      cobro: aquí solo se le da una puerta desde la mesa (M-08). */
  onCorregir: (t: {
    orderId: string;
    orderStatus: OrderStatus;
    item: { id: string; name: string; remainingQty: number };
  }) => void;
  /** Cobrar algo que no está en la carta (M-09). Recibe lo que el mesero
      hubiera escrito en el buscador, o cadena vacía si se abrió desde el
      menú de acciones. */
  onArticuloLibre: (nombre: string) => void;
  onVerMenu: () => void;
  ocupado: boolean;
}

export default function TableCycle(p: Props) {
  const {
    mesa, titulo, occ, personas, state, stage, orders, ordersLoading, cart, now,
    products, categories, money, tipPercent, tipApplies,
    onPick, qtyOf, onDec, onSend, finderFocus,
    asiento, onAsiento, onSeatCart, onSeatItem, onIncCart, onDecCart, onEditCart,
    tiempo, onTiempo, onCourseCart,
    onParty, onJuntar, onMover, onNota, onCobrar, onImprimir, onServir, onMandarACocina,
    onCorregir, onArticuloLibre, onVerMenu,
    ocupado,
  } = p;

  /* ── La cuenta: lo enviado y lo que todavía está apuntándose ── */
  const enviadas: CycleLine[] = useMemo(() => buildBillLines(orders)
    .filter((l) => l.quantity > 0)
    .map((l) => ({
      key: `s-${l.itemId}`,
      qty: l.quantity,
      name: l.name,
      detail: l.options,
      note: l.note,
      price: l.lineTotal,
      seat: l.seat,
      status: l.orderStatus,
      itemId: l.itemId,
      orderId: l.orderId,
    })), [orders]);

  const pendientes: CycleLine[] = useMemo(() => cart.map((l) => ({
    key: `c-${l.lineId}`,
    qty: l.quantity,
    name: l.name,
    /* Solo las opciones: `lineDetail` mete además la nota, y aquí la nota
       ya se pinta por su cuenta — juntarlas dejaba «término medio ·
       término medio» en la comanda. */
    detail: l.options.map((o) => o.variantName ?? o.choiceName).join(' · ') || null,
    note: l.note ?? null,
    price: l.price * l.quantity,
    seat: l.seat ?? null,
    status: null,
    course: l.course,
    lineId: l.lineId,
  })), [cart]);

  const lineas = useMemo(() => [...enviadas, ...pendientes], [enviadas, pendientes]);
  const porEnviar = cart.reduce((s, l) => s + l.quantity, 0);

  /* ¿Hay ciclo que contar? En una mesa sin abrir los cuatro tramos son
     cuatro barras grises que no dicen nada, y en el teléfono empujaban el
     buscador otro renglón hacia abajo. La mesa libre se calla, aquí
     también. */
  const hayCiclo = !!occ || porEnviar > 0;

  /* ¿Hay a quién repartirle los platos? (M-12)
     ------------------------------------------------------------
     Esto exigía que YA hubiera líneas en la cuenta, así que el primer
     plato de cada persona caía siempre en «Mesa» y había que corregirlo
     después, uno por uno — que es exactamente lo que hacía que nadie
     usara el reparto por asiento. El trabajo se pagaba al final, en vez
     de al apuntar, que es cuando el mesero sabe de quién es el pepián.

     Ahora basta con que la mesa esté ocupada: o tiene platos, o alguien
     la sentó y contó cuánta gente hay (migración 128). Sigue callándose
     en una mesa vacía sin sentar —ahí no hay nadie a quien repartirle
     nada— y en una de una sola persona, que era la razón buena de la
     condición vieja: en el teléfono son dos renglones de píldoras de
     44 px por delante del buscador. */
  const puedeRepartir = mesa != null
    && (lineas.length > 0 || personas != null)
    && (personas ?? 2) > 1;

  /* ── Totales ────────────────────────────────────────────────
     Lo enviado ya trae su propina dentro del total del pedido; lo del
     carrito todavía no existe, así que se estima con el mismo
     porcentaje. Sumarlos es lo que hace que el número de la barra de
     abajo sea el que se va a cobrar de verdad. */
  const cuenta = useMemo(() => billBreakdown(orders), [orders]);
  const subtotalCarrito = cart.reduce((s, l) => s + l.price * l.quantity, 0);
  const propinaCarrito = tipApplies && subtotalCarrito > 0
    ? Math.round(subtotalCarrito * tipPercent) / 100
    : 0;
  const consumo = cuenta.items + subtotalCarrito;
  const propina = cuenta.tip + propinaCarrito;
  const total = cuenta.grandTotal + subtotalCarrito + propinaCarrito;

  /* ── Cómo se reparte ────────────────────────────────────────
     Una fila por asiento con lo suyo. Lo que nadie reclamó se enseña
     tal cual, en vez de repartirlo en silencio: si al cobrar aparece
     un plato de nadie, alguien tiene que decidirlo antes, no después. */
  const reparto = useMemo(() => {
    const m = new Map<number | null, { seat: number | null; nombres: string[]; total: number }>();
    for (const l of lineas) {
      const prev = m.get(l.seat) ?? { seat: l.seat, nombres: [], total: 0 };
      prev.nombres.push(l.name);
      prev.total += l.price;
      m.set(l.seat, prev);
    }
    return [...m.values()].sort((a, b) => (a.seat ?? 999) - (b.seat ?? 999));
  }, [lineas]);

  /* ── El siguiente paso ──────────────────────────────────────
     Una sola barra, y lo que dice depende del momento de la mesa. Es
     lo que evita tener que aprenderse dónde vive cada botón. */
  const paso: NextStep = useMemo(() => {
    /* El destino va DENTRO del botón, no solo en el título de arriba.
       ------------------------------------------------------------------
       Mandar la comanda es lo único de esta pantalla que no se puede
       deshacer —sale el papel, la cocina empieza— y el botón decía
       «Enviar a cocina» a secas: el único sitio donde aparecía «Mesa 7»
       era el título, fuera del recorrido del pulgar. Con dos mesas
       abiertas y prisa, ese es el error más caro y más silencioso que
       puede cometer el sistema. Nombrar el destino cuesta un renglón y no
       cuesta un toque, que es lo que costaría un diálogo de confirmación.

       Para llevar no lleva sufijo: no hay mesa que confundir. */
    const aDonde = mesa != null ? ` · ${titulo}` : '';

    if (porEnviar > 0) {
      /* MARCHAR (M-06).
         ------------------------------------------------------------
         Si lo apuntado va a tiempos distintos, la barra deja de ofrecer
         «mándalo todo» y ofrece mandar el PRIMERO que falte. Eso es lo
         que hace que en una mesa de seis las entradas salgan antes que
         los fuertes; y «retener» no necesita botón propio, porque lo
         retenido es sencillamente lo que todavía no se marchó.

         Un plato sin tiempo marcado cuenta como del primero: no marcar
         nada tiene que seguir significando «esto sale ya». */
      const grupos = [...new Set(cart.map((l) => l.course ?? 1))].sort((a, b) => a - b);
      if (grupos.length > 1) {
        const primero = grupos[0];
        const cuantos = cart
          .filter((l) => (l.course ?? 1) === primero)
          .reduce((s, l) => s + l.quantity, 0);
        const nombre = TIEMPOS.find((t) => t.n === primero)?.label ?? 'primer tiempo';
        return {
          nota: `${cuantos} ${cuantos === 1 ? 'plato' : 'platos'} del ${nombre.toLowerCase()}. El resto se queda apuntado aquí.`,
          accion: `Marchar ${nombre.toLowerCase()}${aDonde}`,
          icon: 'bell',
          kbd: 'Ctrl+Enter',
          kind: 'enviar',
          tiempo: primero,
          secundaria: 'enviar-todo',
        };
      }
      return {
        nota: `${porEnviar} ${porEnviar === 1 ? 'plato' : 'platos'} por enviar. Cocina todavía no los ha visto.`,
        accion: `Enviar a cocina${aDonde}`,
        icon: 'bell',
        kbd: 'Ctrl+Enter',
        kind: 'enviar',
        tiempo: null,
      };
    }
    if (!occ) {
      /* SENTADA pero sin comanda (migración 128). Decir «la mesa está
         libre» con cuatro personas sentadas es la misma mentira que
         arreglamos en M-27, en el caso nuevo: el estado ya sabe que está
         ocupada —lo dice la ficha del salón— y solo esta barra seguía
         contando otra cosa. Y el minuto importa: es el rato que llevan
         esperando a que alguien les tome la orden. */
      const sentadaMin = mesa != null && state.kind !== 'libre' ? desde(state.since, now) : null;
      if (sentadaMin != null) {
        return {
          nota: state.reason === 'sin-pedir'
            ? `Llevan ${sentadaMin} sentados y nadie les ha tomado el pedido.`
            : `Sentados hace ${sentadaMin}. Todavía no han pedido nada.`,
          accion: `Tomar el pedido${aDonde}`,
          icon: 'plus',
          kind: 'agregar',
        };
      }
      return {
        nota: mesa
          ? 'La mesa está libre. Apunta el primer plato y queda abierta.'
          : 'Apunta lo que se lleva y mándalo a cocina.',
        accion: 'Agregar platillos',
        icon: 'plus',
        kind: 'agregar',
      };
    }
    if (state.reason === 'cuenta') {
      const m = desde(state.since, now);
      return {
        nota: m ? `Pidieron la cuenta hace ${m}. Lo siguiente es cobrar.` : 'Pidieron la cuenta. Lo siguiente es cobrar.',
        accion: `Cobrar ${money(total)}`,
        icon: 'creditCard',
        kind: 'cobrar',
        secundaria: 'imprimir',
      };
    }
    if (occ.status === 'READY') {
      const m = desde(occ.readySince, now);
      return {
        nota: m ? `La comida lleva ${m} lista en la barra.` : 'Hay comida lista en la barra.',
        accion: 'Llevar a la mesa',
        icon: 'checkCircle',
        kind: 'servir',
      };
    }
    if (occ.status === 'SERVED') {
      const m = desde(occ.servedAt, now);
      return {
        nota: m ? `Servida hace ${m}. Todavía no ha pedido la cuenta.` : 'Ya comieron.',
        accion: `Cobrar ${money(total)}`,
        icon: 'creditCard',
        kind: 'cobrar',
        secundaria: 'imprimir',
      };
    }
    /* NEW no es "en cocina": es "SIN ENVIAR a cocina".
       ------------------------------------------------------------------
       Un pedido de mesero NACE en PREP con su hora (createWaiterOrder lo
       pone y encola la comanda), así que una mesa en NEW solo puede venir
       del QR: el comensal pidió desde su teléfono y NADIE lo ha pasado a
       cocina. El papel no se ha impreso —el encolado vive en el paso a
       PREP— y en el KDS sigue sin aceptar.

       Sin esta rama caía en el fondo de saco de abajo, que da por hecho
       que la comida se está haciendo: decía «En cocina desde las 11:49»
       usando `occ.firedAt ?? occ.since`, y como en NEW `firedAt` es null,
       esas eran las HORAS DE CREACIÓN del pedido presentadas como hora de
       salida a cocina. En la misma pantalla los cuatro tramos decían «En
       cocina · pendiente» y cada plato decía «Sin aceptar»: la barra que
       existe para decir el paso siguiente era la única de las tres que
       mentía, y encima ofrecía «Agregar platillos» sobre una comanda
       parada.

       El paso correcto ya lo nombra el sistema en todas partes
       (`nextLabel(NEW, …)` = «Enviar a cocina») y es el que imprime. */
    if (occ.status === 'NEW') {
      const m = desde(occ.since, now);
      return {
        nota: state.reason === 'sin-aceptar' && m
          ? `Cocina todavía no tiene esta comanda: lleva ${m} sin salir.`
          : 'Este pedido llegó del menú y todavía no ha salido a cocina.',
        accion: `Enviar a cocina${aDonde}`,
        icon: 'bell',
        kind: 'mandar',
      };
    }

    const h = now != null ? hora(occ.firedAt ?? occ.since) : null;
    return {
      nota: h ? `En cocina desde las ${h}.` : 'La comanda está en cocina.',
      accion: 'Agregar platillos',
      icon: 'plus',
      kind: 'agregar',
    };
  }, [porEnviar, cart, occ, state, now, mesa, titulo, money, total]);

  function accionPrincipal() {
    if (paso.kind === 'enviar') { onSend?.(paso.tiempo ?? null); return; }
    if (paso.kind === 'mandar') { onMandarACocina(); return; }
    if (paso.kind === 'cobrar') { onCobrar(); return; }
    if (paso.kind === 'servir') { onServir(); return; }
    onVerMenu();
  }

  /* Los cuatro tramos del ciclo, con la hora de cada paso. */
  const tramos = [
    { titulo: 'Pedido', detalle: occ ? `${occ.itemCount} ${occ.itemCount === 1 ? 'plato' : 'platos'}` : porEnviar > 0 ? `${porEnviar} por enviar` : 'sin abrir' },
    { titulo: 'En cocina', detalle: (now != null && hora(occ?.firedAt ?? null)) ? `salió ${hora(occ!.firedAt)}` : 'pendiente' },
    { titulo: 'Servida', detalle: desde(occ?.servedAt, now) ? `hace ${desde(occ?.servedAt, now)}` : 'pendiente' },
    { titulo: 'Cobrar', detalle: state.reason === 'cuenta' ? 'pidió la cuenta' : stage.index === 3 ? 'sin cobrar' : 'pendiente' },
  ];

  return (
    <div className="ciclo">
      {/* ── Quién es esta mesa ───────────────────────────────── */}
      {/* El «volver» vive en la cabecera del panel (WaiterHeader), que está
          en todas las pantallas del mesero: repetirlo aquí serían dos
          flechas atrás a diez píxeles una de otra. */}
      <div className="ciclo-head">
        <div className="ciclo-head-id">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span className="t-display" style={{ fontSize: 24, lineHeight: 1.1 }}>{titulo}</span>
            <span style={{ fontSize: 13.5, color: 'var(--u-text-3)' }}>
              {[
                personas ? `${personas} ${personas === 1 ? 'persona' : 'personas'}` : null,
                desde(occ?.since, now),
                occ?.waiterName ?? null,
              ].filter(Boolean).join(' · ') || 'Sin abrir'}
            </span>
          </div>
        </div>

        {/* El total sube aquí cuando la columna derecha se pliega (tablet y
            teléfono). Es el número que más veces se mira en un turno y
            estaba quedando al final de un scroll de menú entero. */}
        {total > 0 && (
          <span className="ciclo-head-total">
            <span style={{ fontSize: 12.5, color: 'var(--u-text-3)' }}>Total</span>
            <span className="t-mono" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--u-text)' }}>
              {money(total)}
            </span>
          </span>
        )}

        {mesa != null && <PersonasCtl personas={personas} onParty={onParty} />}
        {/* Juntar, mover y la nota son cosas que se hacen un par de veces
            por turno, y estaban tratadas como acciones principales: tres
            botones a todo lo ancho —dos de ellos GRISES en una mesa libre—
            justo encima de la comanda. En el teléfono eran dos renglones
            del sitio más caro de la pantalla. Ahora es un botón, y dentro
            solo aparece lo que de verdad se puede hacer. */}
        <MasAcciones
          puedeMover={mesa != null && !!occ && !ocupado}
          onJuntar={onJuntar}
          onMover={onMover}
          onNota={onNota}
          onArticuloLibre={() => onArticuloLibre('')}
        />
      </div>

      {/* ── En qué va la comida ────────────────────────────────
             Solo tiene sentido en una mesa: un pedido para llevar no se
             sienta, no se sirve y no pide la cuenta. */}
      {mesa != null && hayCiclo && (
      <div className="ciclo-line">
        {tramos.map((t, i) => {
          const ahora = i === stage.index;
          return (
            <div key={t.titulo}>
              <span
                className="t-mono"
                style={{
                  display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 'var(--radius-full)', flexShrink: 0,
                  fontSize: 12.5, fontWeight: 700,
                  background: ahora ? 'var(--brand-accent)' : 'color-mix(in srgb, var(--u-text) 8%, transparent)',
                  color: ahora ? 'var(--brand-on-accent, #fff)' : 'var(--u-text-2)',
                }}
              >
                {i + 1}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: ahora ? 'var(--brand-accent-ink)' : 'var(--u-text-2)' }}>
                  {t.titulo}
                </span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--u-text-4)', marginTop: 1 }}>
                  {t.detalle}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      )}

      {/* En el teléfono los cuatro tramos se comprimen a cuatro barras:
          cuatro bloques de texto en 358 px no se leen. */}
      {mesa != null && hayCiclo && (
      <div className="ciclo-bars" aria-hidden>
        {STAGES.map((s, i) => (
          <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <span
              style={{
                width: '100%', height: 4, borderRadius: 'var(--radius-full)',
                background: i === stage.index ? 'var(--brand-accent)'
                  : i < stage.index ? 'color-mix(in srgb, var(--u-text) 30%, transparent)'
                  : 'color-mix(in srgb, var(--u-text) 10%, transparent)',
              }}
            />
            <span style={{ fontSize: 11, fontWeight: 600, color: i === stage.index ? 'var(--brand-accent-ink)' : 'var(--u-text-4)' }}>
              {tramos[i].titulo}
            </span>
          </div>
        ))}
      </div>
      )}

      {/* ── La cuenta y el reparto ───────────────────────────── */}
      <div className="ciclo-body">
        <div className="ciclo-main">
          {/* El rótulo solo cuando hay cuenta que rotular: encabezar la nada
              con «La cuenta de la mesa» empuja el buscador y no dice nada.

              La FILA es otra cosa: desde M-12 puede aparecer sola, en una
              mesa sentada y todavía sin platos, porque ahí es justo donde
              hace falta —el primer plato de cada persona caía siempre en
              «Mesa»—. Por eso el bloque se abre si hay cuenta O si hay
              asientos que ofrecer, y el rótulo se pinta por su cuenta. */}
          {(lineas.length > 0 || ordersLoading || puedeRepartir || mesa != null) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '0 4px' }}>
            {(lineas.length > 0 || ordersLoading) && (
              <div className="adm-label adm-label-caps" style={{ flex: 1, minWidth: 140, color: 'var(--u-text-3)' }}>
                {mesa != null ? 'La cuenta de la mesa' : 'El pedido'}
              </div>
            )}
            {/* A qué asiento van los platos que se agreguen ahora. Se elige
                UNA vez y lo demás se apunta solo: preguntarlo plato por
                plato es lo que hace que nadie lo use.

                No aparece en una mesa vacía ni en una de una persona: ahí
                no hay nada que repartir, y en el teléfono eran dos renglones
                de píldoras de 44 px por delante del buscador. */}
            {/* Antes esto exigía `lineas.length > 0`, así que el PRIMER plato de
                cada persona caía siempre en «Mesa» y había que corregirlo
                después, uno por uno — que es exactamente lo que hacía que
                nadie usara el reparto por asiento (M-12).

                Ahora basta con que la mesa esté ocupada: o tiene platos, o
                alguien la sentó y contó cuánta gente hay (migración 128).
                Sigue sin aparecer en una mesa vacía y sin sentar, que era
                la razón buena de la condición vieja: ahí no hay nadie a
                quien repartirle nada y en el teléfono son dos renglones de
                píldoras por delante del buscador. */}
            {/* A qué TIEMPO van los platos que se agreguen ahora (M-06).
                Mismo criterio que el asiento —se elige una vez y lo demás
                se apunta solo— y en el mismo renglón, porque son las dos
                marcas que lleva un plato al apuntarlo. Solo en mesa: un
                pedido para llevar no tiene tiempos que repartir. */}
            {mesa != null && (
              <div className="ciclo-seats" role="group" aria-label="Tiempo al que se apuntan los platos nuevos">
                <span style={{ fontSize: 12.5, color: 'var(--u-text-3)' }}>Tiempo</span>
                <button
                  type="button"
                  className="press"
                  data-on={tiempo == null ? '1' : '0'}
                  onClick={() => onTiempo(null)}
                  aria-pressed={tiempo == null}
                  title="Sale con lo que haya"
                >
                  Ya
                </button>
                {TIEMPOS.map((t) => (
                  <button
                    key={t.n}
                    type="button"
                    className="press"
                    data-on={tiempo === t.n ? '1' : '0'}
                    onClick={() => onTiempo(t.n)}
                    aria-pressed={tiempo === t.n}
                    title={t.label}
                  >
                    {t.corto}
                  </button>
                ))}
              </div>
            )}
            {puedeRepartir && (
              <div className="ciclo-seats" role="group" aria-label="Asiento al que se apuntan los platos nuevos">
                <span style={{ fontSize: 12.5, color: 'var(--u-text-3)' }}>Asiento</span>
                {[null, ...Array.from({ length: Math.max(2, Math.min(personas ?? 4, MAX_ASIENTOS)) }, (_, i) => i + 1)].map((n) => (
                  <button
                    key={n ?? 'mesa'}
                    type="button"
                    className="press"
                    data-on={n === asiento ? '1' : '0'}
                    onClick={() => onAsiento(n)}
                    aria-pressed={n === asiento}
                  >
                    {n ?? 'Mesa'}
                  </button>
                ))}
              </div>
            )}
          </div>
          )}

          {/* La comanda. En una mesa vacía se calla del todo: el buscador
              de abajo ya invita a escribir, y una tarjeta diciendo «todavía
              no hay nada apuntado» solo empujaba el campo fuera de la
              primera pantalla del teléfono. */}
          {(lineas.length > 0 || ordersLoading) && (
          <div
            style={{
              borderRadius: 'var(--radius-lg)', border: '1px solid var(--u-hair)', overflow: 'hidden',
              background: 'var(--adm-card)', boxShadow: 'var(--adm-shadow-xs)',
            }}
          >
            {ordersLoading && lineas.length === 0 ? (
              <p style={{ margin: 0, padding: '22px 15px', fontSize: 13.5, color: 'var(--u-text-3)' }}>
                Cargando la cuenta…
              </p>
            ) : lineas.map((l) => (
              /* LA MISMA fila que el panel del salón (M-22). Los datos y la
                 maqueta viven en `salon/bill-line.tsx`; aquí solo entran
                 los MANDOS, que es lo único que de verdad distingue esta
                 pantalla: el mesero toca, el encargado mira. */
              <BillLine
                key={l.key}
                l={l}
                money={money}
                meta={(
                  <>
                    <span
                      style={{
                        fontSize: 12.5, fontWeight: 600, flexShrink: 0,
                        color: l.status === 'SERVED' ? 'var(--u-text-4)' : 'var(--brand-accent-ink)',
                      }}
                    >
                      {estadoDePlato(l.status ?? null)}
                    </span>
                    {/* Solo en el carrito: un plato que ya salió a cocina no
                        puede cambiar de tiempo sin mentirle al papel que el
                        cocinero tiene delante (M-06). */}
                    {l.lineId && mesa != null && (
                      <CourseChip
                        course={l.course}
                        onChange={(c) => onCourseCart(l.lineId!, c)}
                      />
                    )}
                    <SeatChip
                      seat={l.seat}
                      personas={personas}
                      disabled={mesa == null}
                      onChange={(s) => {
                        if (l.lineId) onSeatCart(l.lineId, s);
                        else if (l.itemId) onSeatItem(l.itemId, s);
                      }}
                    />
                  </>
                )}
                controles={l.lineId ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <button type="button" className="wp-step press" onClick={() => onDecCart(l.lineId!)} aria-label={`Quitar uno de ${l.name}`}>
                      <Icon name="minus" size={15} />
                    </button>
                    <button type="button" className="wp-step press" data-on="1" onClick={() => onIncCart(l.lineId!)} aria-label={`Agregar otro ${l.name}`}>
                      <Icon name="plus" size={15} />
                    </button>
                    <button
                      type="button"
                      className="wp-step press"
                      onClick={() => onEditCart(cart.find((c) => c.lineId === l.lineId)!)}
                      aria-label={`Editar ${l.name}`}
                    >
                      <Icon name="edit" size={14} />
                    </button>
                  </span>
                ) : l.orderId && l.itemId ? (
                  /* Corregir lo YA enviado, desde aquí (M-08). No anula:
                     ABRE la anulación, que sigue pidiendo motivo y —si ya
                     salió a cocina— aprobación de encargado. Va solo, sin
                     −/+ al lado, porque no es un vecino de «quitar uno»:
                     es otra cosa y se paga distinto. */
                  <button
                    type="button"
                    className="wp-step press"
                    onClick={() => onCorregir({
                      orderId: l.orderId!,
                      orderStatus: (l.status ?? 'NEW') as OrderStatus,
                      item: { id: l.itemId!, name: l.name, remainingQty: l.qty },
                    })}
                    aria-label={`Anular ${l.name}`}
                    title="Anular este plato"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                ) : null}
              />
            ))}
          </div>
          )}

          {/* El buscador de siempre, debajo de la comanda. No cambia nada
              de su comportamiento: «3 lim» + Enter agrega, «/» devuelve el
              foco, Ctrl+Enter envía, y un Enter suelto NUNCA manda la
              comanda. */}
          <DishFinder
            products={products}
            categories={categories}
            onPick={onPick}
            qtyOf={qtyOf}
            onDec={onDec}
            money={money}
            onSend={onSend}
            autoFocus={finderFocus}
            onOpenItem={onArticuloLibre}
          />

          <button
            type="button"
            onClick={onVerMenu}
            className="press"
            style={{
              alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 7,
              height: 38, padding: '0 13px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
              border: '1px solid var(--u-hair-2)', background: 'none',
              color: 'var(--u-text-2)', fontSize: 13.5, fontWeight: 500,
            }}
          >
            <Icon name="bag" size={15} />
            Ver el menú completo
          </button>
        </div>

        <div className="ciclo-side">
          {mesa != null && (
          <div style={tarjeta}>
            <div className="adm-label" style={{ color: 'var(--u-text-3)' }}>Cómo se reparte</div>
            {reparto.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--u-text-4)', lineHeight: 1.45 }}>
                Cuando apuntes platos aparece aquí quién pidió qué.
              </p>
            ) : reparto.map((r) => (
              <div key={String(r.seat)} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="ciclo-chip" data-seat={r.seat != null ? '1' : '0'} aria-hidden>
                  {r.seat ?? '·'}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--u-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.seat == null ? 'De la mesa' : r.nombres.slice(0, 2).join(' · ')}
                </span>
                <span className="t-mono" style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--u-text)' }}>
                  {money(r.total)}
                </span>
              </div>
            ))}
            <button
              type="button"
              onClick={onCobrar}
              disabled={!occ}
              className="press"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                height: 40, borderRadius: 'var(--radius-md)', cursor: occ ? 'pointer' : 'default',
                border: '1px solid var(--u-hair-2)', background: 'none',
                color: 'var(--u-text-2)', fontSize: 13.5, fontWeight: 500, opacity: occ ? 1 : 0.55,
              }}
            >
              <Icon name="list" size={15} />
              Cambiar el reparto
            </button>
          </div>
          )}

          <div style={tarjeta}>
            <Fila label="Consumo" value={money(consumo)} />
            {propina > 0 && <Fila label={`Propina ${tipPercent}%`} value={money(propina)} />}
            {cuenta.discount > 0 && <Fila label="Descuento" value={`−${money(cuenta.discount)}`} />}
            <div style={{ height: 1, background: 'var(--u-hair)', margin: '2px 0' }} />
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)' }}>Total</span>
              <span className="t-mono" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--u-text)' }}>
                {money(total)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── La barra del siguiente paso ──────────────────────── */}
      <div className="ciclo-next">
        <span className="ciclo-next-note">{paso.nota}</span>
        {paso.secundaria === 'enviar-todo' && (
          <button
            type="button"
            onClick={() => onSend?.(null)}
            disabled={ocupado}
            className="press"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              height: 46, padding: '0 16px', borderRadius: 'var(--radius-lg)', cursor: 'pointer',
              border: '1px solid var(--u-hair-2)', background: 'var(--adm-card)',
              color: 'var(--u-text-2)', fontSize: 14.5, fontWeight: 500,
            }}
          >
            <Icon name="bell" size={16} />
            Enviar todo
          </button>
        )}
        {paso.secundaria === 'imprimir' && (
          <button
            type="button"
            onClick={onImprimir}
            disabled={ocupado}
            className="press"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              height: 46, padding: '0 16px', borderRadius: 'var(--radius-lg)', cursor: 'pointer',
              border: '1px solid var(--u-hair-2)', background: 'var(--adm-card)',
              color: 'var(--u-text-2)', fontSize: 14.5, fontWeight: 500,
            }}
          >
            <Icon name="print" size={16} />
            Imprimir cuenta
          </button>
        )}
        <button
          type="button"
          onClick={accionPrincipal}
          disabled={ocupado}
          className="press btn-accent"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
            height: 46, padding: '0 22px', borderRadius: 'var(--radius-lg)', border: 'none',
            fontSize: 15.5, fontWeight: 600, cursor: ocupado ? 'default' : 'pointer',
            opacity: ocupado ? 0.6 : 1,
          }}
        >
          <Icon name={paso.icon} size={18} />
          {ocupado ? 'Un momento…' : paso.accion}
          {paso.kbd && <kbd className="wp-key" style={{ marginLeft: 2 }}>{paso.kbd}</kbd>}
        </button>
      </div>
    </div>
  );
}

/* ── La marca de asiento de la fila ────────────────────────────
   La píldora que el lienzo pone entre el nombre y el precio. Tocarla
   corrige el asiento del plato sin salir del renglón: Mesa → 1 → 2 →
   … → Mesa. Un desplegable por plato, en una tablet y con el salón
   lleno, no lo usa nadie; un toque que avanza sí. Cuando no se sabe
   cuánta gente hay se ofrecen cuatro, que es lo que cabe en una mesa
   normal. */
function SeatChip({ seat, personas, disabled, onChange }: {
  seat: number | null;
  personas: number | null;
  disabled?: boolean;
  onChange: (s: number | null) => void;
}) {
  const max = Math.max(2, Math.min(personas ?? 4, MAX_ASIENTOS));
  if (disabled) return null;
  return (
    <button
      type="button"
      className="ciclo-seat press"
      data-on={seat != null ? '1' : '0'}
      onClick={() => onChange(seat == null ? 1 : seat >= max ? null : seat + 1)}
      aria-label={seat == null ? 'Sin asiento: es de la mesa. Tocar para asignarlo al asiento 1' : `Asiento ${seat}. Tocar para cambiarlo`}
      title="Asiento"
    >
      {/* Con la palabra delante. El chip de cantidad del otro extremo del
          renglón también es un número desnudo, y «Servido 3» se leía como
          una cantidad aunque la cantidad ya dijera 2. El CSS lo intentaba
          resolver haciendo esta píldora más ancha que alta; a tamaño real
          no se distinguía. Dos caracteres arreglan lo que ningún tamaño
          iba a arreglar. */}
      {seat == null ? 'Mesa' : `As. ${seat}`}
    </button>
  );
}

/* ── La marca de tiempo de la fila ─────────────────────────────
   Un toque avanza: Ya → 1.º → 2.º → Postre → Ya. Igual que la píldora
   del asiento, y por la misma razón: un desplegable por plato, en una
   tablet y con el salón lleno, no lo usa nadie. */
function CourseChip({ course, onChange }: {
  course: number | undefined;
  onChange: (c: number | undefined) => void;
}) {
  const actual = TIEMPOS.find((t) => t.n === course);
  const siguiente = () => {
    if (course == null) return TIEMPOS[0].n;
    const i = TIEMPOS.findIndex((t) => t.n === course);
    return i < 0 || i === TIEMPOS.length - 1 ? undefined : TIEMPOS[i + 1].n;
  };
  return (
    <button
      type="button"
      className="ciclo-seat press"
      data-on={actual ? '1' : '0'}
      onClick={() => onChange(siguiente())}
      aria-label={actual
        ? `${actual.label}. Tocar para cambiarlo`
        : 'Sale con lo que haya. Tocar para marcarle un tiempo'}
      title="Tiempo de la comida"
    >
      {actual ? actual.corto : 'Ya'}
    </button>
  );
}

/* ── Cuánta gente hay ──────────────────────────────────────────
   Un dato de dos segundos que la mesa lleva encima toda la noche: es
   la base del reparto por asiento y de la ocupación real del salón. */
function PersonasCtl({ personas, onParty }: { personas: number | null; onParty: (n: number | null) => void }) {
  /* Sin nadie apuntado todavía, «−» no tiene nada que quitar. Antes
     restaba sobre un 1 imaginario, así que el botón de QUITAR acababa
     poniendo una persona: el control decía «—» y al tocar «−» decía 1. */
  const puedeQuitar = (personas ?? 0) > 1;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2, height: 40, padding: '0 4px 0 10px',
        borderRadius: 'var(--radius-md)', border: '1px solid var(--u-hair-2)', color: 'var(--u-text-2)', flexShrink: 0,
      }}
    >
      <Icon name="users" size={15} />
      <span className="t-mono" style={{ minWidth: 26, textAlign: 'center', fontSize: 14, fontWeight: 700 }}>
        {personas ?? '—'}
      </span>
      <button
        type="button"
        onClick={() => onParty((personas ?? 1) - 1)}
        disabled={!puedeQuitar}
        aria-label="Una persona menos"
        className="wp-step press"
      >
        <Icon name="minus" size={14} />
      </button>
      <button
        type="button"
        onClick={() => onParty(Math.min(100, (personas ?? 0) + 1))}
        aria-label="Una persona más"
        className="wp-step press"
        data-on="1"
      >
        <Icon name="plus" size={14} />
      </button>
    </span>
  );
}

/* ── Lo que se hace un par de veces por turno ──────────────────
   Juntar dos mesas, pasar la cuenta a otra y la nota para cocina. No
   son la acción principal de nadie —esa vive en la barra de abajo y
   siempre dice el siguiente paso—, así que aquí van detrás de un
   botón. Dentro solo aparece lo que se puede hacer ahora: en una mesa
   sin abrir no hay nada que juntar ni que mover. */
function MasAcciones({ puedeMover, onJuntar, onMover, onNota, onArticuloLibre }: {
  puedeMover: boolean;
  onJuntar: () => void;
  onMover: () => void;
  onNota: () => void;
  onArticuloLibre: () => void;
}) {
  const [abierto, setAbierto] = useState(false);

  const opciones: { icon: IconName; label: string; hint: string; onClick: () => void }[] = [
    ...(puedeMover ? [
      { icon: 'list' as IconName, label: 'Juntar con otra mesa', hint: 'Las dos cuentas pasan a ser una', onClick: onJuntar },
      { icon: 'arrowRight' as IconName, label: 'Mover a otra mesa', hint: 'Se cambiaron de sitio', onClick: onMover },
    ] : []),
    { icon: 'edit', label: 'Nota de mesa', hint: 'Sale impresa con la siguiente comanda', onClick: onNota },
    /* La puerta principal del artículo libre está en el buscador, cuando
       no encuentra nada. Esta es para quien YA sabe que no está en la
       carta y no quiere teclear para comprobarlo (M-09). */
    { icon: 'tag', label: 'Artículo libre', hint: 'Algo que no está en la carta: descorche, plato del día', onClick: onArticuloLibre },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="press"
        aria-label="Más acciones de la mesa"
        aria-haspopup="dialog"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          height: 40, minWidth: 44, padding: '0 14px', flexShrink: 0,
          borderRadius: 'var(--radius-md)', border: '1px solid var(--u-hair-2)', background: 'none',
          color: 'var(--u-text-2)', fontSize: 13.5, fontWeight: 500, cursor: 'pointer',
        }}
      >
        <Icon name="more" size={17} />
        <span className="wp-wide-only">Más</span>
      </button>

      {abierto && (
        <div
          onClick={() => setAbierto(false)}
          className="waiter-sheet-scrim"
          style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass anim-slide-up waiter-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Más acciones de la mesa"
            style={{ width: '100%', maxWidth: 420, padding: '14px 12px 20px', display: 'flex', flexDirection: 'column', gap: 4 }}
          >
            {opciones.map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => { setAbierto(false); o.onClick(); }}
                className="press"
                style={{
                  display: 'flex', alignItems: 'center', gap: 13, width: '100%', minHeight: 56,
                  padding: '10px 12px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'none',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: 'var(--radius-md)', flexShrink: 0, background: 'color-mix(in srgb, var(--u-text) 7%, transparent)', color: 'var(--u-text-2)' }}>
                  <Icon name={o.icon} size={17} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--u-text)' }}>{o.label}</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 1 }}>{o.hint}</span>
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="press glass-quiet"
              style={{ marginTop: 8, width: '100%', minHeight: 46, borderRadius: 'var(--radius-lg)', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: 'var(--u-text-2)' }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const tarjeta: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 9, padding: 14,
  borderRadius: 'var(--radius-lg)', border: '1px solid var(--u-hair)',
  background: 'var(--adm-card)', boxShadow: 'var(--adm-shadow-xs)',
};

function Fila({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', fontSize: 13.5, color: 'var(--u-text-2)' }}>
      <span>{label}</span>
      <span className="t-mono" style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

