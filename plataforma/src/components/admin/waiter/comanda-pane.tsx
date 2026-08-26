'use client';

/* El panel derecho con algo elegido — la comanda.
   ------------------------------------------------------------------
   Una mesa y un pedido para llevar usan EXACTAMENTE el mismo panel.
   Lo único que cambia es la cabecera: donde una mesa dice cómo va y
   quién la atiende, el de llevar dice quién lo recoge. Por eso "para
   llevar" dejó de ser un ciudadano de segunda: no tiene pantalla
   propia porque no la necesita.

   De arriba abajo:
     1. Lo que YA está en la mesa, con el estado de cada plato.
     2. Lo que se está apuntando y aún no ha salido a cocina.
     3. El buscador, que agrega sin navegar a ninguna parte.
   Y abajo, fija, la única acción que manda: enviar.

   Cobrar no es una pantalla nueva: es este mismo panel en otro modo,
   con la mesa todavía elegida en el riel de la izquierda. */

import { Icon } from '@/components/icons';
import DishFinder from '@/components/admin/waiter/dish-finder';
import { Group, Hr, Key, Label, Mono, Pill, Row } from '@/components/admin/waiter/pieces';
import { useServiceMode } from '@/components/admin/service-mode';
import { groupTableLines } from '@/lib/table-lines';
import { tableTimeline } from '@/lib/table-timeline';
import type { TableState } from '@/lib/table-state';
import type { Category, Product } from '@/types';
import type { OrderWithItems } from '@/lib/db/orders';

/** Una línea del pedido que aún no ha salido a cocina. */
export interface CartLineView {
  lineId: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  detalle: string;
}

interface Props {
  /* Qué se está mirando. */
  titulo: string;
  subtitulo: string;
  esMesa: boolean;
  state: TableState | null;
  /** Pedidos ya enviados de esta mesa (null mientras cargan). */
  tableOrders: OrderWithItems[] | null;
  cargando: boolean;
  error: string | null;

  /* El pedido en curso. */
  cart: CartLineView[];
  subtotal: number;
  onInc: (lineId: string) => void;
  onDec: (lineId: string) => void;
  onEdit: (lineId: string) => void;

  /* Catálogo. */
  products: Product[];
  categories: Category[];
  onPick: (product: Product, qty: number) => void;
  qtyOf: (productId: string) => number;
  onDecProduct: (productId: string) => void;

  /* Acciones. */
  onBack: () => void;
  onEnviar: () => void;
  enviando: boolean;
  onCobrar: (() => void) | null;
  onDividir: (() => void) | null;
  /** Avance de estado contextual, si toca alguno ("Marcar servida"). */
  accionEstado: { label: string; run: () => void } | null;
  onLiberar: (() => void) | null;

  /* Para llevar. */
  guestName: string;
  onGuestName: (v: string) => void;

  /** Nota general del pedido, la que va impresa en la comanda ("mesa de
      cumpleaños", "todo junto"). Distinta de la nota por plato, que vive
      en la hoja de opciones. */
  notes: string;
  onNotes: (v: string) => void;

  money: (n: number) => string;
  now: number | null;
  /** Se apaga cuando hay un diálogo encima, para no robarle el foco. */
  focoBuscador: boolean;
}

