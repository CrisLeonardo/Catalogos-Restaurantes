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

import { useMemo } from 'react';
import { Icon, type IconName } from '@/components/icons';
import DishFinder from '@/components/admin/waiter/dish-finder';
import type { CartLine } from '@/components/admin/waiter/cart';
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
  itemId?: string;
  lineId?: string;
}

/** Lo que la barra de abajo dice y ofrece en este momento. */
export interface NextStep {
  nota: string;
  accion: string;
  icon: IconName;
  /** El atajo, cuando lo tiene. */
  kbd?: string;
  kind: 'enviar' | 'agregar' | 'cobrar' | 'servir';
  /** Acción secundaria (imprimir la cuenta), si toca. */
  secundaria?: 'imprimir';
}

const ESTADO_PLATO: Partial<Record<OrderStatus, string>> = {
  NEW: 'Sin aceptar',
  PREP: 'En cocina',
  READY: 'Lista',
  TRANSIT: 'En camino',
  SERVED: 'Servido',
};

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
  /** null cuando no hay nada que enviar (apaga Ctrl+Enter). */
  onSend: (() => void) | null;
  finderFocus: boolean;

  /* El resto del ciclo. */
  /** Asiento activo: a dónde se apuntan los platos que se agreguen ahora.
      `null` = a la mesa, sin dueño. */
  asiento: number | null;
  onAsiento: (s: number | null) => void;
  onSeatCart: (lineId: string, seat: number | null) => void;
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
  onVerMenu: () => void;
  ocupado: boolean;
}

