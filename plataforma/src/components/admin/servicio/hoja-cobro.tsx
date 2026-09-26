'use client';

/* COBRAR LA MESA.
   ------------------------------------------------------------------
   Tres formas de cobrar, un segmentado y nada más:

     · CUENTA COMPLETA — el caso de siempre, y por eso es el primero.
     · PARTES IGUALES  — cuántos son y cuánto le toca a cada uno.
     · POR PLATOS      — se marca lo que paga esta persona. Esa parte se
                         cobra y LA MESA SIGUE ABIERTA.

   Dos cosas del handoff que aquí se hacen distinto, y por qué:

   1. LA PROPINA SE QUEDA. El diseño la eliminaba («la cuenta es
      subtotal → total»), pero la propina de este sistema se calcula al
      CREAR el pedido y ya está dentro de `orders.total`. Esconderla no
      la quitaría: haría que la hoja enseñara un número distinto del que
      se cobra. Así que se enseña el desglose de verdad —consumo,
      propina, descuento— y el total sigue siendo el total.

   2. POR PLATOS NO BORRA NADA. El prototipo decía «cobrar una parte
      quita esas líneas». Quitarlas de verdad sería ANULARLAS, con motivo
      y PIN, y esa venta desaparecería del arqueo. Aquí la parte cobrada
      se escribe en `order_payments` (migración 129) y las líneas se
      quedan a la vista, marcadas «Pagado».

   Y tres métodos de pago, no dos: este sistema cobra también por
   transferencia, y el arqueo de la noche los cuenta por separado. */

import { useMemo, useState } from 'react';
import { Hoja, HojaHead, Kicker, Mono } from '@/components/admin/servicio/pieces';
import { importeLinea, type LineaServicio, type ResumenComanda } from '@/lib/servicio/comanda';
import { PAYMENT_LABEL, PAYMENT_METHODS, type PaymentMethod } from '@/lib/payment-method';
import type { BillBreakdown } from '@/lib/bill-split';
import type { Product } from '@/types';

export type ModoCobro = 'todo' | 'iguales' | 'platos';

export interface PagoElegido {
  method: PaymentMethod;
  amount?: number | null;
  cashReceived?: number | null;
}

export interface HojaCobroProps {
  titulo: string;
  resumen: ResumenComanda;
  /** El desglose real de los pedidos de la mesa (consumo, propina, descuento). */
  desglose: BillBreakdown | null;
  /**
   * Lo que de verdad falta por cobrar, propina incluida.
   *
   * NO es `resumen.porCobrar`, que suma líneas y por tanto se queda en el
   * consumo. `freeTable` cierra la mesa cobrando `orders.total`, así que si
   * el botón dijera la suma de las líneas prometería un número y cobraría
   * otro: visto en pantalla con una mesa de Q174 de consumo y Q12 de
   * propina.
   */
  porCobrar: number;
  /** El dinero que esta mesa ya pagó en cobros parciales. */
  yaCobrado: number;
  money: (n: number) => string;
  /** Símbolo de moneda, para los importes rápidos en efectivo. */
  redondear: (n: number) => string;
  /** Qué ofrecer antes de cerrar: postre si no hay, bebida si no hay. */
  sugerencias: { label: string; items: Product[] } | null;
  onSugerir: (p: Product) => void;
  busy: boolean;
  onClose: () => void;
  /** Cobra TODO y cierra la mesa. */
  onCobrarTodo: (pagos: PagoElegido[]) => void;
  /** Cobra solo estas líneas y deja la mesa abierta. */
  onCobrarParte: (lineas: LineaServicio[], pagos: PagoElegido[]) => void;
}