export default function ComandaPane({
  titulo, subtitulo, esMesa, state, tableOrders, cargando, error,
  cart, subtotal, onInc, onDec, onEdit,
  products, categories, onPick, qtyOf, onDecProduct,
  onBack, onEnviar, enviando, onCobrar, onDividir, accionEstado, onLiberar,
  guestName, onGuestName, notes, onNotes, money, now, focoBuscador,
}: Props) {
  const lineas = tableOrders ? groupTableLines(tableOrders) : [];
  const totalMesa = (tableOrders ?? [])
    .filter((o) => o.status !== 'CANCEL')
    .reduce((s, o) => s + Number(o.total ?? 0), 0);

  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);
  const hayCarrito = cartCount > 0;
  const eventos = tableOrders ? tableTimeline(tableOrders) : [];
  const servicio = useServiceMode();

  return (
    <div className="wp-pane">
      <div className="wp-top">
        {/* En el teléfono el panel derecho ES la pantalla, así que
            necesita su vuelta atrás. En la tablet el riel sigue a la
            vista y el botón sobra. */}
        <span className="wp-phone-only" style={{ flexShrink: 0 }}>
          <button
            type="button"
            onClick={onBack}
            className="press"
            aria-label="Volver al salón"
            style={{
              width: 38, height: 38, borderRadius: 11, cursor: 'pointer',
              border: '1px solid var(--adm-border-2)', background: 'none', color: 'var(--u-text)',
              display: 'grid', placeItems: 'center',
            }}
          >
            <Icon name="chevronLeft" size={18} />
          </button>
        </span>

        <div className="wp-top-title">
          <b>{titulo}</b>
          <span>{subtitulo}</span>
        </div>

        {onDividir && (
          <button type="button" onClick={onDividir} className="press" style={botonSecundario}>
            <Icon name="users" size={15} />
            <span className="wp-wide-only">Cuenta y dividir</span>
          </button>
        )}
        {onCobrar && (
          <button type="button" onClick={onCobrar} className="press btn-accent" style={botonPrimario}>
            <Icon name="wallet" size={15} />
            <span>Cobrar</span>
          </button>
        )}
      </div>

      <div className="wp-scroll" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {error && (
          <div style={aviso('danger')}>{error}</div>
        )}

        {/* ── Quién recoge (solo para llevar) ───────────────────── */}
        {!esMesa && (
          <section>
            <Label>Quién recoge</Label>
            <Group>
              <Row
                lead={<span style={{ display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 7, background: 'color-mix(in srgb, var(--u-text) 8%, transparent)', color: 'var(--u-text-2)', flexShrink: 0 }}><Icon name="user" size={14} /></span>}
                title={
                  <input
                    value={guestName}
                    onChange={(e) => onGuestName(e.target.value)}
                    placeholder="Nombre de quien lo recoge (opcional)"
                    aria-label="Nombre de quien recoge el pedido"
                    style={{
                      width: '100%', border: 'none', outline: 'none', background: 'none',
                      color: 'var(--u-text)', fontSize: 16, fontWeight: 500, padding: 0,
                    }}
                  />
                }
                sub="Sirve para cantarlo cuando esté listo."
              />
            </Group>
          </section>
        )}

        {/* ── Lo que ya está en la mesa ─────────────────────────── */}
        {esMesa && (cargando || lineas.length > 0) && (
          <section>
            <Label aside={
              lineas.length > 0
                ? <span style={{ fontSize: 12.5, color: 'var(--u-text-3)' }}>{lineas.reduce((s, l) => s + l.qty, 0)} platos</span>
                : undefined
            }>
              En la mesa
            </Label>
            {cargando ? (
              <Group><Row title={<span style={{ color: 'var(--u-text-3)', fontWeight: 400 }}>Cargando lo que ya se pidió…</span>} /></Group>
            ) : (
              <Group>
                {lineas.map((l, i) => (
                  <div key={`${l.name}-${l.estado}`}>
                    {i > 0 && <Hr />}
                    {/* Tres columnas en la tablet, apilado en el teléfono: lo
                        decide `.wp-line` en CSS, no dos marcados distintos. */}
                    <div className="wp-line">
                      <div className="wp-line-main">
                        <div className="wp-line-ttl">{l.qty} · {l.name}</div>
                        {l.detalle && <div className="wp-line-sub">{l.detalle}</div>}
                      </div>
                      <div className="wp-line-right">
                        <div className="wp-line-state">
                          <Pill color={l.color}>{l.estado}</Pill>
                        </div>
                        <div className="wp-line-amt">
                          <Mono size={13.5} color="var(--u-text-2)">{money(l.amount)}</Mono>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <Hr full />
                <Row
                  style={{ background: 'color-mix(in srgb, var(--u-text) 3%, transparent)' }}
                  pad="13px 16px"
                  title={<span style={{ fontWeight: 600 }}>Total de la mesa</span>}
                  right={<Mono size={16}>{money(totalMesa)}</Mono>}
                />
              </Group>
            )}
          </section>
        )}

        {/* ── Lo que se está apuntando ──────────────────────────── */}
        {hayCarrito && (
          <section>
            <Label aside={<span style={{ fontSize: 12.5, color: 'var(--brand-accent-ink)', fontWeight: 600 }}>sin enviar</span>}>
              Por enviar · {cartCount} {cartCount === 1 ? 'plato' : 'platos'}
            </Label>
            <Group>
              {cart.map((l, i) => (
                <div key={l.lineId}>
                  {i > 0 && <Hr />}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px 9px 16px', minHeight: 56 }}>
                    <button
                      type="button"
                      onClick={() => onEdit(l.lineId)}
                      className="press"
                      style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      <span style={{ display: 'block', fontSize: 14.5, fontWeight: 500, color: 'var(--u-text)' }}>{l.name}</span>
                      {l.detalle && (
                        <span style={{ display: 'block', fontSize: 13, color: 'var(--u-text-3)', marginTop: 1, lineHeight: 1.35 }}>{l.detalle}</span>
                      )}
                    </button>
                    <Mono size={14} color="var(--u-text-2)">{money(l.price * l.quantity)}</Mono>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <button type="button" className="wp-step press" onClick={() => onDec(l.lineId)} aria-label={`Quitar uno de ${l.name}`}>
                        <Icon name="minus" size={15} />
                      </button>
                      <Mono size={15}>{l.quantity}</Mono>
                      <button type="button" className="wp-step press" onClick={() => onInc(l.lineId)} aria-label={`Agregar otro ${l.name}`}>
                        <Icon name="plus" size={15} />
                      </button>
                    </span>
                  </div>
                </div>
              ))}
              <Hr full />
              {/* La nota que va impresa en la comanda. Vive con lo que se
                  va a enviar, no en una pantalla de "revisar": es parte
                  del pedido, no un paso más. */}
              <Row
                lead={<Icon name="edit" size={15} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />}
                pad="10px 16px"
                title={
                  <input
                    value={notes}
                    onChange={(e) => onNotes(e.target.value)}
                    placeholder="Nota para cocina (opcional)"
                    aria-label="Nota para cocina de todo el pedido"
                    style={{
                      width: '100%', border: 'none', outline: 'none', background: 'none',
                      color: 'var(--u-text)', fontSize: 16, padding: 0,
                    }}
                  />
                }
              />
            </Group>
          </section>
        )}

        {/* ── Agregar ───────────────────────────────────────────── */}
        <DishFinder
          products={products}
          categories={categories}
          onPick={onPick}
          qtyOf={qtyOf}
          onDec={onDecProduct}
          money={money}
          onSend={hayCarrito && !enviando ? onEnviar : null}
          autoFocus={focoBuscador}
        />

        {/* ── Cómo va la mesa ───────────────────────────────────
            La sección del lienzo que se había quedado sin construir. No
            consulta nada nuevo: las marcas de tiempo de estado ya viajaban
            en cada pedido y no las leía nadie. Contesta lo que un mesero
            pregunta en voz alta veinte veces por turno — ¿ya pidieron el
            postre?, ¿cuánto llevan esperando?, ¿quién los atendió? */}
        {esMesa && eventos.length > 0 && (
          <section>
            <Label>Cómo va la mesa</Label>
            <Group>
              {eventos.map((e, i) => (
                <div key={`${e.at}-${i}`}>
                  {i > 0 && <Hr />}
                  <div className="wp-ev" data-pend={e.pendiente ? '1' : '0'}>
                    <span className="wp-ev-h">{hora(e.at)}</span>
                    <span className="wp-ev-t">{e.text}</span>
                    {e.who && <span className="wp-ev-w">{e.who}</span>}
                  </div>
                </div>
              ))}
            </Group>
          </section>
        )}

        {/* ── Cerrar la mesa ────────────────────────────────────── */}
        {esMesa && onLiberar && !hayCarrito && (
          <section>
            <Label>Cuando ya no quede nadie</Label>
            <Group>
              <Row
                onClick={onLiberar}
                title="Marcar la mesa como libre"
                sub={
                  state?.kind === 'abierta' || state?.kind === 'atencion'
                    ? 'Cierra los pedidos que sigan abiertos. Cóbrala antes.'
                    : 'La mesa vuelve a estar disponible.'
                }
                trail={<Icon name="chevronRight" size={16} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />}
              />
            </Group>
          </section>
        )}

        {/* ── Sin soltar el teclado ─────────────────────────────
            En el lienzo la chuleta sale SOLO en la lámina de PC, pegada al
            pie. Estaba puesta en medio del panel, encima de la comanda, en
            los tres anchos: una tablet táctil dedicaba media pantalla a seis
            atajos que ahí no se pueden pulsar. Ahora vive al fondo, se
            despliega sola en modo servicio (donde la PC es la herramienta) y
            en el resto es una línea que se abre si te interesa. */}
        <KeyHelp abierta={!!servicio?.active} />
      </div>

      {/* ── La barra de abajo ─────────────────────────────────────
          Lo que manda: el total y el envío. Cuando no hay nada que
          enviar, el sitio lo ocupa la acción que sí toca ahora
          (llevar la comida que está lista, por ejemplo). */}
      <div className="wp-bar">
        {hayCarrito ? (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: 'var(--u-text-3)' }}>Por enviar</div>
              <Mono size={20}>{money(subtotal)}</Mono>
            </div>
            <button
              type="button"
              onClick={onEnviar}
              disabled={enviando}
              className="press btn-accent"
              style={{ ...botonPrimario, height: 46, padding: '0 20px', borderRadius: 12, fontSize: 15, opacity: enviando ? 0.7 : 1 }}
            >
              {enviando ? 'Enviando…' : `Enviar ${cartCount} ${cartCount === 1 ? 'plato' : 'platos'}`}
              <span className="wp-keys">
                <Key>Ctrl</Key><Key>Enter</Key>
              </span>
            </button>
          </>
        ) : accionEstado ? (
          <>
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.45 }}>
              {state?.kind === 'atencion' && state.since && now != null
                ? `${state.label}. Cuanto antes, mejor.`
                : 'Cuando la comida llegue a la mesa, márcalo aquí.'}
            </div>
            <button type="button" onClick={accionEstado.run} className="press btn-accent" style={{ ...botonPrimario, height: 46, padding: '0 20px', borderRadius: 12, fontSize: 15 }}>
              {accionEstado.label}
            </button>
          </>
        ) : (
          <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.45 }}>
            {esMesa
              ? 'Busca un plato ahí arriba para agregarlo. Nada sale a cocina hasta que lo envíes.'
              : 'Agrega los platos y envíalo a cocina cuando esté completo.'}
          </div>
        )}
      </div>
    </div>
  );
}