export default function TableCycle(p: Props) {
  const {
    mesa, titulo, occ, personas, state, stage, orders, ordersLoading, cart, now,
    products, categories, money, tipPercent, tipApplies,
    onPick, qtyOf, onDec, onSend, finderFocus,
    asiento, onAsiento, onSeatCart, onSeatItem, onIncCart, onDecCart, onEditCart,
    onParty, onJuntar, onMover, onNota, onCobrar, onImprimir, onServir, onVerMenu,
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
    lineId: l.lineId,
  })), [cart]);

  const lineas = useMemo(() => [...enviadas, ...pendientes], [enviadas, pendientes]);
  const porEnviar = cart.reduce((s, l) => s + l.quantity, 0);

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
    if (porEnviar > 0) {
      return {
        nota: `${porEnviar} ${porEnviar === 1 ? 'plato' : 'platos'} por enviar. Cocina todavía no los ha visto.`,
        accion: 'Enviar a cocina',
        icon: 'bell',
        kbd: 'Ctrl+Enter',
        kind: 'enviar',
      };
    }
    if (!occ) {
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
    const h = now != null ? hora(occ.firedAt ?? occ.since) : null;
    return {
      nota: h ? `En cocina desde las ${h}.` : 'La comanda está en cocina.',
      accion: 'Agregar platillos',
      icon: 'plus',
      kind: 'agregar',
    };
  }, [porEnviar, occ, state, now, mesa, money, total]);

  function accionPrincipal() {
    if (paso.kind === 'enviar') { onSend?.(); return; }
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
        <div style={{ flex: 1, minWidth: 160 }}>
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

        {mesa != null && (
          <>
            <PersonasCtl personas={personas} onParty={onParty} />
            <AccionCorta icon="list" label="Juntar mesas" onClick={onJuntar} disabled={!occ || ocupado} />
            <AccionCorta icon="arrowRight" label="Mover a otra" onClick={onMover} disabled={!occ || ocupado} />
          </>
        )}
        <AccionCorta icon="edit" label="Nota de mesa" onClick={onNota} />
      </div>

      {/* ── En qué va la comida ────────────────────────────────
             Solo tiene sentido en una mesa: un pedido para llevar no se
             sienta, no se sirve y no pide la cuenta. */}
      {mesa != null && (
      <div className="ciclo-line">
        {tramos.map((t, i) => {
          const ahora = i === stage.index;
          return (
            <div key={t.titulo}>
              <span
                className="t-mono"
                style={{
                  display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 99, flexShrink: 0,
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
      {mesa != null && (
      <div className="ciclo-bars" aria-hidden>
        {STAGES.map((s, i) => (
          <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <span
              style={{
                width: '100%', height: 4, borderRadius: 99,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '0 4px' }}>
            <div className="adm-label adm-label-caps" style={{ flex: 1, minWidth: 140, color: 'var(--u-text-3)' }}>
              {mesa != null ? 'La cuenta de la mesa' : 'El pedido'}
            </div>
            {/* A qué asiento van los platos que se agreguen ahora. Se elige
                UNA vez y lo demás se apunta solo: preguntarlo plato por
                plato es lo que hace que nadie lo use. */}
            {mesa != null && (
              <div className="ciclo-seats" role="group" aria-label="Asiento al que se apuntan los platos nuevos">
                <span style={{ fontSize: 12.5, color: 'var(--u-text-3)' }}>Asiento</span>
                {[null, ...Array.from({ length: Math.max(2, Math.min(personas ?? 4, 12)) }, (_, i) => i + 1)].map((n) => (
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

          <div
            style={{
              borderRadius: 13, border: '1px solid var(--u-hair)', overflow: 'hidden',
              background: 'var(--adm-card)', boxShadow: 'var(--adm-shadow-xs)',
            }}
          >
            {ordersLoading && lineas.length === 0 ? (
              <p style={{ margin: 0, padding: '22px 15px', fontSize: 13.5, color: 'var(--u-text-3)' }}>
                Cargando la cuenta…
              </p>
            ) : lineas.length === 0 ? (
              <p style={{ margin: 0, padding: '22px 15px', fontSize: 13.5, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
                Todavía no hay nada apuntado. Escribe abajo el primer plato —también vale «2 café».
              </p>
            ) : lineas.map((l) => (
              <div key={l.key} className="ciclo-item">
                {/* La cantidad primero, como se lee una comanda; el asiento
                    va al otro extremo, junto al precio, que es donde importa
                    al repartir la cuenta. */}
                <span className="ciclo-chip ciclo-qty" aria-hidden>{l.qty}</span>
                <span className="ciclo-name" style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14.5, fontWeight: 500, color: 'var(--u-text)' }}>{l.name}</span>
                  <span style={{ display: 'block', fontSize: 12.5, marginTop: 1, color: l.note || l.detail ? 'var(--brand-accent-ink)' : 'var(--u-text-4)' }}>
                    {[l.detail, l.note].filter(Boolean).join(' · ') || 'Sin notas'}
                  </span>
                </span>
                {/* Estado, asiento y pasos van juntos: en el teléfono bajan a
                    su propio renglón (`display: contents` los deja planos en
                    escritorio, donde sí caben en la misma línea). */}
                <span className="ciclo-meta">
                <span
                  style={{
                    fontSize: 12.5, fontWeight: 600, flexShrink: 0,
                    color: l.status === null ? 'var(--brand-accent-ink)'
                      : l.status === 'SERVED' ? 'var(--u-text-4)'
                      : 'var(--brand-accent-ink)',
                  }}
                >
                  {l.status === null ? 'Por enviar' : ESTADO_PLATO[l.status] ?? ''}
                </span>
                <SeatChip
                  seat={l.seat}
                  personas={personas}
                  disabled={mesa == null}
                  onChange={(s) => {
                    if (l.lineId) onSeatCart(l.lineId, s);
                    else if (l.itemId) onSeatItem(l.itemId, s);
                  }}
                />
                {l.lineId ? (
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
                ) : null}
                </span>
                <span className="t-mono ciclo-price" style={{ width: 74, textAlign: 'right', flexShrink: 0, fontSize: 14, fontWeight: 600, color: 'var(--u-text)' }}>
                  {money(l.price)}
                </span>
              </div>
            ))}
          </div>

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
          />

          <button
            type="button"
            onClick={onVerMenu}
            className="press"
            style={{
              alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 7,
              height: 38, padding: '0 13px', borderRadius: 10, cursor: 'pointer',
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
                height: 40, borderRadius: 11, cursor: occ ? 'pointer' : 'default',
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
        {paso.secundaria === 'imprimir' && (
          <button
            type="button"
            onClick={onImprimir}
            disabled={ocupado}
            className="press"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              height: 46, padding: '0 16px', borderRadius: 12, cursor: 'pointer',
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
            height: 46, padding: '0 22px', borderRadius: 12, border: 'none',
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
  const max = Math.max(2, Math.min(personas ?? 4, 12));
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
      {seat ?? 'Mesa'}
    </button>
  );
}

/* ── Cuánta gente hay ──────────────────────────────────────────
   Un dato de dos segundos que la mesa lleva encima toda la noche: es
   la base del reparto por asiento y de la ocupación real del salón. */
function PersonasCtl({ personas, onParty }: { personas: number | null; onParty: (n: number | null) => void }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2, height: 40, padding: '0 4px 0 10px',
        borderRadius: 11, border: '1px solid var(--u-hair-2)', color: 'var(--u-text-2)', flexShrink: 0,
      }}
    >
      <Icon name="users" size={15} />
      <span className="t-mono" style={{ minWidth: 26, textAlign: 'center', fontSize: 14, fontWeight: 700 }}>
        {personas ?? '—'}
      </span>
      <button
        type="button"
        onClick={() => onParty(Math.max(1, (personas ?? 1) - 1))}
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

function AccionCorta({ icon, label, onClick, disabled }: {
  icon: IconName; label: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="press"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 14px', flexShrink: 0,
        borderRadius: 11, border: '1px solid var(--u-hair-2)', background: 'none',
        color: 'var(--u-text-2)', fontSize: 13.5, fontWeight: 500,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon name={icon} size={15} />
      {label}
    </button>
  );
}

const tarjeta: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 9, padding: 14,
  borderRadius: 13, border: '1px solid var(--u-hair)',
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