/** Los billetes con los que de verdad se paga una cuenta de este tamaño. */
function billetes(total: number): number[] {
  if (total <= 0) return [];
  const out = new Set<number>();
  for (const paso of [50, 100, 200, 500]) {
    const arriba = Math.ceil(total / paso) * paso;
    if (arriba > total) out.add(arriba);
  }
  return [...out].sort((a, b) => a - b).slice(0, 3);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export default function HojaCobro({
  titulo, resumen, desglose, porCobrar, yaCobrado, money, redondear, sugerencias, onSugerir,
  busy, onClose, onCobrarTodo, onCobrarParte,
}: HojaCobroProps) {
  const [modo, setModo] = useState<ModoCobro>('todo');
  const [personas, setPersonas] = useState(2);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [metodo, setMetodo] = useState<PaymentMethod>('CASH');
  const [recibido, setRecibido] = useState<number | null>(null);

  /* Solo se puede cobrar lo que YA SALIÓ a cocina: una línea sin enviar
     no la ha hecho nadie. El pie de la comanda ya impide llegar aquí con
     algo sin enviar, pero la regla vive también aquí porque de aquí sale
     el dinero. */
  const cobrables = useMemo(
    () => [...resumen.cocina, ...resumen.servidas].filter((l) => !l.pagada && !l.enviando),
    [resumen],
  );

  const pendiente = porCobrar;

  const parte = useMemo(() => {
    const set = new Set(marcadas);
    return cobrables.filter((l) => set.has(l.id));
  }, [cobrables, marcadas]);

  /* Una parte paga su trozo de propina y de descuento, no solo sus platos.
     Si no, la última persona en pagar cargaría con toda la propina de la
     mesa —y la suma de las partes no daría el total—. Es el mismo reparto
     proporcional que hace `lib/bill-split.ts`. */
  const factorExtras = desglose && desglose.items > 0
    ? desglose.grandTotal / desglose.items
    : 1;

  const importeParte = useMemo(
    () => r2(parte.reduce((s, l) => s + importeLinea(l), 0) * factorExtras),
    [parte, factorExtras],
  );

  /* Qué se está cobrando AHORA. En «partes iguales» se cobra la cuenta
     entera igual —el reparto es una cuenta que el mesero hace en voz
     alta, no tres cobros— y por eso el CTA dice el total y no la parte.
     El prototipo decía «Cobrar {total}» estando en partes iguales pero
     calculaba sobre otra base: dos números distintos para el mismo acto. */
  const base = modo === 'platos' ? importeParte : pendiente;
  const esParcial = modo === 'platos' && parte.length > 0 && parte.length < cobrables.length;

  const esEfectivo = metodo === 'CASH';
  const vuelto = recibido != null ? Math.max(0, r2(recibido - base)) : null;
  /* Con un «recibí» menor que la cuenta no se cierra: o es un teclazo a
     medias o falta cobrar, y en los dos casos cerrar es peor que esperar. */
  const faltaEfectivo = esEfectivo && recibido != null && recibido < base - 0.004;

  const opciones = useMemo(() => {
    const out = [base, ...billetes(base)];
    return [...new Set(out.map(r2))].filter((v) => v > 0);
  }, [base]);

  const puede = base > 0.004 && !faltaEfectivo && !busy
    && (modo !== 'platos' || parte.length > 0);

  function cobrar() {
    if (!puede) return;
    /* EL IMPORTE VIAJA SIEMPRE, también al cerrar la mesa entera.
       ------------------------------------------------------------
       Sin él, `freeTable` entiende «lo que quede» y aplica el total del
       pedido — que incluye lo que esta mesa YA pagó en un cobro parcial.
       Visto contra la base: una cuenta de Q114 con Q24 ya cobrados se
       cerró con un movimiento de Q114 más, o sea Q138 en el arqueo de la
       noche. Mandando lo que dice el botón, lo escrito y lo prometido son
       el mismo número. */
    const pagos: PagoElegido[] = [{
      method: metodo,
      amount: base,
      ...(esEfectivo && recibido != null ? { cashReceived: recibido } : {}),
    }];
    if (modo === 'platos' && parte.length > 0 && esParcial) {
      onCobrarParte(parte, pagos);
      return;
    }
    onCobrarTodo(pagos);
  }

  /* Sin nada marcado en «por platos» el botón no puede prometer
     «Cobrar Q0.00 y cerrar»: dice lo que falta por hacer. */
  const cta = modo === 'platos' && parte.length === 0
    ? 'Marca lo que paga esta persona'
    : esParcial
      ? `Cobrar ${money(importeParte)} de esta parte`
      : `Cobrar ${money(base)} y cerrar`;

  return (
    <Hoja onClose={onClose} label={`Cobrar ${titulo}`}>
      <div className="sv-sheet-pad">
        <HojaHead title={`Cobrar ${titulo}`} total={money(pendiente)} onClose={onClose} />

        {/* El desglose de verdad. Solo sale cuando hay algo que desglosar:
            una mesa sin propina ni descuento no necesita tres renglones
            para decir que el total es el total. */}
        {desglose && (desglose.tip > 0 || desglose.discount > 0 || yaCobrado > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Fila label="Consumo" valor={money(desglose.items)} />
            {desglose.delivery > 0 && <Fila label="Envío" valor={money(desglose.delivery)} />}
            {desglose.tip > 0 && <Fila label="Propina" valor={money(desglose.tip)} />}
            {desglose.discount > 0 && <Fila label="Descuento" valor={`− ${money(desglose.discount)}`} />}
            {yaCobrado > 0 && (
              <Fila label="Ya cobrado" valor={`− ${money(yaCobrado)}`} tone="ok" />
            )}
          </div>
        )}

        {sugerencias && modo !== 'platos' && (
          <div style={{
            border: '1px solid var(--u-hair)', borderRadius: 'var(--radius-lg)', padding: 12,
            display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--surface-1)',
          }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{sugerencias.label}</div>
            <div className="sv-opts-row">
              {sugerencias.items.map((p) => (
                <button key={p.id} type="button" className="sv-fav" onClick={() => onSugerir(p)}>
                  + {p.name}
                  <span className="sv-fav-price">{money(p.price)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="sv-seg" role="tablist">
          <button type="button" role="tab" data-on={modo === 'todo' ? '1' : '0'} aria-selected={modo === 'todo'} onClick={() => { setModo('todo'); setMarcadas([]); setRecibido(null); }}>
            Cuenta completa
          </button>
          <button type="button" role="tab" data-on={modo === 'iguales' ? '1' : '0'} aria-selected={modo === 'iguales'} onClick={() => { setModo('iguales'); setMarcadas([]); setRecibido(null); }}>
            Partes iguales
          </button>
          <button type="button" role="tab" data-on={modo === 'platos' ? '1' : '0'} aria-selected={modo === 'platos'} onClick={() => { setModo('platos'); setRecibido(null); }}>
            Por platos
          </button>
        </div>

        {modo === 'iguales' && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: 14, borderRadius: 'var(--radius-lg)', border: '1px solid var(--u-hair)',
            background: 'var(--adm-card)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" className="sv-step" style={{ width: 46, height: 46 }} onClick={() => setPersonas((n) => Math.max(1, n - 1))} aria-label="Una persona menos">−</button>
              <div style={{ minWidth: 76, textAlign: 'center' }}>
                <Mono size={20}>{personas}</Mono>
                <div style={{ fontSize: 11.5, color: 'var(--u-text-3)', fontWeight: 500 }}>personas</div>
              </div>
              <button type="button" className="sv-step" style={{ width: 46, height: 46 }} onClick={() => setPersonas((n) => Math.min(20, n + 1))} aria-label="Una persona más">+</button>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Mono size={22}>{money(r2(pendiente / Math.max(1, personas)))}</Mono>
              <div style={{ fontSize: 11.5, color: 'var(--u-text-3)', fontWeight: 500 }}>cada uno</div>
            </div>
          </div>
        )}

        {modo === 'platos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, color: 'var(--u-text-3)', fontWeight: 500, lineHeight: 1.45 }}>
              Toca lo que paga esta persona. Lo demás queda abierto en la mesa.
            </div>
            {cobrables.map((l) => {
              const on = marcadas.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  className="sv-pay"
                  data-on={on ? '1' : '0'}
                  onClick={() => setMarcadas((prev) => (on ? prev.filter((x) => x !== l.id) : [...prev, l.id]))}
                >
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>
                      {l.cantidad}× {l.nombre}
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--u-text-3)', marginTop: 1 }}>
                      {money(l.unidad)} c/u
                    </span>
                  </span>
                  <Mono size={14}>{money(importeLinea(l))}</Mono>
                  <span className="sv-pay-box">{on ? '✓' : ''}</span>
                </button>
              );
            })}
            {cobrables.length === 0 && (
              <div className="sv-vacio" style={{ padding: '18px 0' }}>Ya está todo cobrado.</div>
            )}
          </div>
        )}

        <div>
          <Kicker>¿Cómo pagan?</Kicker>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                className="sv-choice"
                data-on={metodo === m ? '1' : '0'}
                onClick={() => { setMetodo(m); setRecibido(null); }}
              >
                {PAYMENT_LABEL[m]}
              </button>
            ))}
          </div>
        </div>

        {esEfectivo && opciones.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="sv-opts-row">
              {opciones.map((v) => (
                <button
                  key={v}
                  type="button"
                  className="sv-choice"
                  data-mono="1"
                  data-on={recibido === v ? '1' : '0'}
                  style={{ flex: '0 0 auto', minWidth: 0 }}
                  onClick={() => setRecibido(recibido === v ? null : v)}
                >
                  {/* «Justo» es el importe EXACTO: redondeado, una cuenta de
                      Q48.50 decía «Justo Q49» y apuntaba 48.50. Los billetes
                      sí van sin decimales. */}
                  {v === base ? `Justo ${money(v)}` : redondear(v)}
                </button>
              ))}
            </div>
            {vuelto != null && (
              <div className="sv-vuelto">
                <span style={{ fontSize: 14, fontWeight: 600 }}>Vuelto</span>
                <span className="sv-vuelto-n">{money(vuelto)}</span>
              </div>
            )}
          </div>
        )}

        {faltaEfectivo && (
          <div className="sv-hint" style={{ background: 'var(--c-danger-bg)', color: 'var(--c-danger)' }}>
            Con {money(recibido ?? 0)} no alcanza: faltan {money(r2(base - (recibido ?? 0)))}.
          </div>
        )}

        <button type="button" className="sv-cta" data-tone="ok" style={{ height: 58, fontSize: 16.5 }} onClick={cobrar} disabled={!puede}>
          {busy ? 'Cobrando…' : cta}
        </button>

        {esParcial && (
          <div className="sv-foot-note">
            Se cobra solo esta parte. La mesa sigue abierta con {money(r2(pendiente - importeParte))} pendientes.
          </div>
        )}
      </div>
    </Hoja>
  );
}

function Fila({ label, valor, tone }: { label: string; valor: string; tone?: 'ok' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 13.5, color: 'var(--u-text-3)' }}>{label}</span>
      <Mono size={14} weight={500} color={tone === 'ok' ? 'var(--c-ok)' : 'var(--u-text-2)'}>{valor}</Mono>
    </div>
  );
}
