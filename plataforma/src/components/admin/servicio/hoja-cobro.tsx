'use client';

import { useState } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import { HojaOperativa } from '@/components/ui/hoja-operativa';
import { Button } from '@/components/ui/button';
import { Kicker, Mono } from '@/components/admin/servicio/pieces';
import { importeLinea, type LineaServicio, type ResumenComanda } from '@/lib/servicio/comanda';
import { PAYMENT_LABEL, PAYMENT_METHODS, type PaymentMethod } from '@/lib/payment-method';
import type { BillBreakdown } from '@/lib/bill-split';
import type { ContextoCobroMesa, PagoCobro, RepartoCobro } from '@/lib/cobro-intento';

type ModoCobro = 'todo' | 'iguales' | 'libre' | 'platos';
const LABEL_APLICADO = { CASH: 'Efectivo aplicado', CARD: 'Tarjeta aplicada', TRANSFER: 'Transferencia aplicada' };

interface HojaCobroProps {
  titulo: string;
  resumen: ResumenComanda;
  desglose: BillBreakdown | null;
  porCobrar: number;
  yaCobrado: number;
  saldosPlatos: Record<string, number> | null;
  contexto: ContextoCobroMesa | null;
  money: (n: number) => string;
  redondear: (n: number) => string;
  busy: boolean;
  onClose: () => void;
  onCobrarTodo: (pagos: PagoCobro[]) => void;
  onCobrarParte: (lineas: LineaServicio[], pagos: PagoCobro[]) => void;
  onAbonar: (pagos: PagoCobro[], reparto: string | null, partes: string[]) => void;
  onGuardarPartes: (cantidad: number) => void;
  mantieneMesa: boolean;
}

const centavos = (n: number) => Math.round(n * 100);

function leerCentavos(valor: string) {
  if (!/^\d{1,8}(?:[.,]\d{1,2})?$/.test(valor)) return null;
  const [entero, decimales = ''] = valor.replace(',', '.').split('.');
  return Number(entero) * 100 + Number(decimales.padEnd(2, '0'));
}

function billetes(total: number): number[] {
  const out = new Set<number>();
  for (const paso of [50, 100, 200, 500]) {
    const arriba = Math.ceil(total / paso) * paso;
    if (arriba > total) out.add(arriba);
  }
  return [...out].sort((a, b) => a - b).slice(0, 3);
}