const botonSecundario: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
  height: 36, padding: '0 13px', borderRadius: 9,
  border: '1px solid var(--adm-border-2)', background: 'none', cursor: 'pointer',
  color: 'var(--u-text-2)', fontSize: 13.5, fontWeight: 500,
};

const botonPrimario: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, flexShrink: 0,
  height: 36, padding: '0 15px', borderRadius: 9, border: 'none', cursor: 'pointer',
  fontSize: 13.5, fontWeight: 600,
};

function aviso(tono: 'danger' | 'ok'): React.CSSProperties {
  const color = tono === 'danger' ? 'var(--c-danger)' : 'var(--c-ok)';
  return {
    padding: '11px 14px', borderRadius: 11, fontSize: 13.5, lineHeight: 1.45,
    border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
    background: `color-mix(in srgb, ${color} 10%, transparent)`,
    color,
  };
}

/** "12:41". La hora local del aparato, que es la del local. */
function hora(iso: string): string {
  const t = new Date(iso);
  return Number.isFinite(t.getTime())
    ? t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
}

/* ── La chuleta de teclado ─────────────────────────────────────
   Todo atajo tiene su botón: el teclado acelera, no manda. Por eso esto
   puede estar plegado sin que se pierda nada, y por eso no se pinta donde
   no hay teclado que anunciar (`.wp-keyhelp`, media query de puntero). */
function KeyHelp({ abierta }: { abierta: boolean }) {
  return (
    <details className="wp-keyhelp" open={abierta}>
      <summary>Sin soltar el teclado</summary>
      <div className="wp-keyhelp-grid">
        <Atajo teclas={['↑', '↓']} que="Moverse entre resultados" />
        <Atajo teclas={['Enter']} que="Agregar y seguir escribiendo" />
        <Atajo teclas={['3', 'l', 'i', 'm']} que="Tres limonadas de una vez" />
        <Atajo teclas={['/']} que="Volver al buscador" />
        <Atajo teclas={['Ctrl', 'M']} que="Cambiar de mesa" />
        <Atajo teclas={['Ctrl', 'Enter']} que="Enviar a cocina" />
      </div>
    </details>
  );
}

function Atajo({ teclas, que }: { teclas: string[]; que: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px' }}>
      <span style={{ display: 'inline-flex', gap: 3, width: 104, flexShrink: 0 }}>
        {teclas.map((k, i) => <Key key={i}>{k}</Key>)}
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--u-text-2)' }}>{que}</span>
    </div>
  );
}