export default function HojaCobro({
  titulo, resumen, desglose, porCobrar, yaCobrado, saldosPlatos, contexto, money, redondear,
  busy, onClose, onCobrarTodo, onCobrarParte, onAbonar, onGuardarPartes, mantieneMesa,
}: HojaCobroProps) {
  const [modo, setModo] = useState<ModoCobro>('todo');
  const [personas, setPersonas] = useState(2);
  const [redividir, setRedividir] = useState(false);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [importe, setImporte] = useState('');
  const [metodo, setMetodo] = useState<PaymentMethod | 'mixto'>('CASH');
  const [mixto, setMixto] = useState<Record<PaymentMethod, string>>({ CASH: '', CARD: '', TRANSFER: '' });
  const [recibido, setRecibido] = useState('');

  const reparto = contexto?.reparto;
  const saldada = contexto?.saldada ?? false;
  const puedeAbonar = !!contexto && !contexto.avisoCuotas;
  const cobrables = [...resumen.cocina, ...resumen.servidas].filter((l) =>
    !l.pagada && !l.enviando && (!saldosPlatos || (saldosPlatos[l.id] ?? 0) > 0));
  const platos = cobrables.filter((l) => marcadas.includes(l.id));
  const partes = reparto && !reparto.desactualizado
    ? reparto.partes.filter((p) => !p.recibo && seleccion.includes(p.id))
    : [];
  const saldo = centavos(porCobrar);
  const basePorModo = {
    todo: saldo,
    platos: platos.reduce((s, l) => s + centavos(saldosPlatos?.[l.id] ?? importeLinea(l)), 0),
    iguales: partes.reduce((s, p) => s + centavos(p.importe), 0),
    libre: leerCentavos(importe) ?? 0,
  };
  const base = basePorModo[modo];
  const abono = modo === 'libre' || modo === 'iguales';
  const parcialPlatos = modo === 'platos' && base < saldo;
  const quedaAbierta = mantieneMesa || abono || parcialPlatos;
  const montos = PAYMENT_METHODS.map((m) => metodo === 'mixto'
    ? leerCentavos(mixto[m] || '0')
    : (metodo === m ? base : 0));
  const efectivo = montos[PAYMENT_METHODS.indexOf('CASH')] ?? 0;
  const recibidoCent = leerCentavos(recibido);
  const faltante = efectivo - (recibidoCent ?? 0);
  const efectivoInvalido = efectivo > 0 && recibido !== '' && (recibidoCent == null || faltante > 0);
  const aplicado = montos.reduce<number>((s, m) => s + (m ?? 0), 0);
  const mixtoValido = montos.every((m) => m != null)
    && montos.filter((m) => (m ?? 0) > 0).length >= 2
    && aplicado === base;
  const puede = !busy && base > 0 && base <= saldo && (!(abono || (mantieneMesa && !parcialPlatos)) || puedeAbonar)
    && (metodo !== 'mixto' || mixtoValido) && !efectivoInvalido;
  const mostrarEditor = !reparto || reparto.desactualizado || redividir;
  const mostrarPago = !saldada && (modo !== 'iguales' || (!mostrarEditor && partes.length > 0));

  function cobrar() {
    if (!puede) return;
    const pagos = PAYMENT_METHODS.flatMap((m, i) => {
      const cantidad = montos[i] ?? 0;
      return cantidad > 0 ? [{
        method: m, amount: cantidad / 100,
        ...(m === 'CASH' && recibidoCent != null ? { cashReceived: recibidoCent / 100 } : {}),
      }] : [];
    });
    if (abono) onAbonar(pagos, modo === 'iguales' ? reparto?.id ?? null : null, partes.map((p) => p.id));
    else if (parcialPlatos) onCobrarParte(platos, pagos);
    else onCobrarTodo(pagos);
  }

  const cta = modo === 'platos' && platos.length === 0
    ? 'Marca lo que paga esta persona'
    : abono ? `Registrar ${money(base / 100)}`
      : parcialPlatos ? `Cobrar ${money(base / 100)} de esta parte`
        : `Cobrar ${money(base / 100)}${mantieneMesa ? '' : ' y cerrar'}`;

  return (
    <HojaOperativa
      label={`Cobrar ${titulo}`}
      className="hoja-cobro"
      onClose={onClose}
      resumen={<Fila label="Por cobrar" valor={money(porCobrar)} destacada />}
      footer={
        <div className="sv-cobro-pie">
          {saldada ? (
            <p className="sv-foot-note">Cuenta pagada. La mesa sigue ocupada hasta que pase a limpieza.</p>
          ) : mostrarPago && (
            <>
              {efectivo > 0 && (
                <div role="status">
                  <Fila label="Vuelto" valor={recibidoCent == null || efectivoInvalido
                    ? '—' : money((recibidoCent - efectivo) / 100)} tone="ok" />
                </div>
              )}
              {quedaAbierta && base > 0 && base <= saldo && (
                <p className="sv-foot-note">{base === saldo
                  ? 'La cuenta queda pagada y la mesa sigue abierta.'
                  : `La mesa sigue abierta con ${money((saldo - base) / 100)} pendientes.`}</p>
              )}
              <Button type="button" size="action" onClick={cobrar} disabled={!puede} aria-busy={busy}>
                {busy ? 'Cobrando…' : cta}
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="sv-cobro-contenido">
        {desglose && (
          <div className="grid gap-1">
            <Fila label="Consumo" valor={money(desglose.items)} />
            {desglose.delivery > 0 && <Fila label="Envío" valor={money(desglose.delivery)} />}
            {desglose.tip > 0 && <Fila label="Propina" valor={money(desglose.tip)} />}
            {desglose.discount > 0 && <Fila label="Descuento" valor={`− ${money(desglose.discount)}`} />}
            <Fila label="Ya cobrado" valor={money(yaCobrado)} tone="ok" />
          </div>
        )}
        {saldada ? (
          <>
            <p className="sv-foot-note">Cuenta pagada. Confirma el cierre cuando hayas servido todos los pedidos.</p>
            {reparto?.partes.filter((p) => p.recibo).map((p) => <PartePagada key={p.id} parte={p} money={money} />)}
          </>
        ) : (
          <Tabs.Root
            value={modo}
            onValueChange={(value) => {
              if (busy || (value !== 'todo' && value !== 'iguales' && value !== 'platos' && value !== 'libre')) return;
              setModo(value);
              setRecibido('');
            }}
          >
            <Tabs.List className="sv-seg" data-mixto={!!contexto || undefined} aria-label="Alcance del cobro">
              <Tabs.Tab value="todo" disabled={busy}>Cuenta completa</Tabs.Tab>
              {contexto && <Tabs.Tab value="iguales" disabled={busy || !puedeAbonar}>Partes iguales</Tabs.Tab>}
              {contexto && <Tabs.Tab value="libre" disabled={busy || !puedeAbonar}>Importe libre</Tabs.Tab>}
              {saldosPlatos && <Tabs.Tab value="platos" disabled={busy}>Por platos</Tabs.Tab>}
            </Tabs.List>
            <Tabs.Panel value="todo" />
            <Tabs.Panel value="libre" className="sv-cobro-modo">
              <CampoImporte label="Importe a registrar" value={importe} onChange={setImporte} disabled={busy} />
              {importe !== '' && leerCentavos(importe) == null && (
                <p role="alert" className="sv-foot-note">Ingresa un importe con hasta dos decimales.</p>
              )}
              {base > saldo && <p role="alert" className="sv-foot-note">El importe supera el saldo de la cuenta.</p>}
            </Tabs.Panel>
            <Tabs.Panel value="iguales" className="sv-cobro-modo">
              {reparto?.desactualizado && (
                <p role="status" className="sv-foot-note">El saldo cambió. Vuelve a repartir el saldo pendiente. Las partes pagadas se conservan.</p>
              )}
              {mostrarEditor && (
                <div className="grid gap-2">
                  <div className="flex items-center gap-2">
                    <button type="button" className="sv-step" disabled={busy || personas <= 1} aria-label="Una parte menos" onClick={() => setPersonas(personas - 1)}>−</button>
                    <Mono size={18}>{personas} partes pendientes</Mono>
                    <button type="button" className="sv-step" disabled={busy || personas >= 20} aria-label="Una parte más" onClick={() => setPersonas(personas + 1)}>+</button>
                  </div>
                  <Button type="button" variant="outline" disabled={busy || saldo < personas} onClick={() => {
                    onGuardarPartes(personas);
                    setRedividir(false);
                    setSeleccion([]);
                    setRecibido('');
                  }}>Guardar reparto</Button>
                </div>
              )}
              {reparto?.partes.filter((p) => p.recibo || !mostrarEditor).map((p) => p.recibo ? (
                <PartePagada key={p.id} parte={p} money={money} />
              ) : (
                <button type="button" className="sv-pay" key={p.id} aria-pressed={seleccion.includes(p.id)}
                  data-on={seleccion.includes(p.id) ? '1' : '0'} disabled={busy}
                  onClick={() => setSeleccion((prev) => alternar(prev, p.id))}>
                  <span className="min-w-0 flex-1 text-left">Parte {p.numero}</span>
                  <Mono size={14}>{money(p.importe)}</Mono>
                  <span className="sv-pay-box" aria-hidden>{seleccion.includes(p.id) ? '✓' : ''}</span>
                </button>
              ))}
              {!mostrarEditor && (
                <Button type="button" variant="outline" disabled={busy} onClick={() => setRedividir(true)}>
                  Volver a repartir el saldo
                </Button>
              )}
            </Tabs.Panel>
            <Tabs.Panel value="platos" className="sv-cobro-modo">
              <p className="sv-foot-note">Marca los platos que paga esta persona.</p>
              {cobrables.map((l) => (
                <button type="button" className="sv-pay" key={l.id} aria-pressed={marcadas.includes(l.id)}
                  data-on={marcadas.includes(l.id) ? '1' : '0'} disabled={busy}
                  onClick={() => setMarcadas((prev) => alternar(prev, l.id))}>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block font-semibold">{l.cantidad}× {l.nombre}</span>
                    <span className="sv-foot-note">{money(l.unidad)} c/u</span>
                  </span>
                  <Mono size={14}>{money(saldosPlatos?.[l.id] ?? importeLinea(l))}</Mono>
                  <span className="sv-pay-box" aria-hidden>{marcadas.includes(l.id) ? '✓' : ''}</span>
                </button>
              ))}
              {cobrables.length === 0 && <p className="sv-foot-note">No hay platos con cuotas disponibles para cobrar.</p>}
            </Tabs.Panel>
          </Tabs.Root>
        )}
        {mostrarPago && (
          <>
            <div>
              <Kicker>¿Cómo pagan?</Kicker>
              <div className="sv-cobro-metodos" data-mixto={!!contexto || undefined} role="group" aria-label="Método de pago">
                {[...PAYMENT_METHODS, ...(contexto ? ['mixto' as const] : [])].map((m) => (
                  <button key={m} type="button" className="sv-choice" data-on={metodo === m ? '1' : '0'}
                    aria-pressed={metodo === m} disabled={busy} onClick={() => { setMetodo(m); setRecibido(''); }}>
                    {m === 'mixto' ? 'Pago mixto' : PAYMENT_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>
            {metodo === 'mixto' && (
              <div className="grid gap-2">
                {PAYMENT_METHODS.map((m) => (
                  <CampoImporte key={m} label={LABEL_APLICADO[m]} value={mixto[m]} disabled={busy}
                    onChange={(v) => setMixto((prev) => ({ ...prev, [m]: v }))} />
                ))}
                <p className="sv-foot-note" role="status">
                  Aplicado {money(aplicado / 100)} de {money(base / 100)}. Usa al menos dos métodos.
                </p>
              </div>
            )}
            {efectivo > 0 && (
              <div className="grid gap-2">
                <CampoImporte label="Efectivo recibido" value={recibido} onChange={setRecibido} disabled={busy} />
                <div className="sv-opts-row">
                  {[efectivo / 100, ...billetes(efectivo / 100)].map((v) => (
                    <button key={v} type="button" className="sv-choice" data-mono="1"
                      data-on={recibidoCent === centavos(v) ? '1' : '0'} aria-pressed={recibidoCent === centavos(v)}
                      disabled={busy} onClick={() => setRecibido(String(v))}>
                      {centavos(v) === efectivo ? `Justo ${money(v)}` : redondear(v)}
                    </button>
                  ))}
                </div>
                {efectivoInvalido && (
                  <p className="sv-hint" role="alert">{recibidoCent == null
                    ? 'Ingresa un importe con hasta dos decimales.'
                    : `Faltan ${money(faltante / 100)} en efectivo.`}</p>
                )}
              </div>
            )}
            {metodo === 'CARD' || (metodo === 'mixto' && (leerCentavos(mixto.CARD) ?? 0) > 0)
              ? <p className="sv-foot-note">Registra aquí el pago que ya hiciste en la terminal.</p>
              : null}
          </>
        )}
        {!!contexto?.recibos.length && (
          <details>
            <summary className="cursor-pointer text-sm font-semibold">Recibos de abonos</summary>
            <ul className="mt-2 grid gap-3">
              {contexto.recibos.map((r) => (
                <li key={r.intentoId}>
                  <Fila label={`Recibo ${r.intentoId.slice(0, 8)}`} valor={money(r.cobrado)} />
                  <p className="sv-foot-note"><FechaCobro at={r.at} /></p>
                  {r.pagos.map((p) => (
                    <div key={p.method}>
                      <Fila label={PAYMENT_LABEL[p.method]} valor={money(p.amount)} />
                      {p.cashReceived != null && (
                        <p className="sv-foot-note">Recibido {money(p.cashReceived)} · vuelto {money(p.cashReceived - p.amount)}</p>
                      )}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </details>
        )}
        {!!contexto?.historial.length && (
          <details>
            <summary className="cursor-pointer text-sm font-semibold">Historial de cobros</summary>
            <ul className="mt-2 grid gap-2">
              {contexto.historial.map((p) => (
                <li key={p.id}>
                  <Fila label={`${p.kind === 'REFUND' ? 'Devolución · ' : ''}${PAYMENT_LABEL[p.method]}`} valor={money(p.amount)} />
                  <p className="sv-foot-note">
                    <FechaCobro at={p.at} />
                    {p.cashReceived != null && ` · Recibido ${money(p.cashReceived)}`}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </HojaOperativa>
  );
}

function alternar(valores: string[], id: string) {
  return valores.includes(id) ? valores.filter((v) => v !== id) : [...valores, id];
}

function FechaCobro({ at }: { at: string }) {
  return <time dateTime={at}>{new Date(at).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' })}</time>;
}

function PartePagada({ parte, money }: { parte: RepartoCobro['partes'][number]; money: (n: number) => string }) {
  return (
    <div className="grid gap-1">
      <Fila label={`Parte ${parte.numero} · Pagada`} valor={money(parte.importe)} tone="ok" />
      <p className="sv-foot-note">
        {parte.recibo?.pagos?.map((pago) => PAYMENT_LABEL[pago.method]).join(' + ')}
        {parte.recibo?.intentoId && ` · Recibo ${parte.recibo.intentoId.slice(0, 8)}`}
      </p>
    </div>
  );
}

function CampoImporte({ label, value, onChange, disabled }: {
  label: string; value: string; onChange: (value: string) => void; disabled: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      {label}
      <input className="sv-field" inputMode="decimal" autoComplete="off" maxLength={11}
        value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </label>
  );
}

function Fila({ label, valor, tone, destacada = false }: {
  label: string; valor: string; tone?: 'ok'; destacada?: boolean;
}) {
  return (
    <div className="sv-cobro-fila" data-destacada={destacada || undefined}>
      <span>{label}</span>
      <Mono className="sv-cobro-importe" size={destacada ? 21 : 14} weight={destacada ? 600 : 500}
        color={tone === 'ok' ? 'var(--c-ok)' : undefined}>{valor}</Mono>
    </div>
  );
}
