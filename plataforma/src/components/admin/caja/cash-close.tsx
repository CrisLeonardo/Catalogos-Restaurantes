'use client';

/* ============================================================
   NEGOCIO › CAJA — el cierre del día, en tres pasos
   ------------------------------------------------------------
   El arqueo vivía al final del scroll de Finanzas: once casillas
   idénticas y el cuadre hasta abajo, después de enviar. Cerrar caja
   es tarea de todas las noches, no un apéndice de un reporte.

   Lo que cambia, y por qué:

     · Tres pasos en vez de un formulario. Contar, anotar lo que
       salió y repartir propinas son tres tareas distintas, y
       mezclarlas en una sola pantalla es lo que hacía que nadie
       anotara los gastos.
     · El cuadre se ve MIENTRAS se cuenta, no al final. Se recalcula
       con cada tecla: si falta dinero, se descubre con el billete en
       la mano, no cuando ya se guardó todo.
     · Las casillas miden 44 px en escritorio y 56 en el teléfono,
       porque esto se hace de noche, con prisa y con dinero en la
       mano.
     · Se puede dejar a medias. Entra un cliente a las 22:40 y el
       conteo no se pierde por eso.

   El cuadre real lo calcula SIEMPRE el servidor (`closeCaja`): aquí
   se pinta el mismo número para que no haya sorpresas al guardar,
   pero lo que queda escrito no depende de esta pantalla.
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Icon } from '@/components/icons';
import { DENOM_FIELDS } from '@/lib/finanzas-constants';
import {
  addCashExpense, deleteCashExpense, saveCajaDraft, discardCajaDraft, closeCaja, abrirTurno,
  type CajaState, type TipShare, type CajaCloseResult,
} from '@/lib/actions/finanzas';
import type { Pendientes } from '@/lib/caja/turno-servidor';
import { corteAHora } from '@/lib/caja/dia';
import { fmtMoney } from '@/lib/money';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import CobrosDelTurno from './cobros-del-turno';
import { Leo } from '@/components/leo';
import { Rodillo } from '@/components/ui/rodillo';
import { Confeti } from '@/components/confeti';

const BILLETES = DENOM_FIELDS.filter((d) => d.kind === 'B');
const MONEDAS = DENOM_FIELDS.filter((d) => d.kind === 'M');

/* Con separador de miles. «Q4292.00» obliga a contar los dígitos con el
   dedo para saber si son cuatro mil o cuarenta y dos mil, y este número
   se lee de noche, con prisa. */
const money = (n: number) => fmtMoney(n);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** "22:40" en la zona del restaurante. */
function hora(iso: string | null | undefined, tz: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz });
  } catch {
    return iso.slice(11, 16);
  }
}

/** En qué paso va el cierre. El dato vive en la nube (el turno abierto);
    el cursor es de este aparato: retomar en la tablet donde lo dejaste no
    obliga a que el teléfono del dueño abra en el mismo sitio. */
type Paso = 1 | 2 | 3;
const PASO_KEY = 'leogin:caja-paso';

interface Props {
  restaurantId: string;
  state: CajaState;
  /** "Martes 1 de septiembre" — ya en el idioma y la zona del restaurante. */
  dateLabel: string;
  cashierName: string;
  restaurantName: string;
  timezone: string;
}

export default function CashClose({ restaurantId, state, dateLabel, cashierName, restaurantName, timezone }: Props) {
  /* Las acciones revalidan la ruta, pero el panel vive detrás de un
     subdominio reescrito y la página no siempre se repinta sola: se pide
     de nuevo a mano después de cada cambio de dinero. */
  const router = useRouter();
  const refrescar = useCallback(() => router.refresh(), [router]);

  const [paso, setPaso] = useState<Paso>(1);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(PASO_KEY));
      if (v === 1 || v === 2 || v === 3) setPaso(v);
    } catch { /* sin almacenamiento: se empieza por contar */ }
  }, []);
  const irA = useCallback((p: Paso) => {
    setPaso(p);
    try { localStorage.setItem(PASO_KEY, String(p)); } catch { /* no-op */ }
  }, []);

  /* El turno abierto de verdad trae su fondo: el cierre no lo cambia. */
  const abierto = !!state.shift?.openedAt;

  /* ── El conteo ────────────────────────────────────────────── */
  const [counts, setCounts] = useState<Record<string, number>>(state.draft?.counts ?? {});
  const [opening, setOpening] = useState<string>(String(state.shift?.openingFloat ?? state.draft?.openingFloat ?? 0));
  const [shift, setShift] = useState(state.shift?.shiftLabel ?? state.draft?.shiftLabel ?? '');
  const [notes, setNotes] = useState(state.draft?.notes ?? '');
  useEffect(() => {
    // Al abrir el turno desde otro aparato, el fondo es el suyo.
    if (abierto) setOpening(String(state.shift?.openingFloat ?? 0));
  }, [abierto, state.shift?.openingFloat]);

  /* ── El reparto de propinas ───────────────────────────────── */
  const [tips, setTips] = useState<TipShare[]>(state.draft?.tips ?? state.tips);
  useEffect(() => {
    // Si todavía no se ha tocado el reparto, sigue lo que dice el turno:
    // una propina que entra a las 22:30 tiene que aparecer.
    if (!state.draft?.tips) setTips(state.tips);
  }, [state.tips, state.draft?.tips]);

  const [aviso, setAviso] = useState<{ text: string; bad: boolean } | null>(null);
  const [guardando, startSave] = useTransition();
  const [cerrado, setCerrado] = useState<CajaCloseResult | null>(null);
  /** El cierre se detuvo porque queda algo sin cobrar. */
  const [porConfirmar, setPorConfirmar] = useState<Pendientes | null>(null);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4500);
    return () => clearTimeout(t);
  }, [aviso]);

  /* ── El cuadre, a cada tecla ──────────────────────────────── */
  const openNum = Math.max(0, parseFloat(opening) || 0);
  const centavos = useMemo(
    () => DENOM_FIELDS.reduce((s, d) => s + d.centavos * (counts[d.field] || 0), 0),
    [counts],
  );
  const contado = centavos / 100;
  const ventasEfectivo = state.summary.expectedCash;
  const gastos = state.expensesTotal;
  const esperadoEnCaja = r2(openNum + ventasEfectivo - gastos);
  const diferencia = r2(contado - esperadoEnCaja);
  const cuadra = Math.abs(diferencia) < 0.005;
  const hayConteo = centavos > 0;
  const puedeCerrar = hayConteo || esperadoEnCaja <= 0;

  /* Desde cuándo cuenta: «desde el cierre de Ana a las 15:00» o «desde
     las 05:00», que es lo que el cajero necesita para creerse el número. */
  const desde = state.lastClose && new Date(state.lastClose.at) >= new Date(state.periodStart)
    ? `desde el cierre de las ${hora(state.lastClose.at, timezone)}${state.lastClose.cashierName ? ` (${state.lastClose.cashierName.split(' ')[0]})` : ''}`
    : `desde las ${hora(state.periodStart, timezone)}`;

  const setCount = (field: string, val: string) => {
    const n = Math.max(0, parseInt(val, 10) || 0);
    setCounts((prev) => ({ ...prev, [field]: n }));
  };

  const payload = useCallback(() => ({
    restaurantId,
    counts,
    openingFloat: openNum,
    shiftLabel: shift,
    notes,
    tips,
  }), [restaurantId, counts, openNum, shift, notes, tips]);

  function guardarBorrador() {
    startSave(async () => {
      const res = await saveCajaDraft(payload());
      if (res.error) { setAviso({ text: res.error, bad: true }); return; }
      setAviso({ text: 'Conteo guardado en el turno. Puedes retomarlo cuando quieras.', bad: false });
      refrescar();
    });
  }

  function cerrarTurno(confirmPending = false) {
    startSave(async () => {
      const res = await closeCaja({ ...payload(), confirmPending });
      if (res.pending) { setPorConfirmar(res.pending); return; }
      if (res.error || !res.result) { setAviso({ text: res.error ?? 'No se pudo cerrar la caja.', bad: true }); return; }
      setPorConfirmar(null);
      setCerrado(res.result);
      refrescar();
      try { localStorage.removeItem(PASO_KEY); } catch { /* no-op */ }
    });
  }

  /* ── El turno ya cerrado ──────────────────────────────────── */
  if (cerrado) {
    return (
      <CierreHecho
        result={cerrado}
        dateLabel={dateLabel}
        shift={shift}
        cashierName={cashierName}
        restaurantName={restaurantName}
        timezone={timezone}
        tips={tips}
        onOtro={() => {
          setCerrado(null);
          setCounts({});
          setOpening('0');
          setShift('');
          setNotes('');
          irA(1);
        }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Contexto: qué día, qué turno, quién ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="t-display" style={{ fontSize: 18, lineHeight: 1.15 }}>Cierre del turno</div>
          {/* La fecha, el turno y quién lo abrió, en una línea. El turno se
              escribe AQUÍ y no en una tarjeta aparte: es parte de decir de
              qué cierre estamos hablando, no un paso más que hacer. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13, color: 'var(--u-text-3)', marginTop: 2 }}>
            <span>{dateLabel}</span>
            <span aria-hidden className="caja-sep-turno">·</span>
            <label htmlFor="caja-turno" className="sr-only">Nombre del turno</label>
            <input
              id="caja-turno"
              className="caja-turno"
              type="text"
              list="caja-turnos"
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              placeholder="turno (opcional)"
              size={Math.max(16, shift.length + 1)}
            />
            <datalist id="caja-turnos">
              <option value="turno mañana" />
              <option value="turno tarde" />
              <option value="turno noche" />
            </datalist>
            <span aria-hidden>·</span>
            <span>
              {abierto
                ? `abierto ${hora(state.shift?.openedAt, timezone)} por ${state.shift?.openedByName?.split(' ')[0] ?? 'caja'}`
                : cashierName}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={guardarBorrador}
          disabled={guardando || state.needsMigration}
          className="press caja-boton-suave"
          style={{ height: 38 }}
        >
          {guardando ? 'Guardando…' : 'Guardar y seguir después'}
        </button>
      </div>

      {state.needsMigration && (
        <div className="note note-danger">
          <Icon name="alertCircle" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Esta base de datos todavía no tiene la migración 145: no se pueden abrir ni cerrar turnos.
            Hay que aplicarla antes de usar la caja.
          </span>
        </div>
      )}

      {!abierto && !state.needsMigration && (
        <AbrirTurno
          restaurantId={restaurantId}
          shift={shift}
          cobradoEnEfectivo={ventasEfectivo}
          desde={desde}
          onAviso={(a) => { setAviso(a); if (!a.bad) refrescar(); }}
        />
      )}

      {state.draft && (
        <div className="caja-aviso">
          <Icon name="alertCircle" size={16} style={{ color: 'var(--c-warn)', flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 180, color: 'var(--u-text-2)' }}>
            Retomaste un conteo guardado a las {hora(state.draft.savedAt, timezone)}.
          </span>
          <button
            type="button"
            onClick={() => startSave(async () => {
              const res = await discardCajaDraft(restaurantId);
              if (res.error) { setAviso({ text: res.error, bad: true }); return; }
              setCounts({}); setNotes('');
              if (!abierto) { setOpening('0'); setShift(''); }
              irA(1);
              refrescar();
            })}
            className="press caja-boton-suave"
            style={{ height: 32, fontWeight: 600 }}
          >
            Empezar de cero
          </button>
        </div>
      )}

      {/* ── Los tres pasos ── */}
      <div className="caja-steps">
        <PasoChip n={1} titulo="Efectivo" detalle={hayConteo ? money(contado) : 'sin contar'} on={paso === 1} hecho={paso > 1} onClick={() => irA(1)} />
        <PasoChip n={2} titulo="Gastos" detalle={state.expenses.length === 0 ? 'ninguno' : `${state.expenses.length} anotado${state.expenses.length === 1 ? '' : 's'}`} on={paso === 2} hecho={paso > 2} onClick={() => irA(2)} />
        <PasoChip n={3} titulo="Propinas" detalle={state.tipsTotal > 0 ? `${money(state.tipsTotal)} por repartir` : 'sin propinas'} on={paso === 3} hecho={false} onClick={() => irA(3)} ultimo />
      </div>

      {aviso && (
        <div role="status" className={aviso.bad ? 'note note-danger' : 'caja-aviso-ok'}>
          {aviso.bad && <Icon name="alertCircle" size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
          <span>{aviso.text}</span>
        </div>
      )}

      <div className="caja-body">
        <div className="caja-main">
          {paso === 1 && (
            <PasoEfectivo
              counts={counts}
              setCount={setCount}
              opening={opening}
              setOpening={setOpening}
              fondoFijo={abierto ? { quien: state.shift?.openedByName ?? null, cuando: hora(state.shift?.openedAt, timezone) } : null}
            />
          )}
          {paso === 2 && (
            <PasoGastos
              restaurantId={restaurantId}
              state={state}
              onAviso={setAviso}
              onCambio={refrescar}
            />
          )}
          {paso === 3 && (
            <PasoPropinas
              tips={tips}
              setTips={setTips}
              total={state.tipsTotal}
              notes={notes}
              setNotes={setNotes}
            />
          )}
        </div>

        {/* La columna derecha no cambia entre pasos a propósito: el cuadre
            es la pregunta que se está contestando toda la noche. */}
        <div className="caja-side">
          <TarjetaCuadre
            ventasEfectivo={ventasEfectivo}
            devoluciones={state.refundsCash}
            desde={desde}
            gastos={gastos}
            opening={openNum}
            contado={contado}
            diferencia={diferencia}
            cuadra={cuadra}
            hayConteo={hayConteo}
          />

          <TarjetaPendientes pending={state.pending} liberadas={state.releasedUnpaid} />

          <TarjetaGastos state={state} onAnotar={() => irA(2)} />

          <div className="caja-foot">
            {paso < 3 ? (
              <button
                type="button"
                onClick={() => irA(paso === 1 ? 2 : 3)}
                className="press btn-accent caja-cta"
              >
                {paso === 1 ? 'Siguiente: gastos' : 'Siguiente: propinas'}
                <Icon name="arrowRight" size={19} strokeWidth={2} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => cerrarTurno(false)}
                disabled={guardando || !puedeCerrar || state.needsMigration}
                className="press btn-accent caja-cta"
              >
                {guardando ? 'Cerrando…' : 'Cerrar el turno'}
              </button>
            )}
            {!puedeCerrar && paso === 3 && (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--u-text-4)', lineHeight: 1.45 }}>
                Falta contar el efectivo del paso 1 para poder cerrar.
              </p>
            )}
          </div>
        </div>
      </div>

      <CobrosDelTurno
        restaurantId={restaurantId}
        cobros={state.payments}
        timezone={timezone}
        selfApproves={state.selfApproves}
        onAviso={(a) => { setAviso(a); if (!a.bad) refrescar(); }}
      />

      <p style={{ margin: 0, fontSize: 12, color: 'var(--u-text-4)', lineHeight: 1.5 }}>
        El día de caja empieza a las {corteAHora(state.dayCutoff)}: lo cobrado antes de esa hora cuenta para el día anterior.
        Se cambia en Ajustes › Horarios.
      </p>

      {porConfirmar && (
        <ConfirmarPendientes
          pending={porConfirmar}
          enviando={guardando}
          onCancelar={() => setPorConfirmar(null)}
          onCerrar={() => cerrarTurno(true)}
        />
      )}
    </div>
  );
}

/* ── Abrir el turno ───────────────────────────────────────────── */
function AbrirTurno({ restaurantId, shift, cobradoEnEfectivo, desde, onAviso }: {
  restaurantId: string;
  shift: string;
  cobradoEnEfectivo: number;
  desde: string;
  onAviso: (a: { text: string; bad: boolean }) => void;
}) {
  const [fondo, setFondo] = useState('');
  const [abriendo, start] = useTransition();
  return (
    <div className="caja-tarjeta caja-abrir">
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)' }}>El turno no se ha abierto</div>
        <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
          Ábrelo con el fondo que hay en el cajón: queda escrito quién lo abrió y con cuánto, y el cierre
          ya no lo puede cambiar.
          {cobradoEnEfectivo > 0 && ` Ya van ${money(cobradoEnEfectivo)} cobrados en efectivo ${desde}.`}
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="caja-abrir-fondo" className="caja-campo-label" style={{ margin: 0 }}>Fondo inicial</label>
          <input
            id="caja-abrir-fondo"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={fondo}
            placeholder="0.00"
            onChange={(e) => setFondo(e.target.value)}
            className="adm-field adm-field-mono"
            style={{ width: 130, height: 44, textAlign: 'right', fontSize: 18, fontWeight: 600 }}
          />
        </div>
        <button
          type="button"
          className="press btn-accent"
          disabled={abriendo}
          onClick={() => start(async () => {
            const res = await abrirTurno({ restaurantId, openingFloat: parseFloat(fondo) || 0, shiftLabel: shift });
            if (res.error) { onAviso({ text: res.error, bad: true }); return; }
            onAviso({ text: 'Turno abierto.', bad: false });
          })}
          style={{ height: 44, padding: '0 18px', borderRadius: 'var(--radius-md)', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          {abriendo ? 'Abriendo…' : 'Abrir turno'}
        </button>
      </div>
    </div>
  );
}

/* ── Lo que queda sin cobrar ──────────────────────────────────── */
function TarjetaPendientes({ pending, liberadas }: {
  pending: Pendientes;
  liberadas: CajaState['releasedUnpaid'];
}) {
  const n = pending.mesas.length + pending.domicilios.length + pending.paraLlevar.length;
  if (n === 0 && liberadas.pedidos === 0) return null;
  return (
    <div className="caja-tarjeta" style={{ gap: 8 }}>
      {n > 0 && (
        <>
          <div className="adm-label adm-label-caps" style={{ color: 'var(--u-text-3)' }}>Sin cobrar todavía</div>
          <ListaPendientes pending={pending} />
          <p style={{ margin: 0, fontSize: 12, color: 'var(--u-text-4)', lineHeight: 1.45 }}>
            No cuentan en este cuadre: entran en el turno en que se cobren.
          </p>
        </>
      )}
      {liberadas.pedidos > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.45, borderTop: n > 0 ? '1px solid var(--u-hair)' : 'none', paddingTop: n > 0 ? 8 : 0 }}>
          {liberadas.pedidos === 1 ? 'Una mesa se liberó' : `${liberadas.pedidos} pedidos de mesa se liberaron`} sin cobrar
          ({money(liberadas.total)}). No se espera ese dinero en el cajón.
        </p>
      )}
    </div>
  );
}

function ListaPendientes({ pending }: { pending: Pendientes }) {
  const filas: { k: string; nombre: string; monto: number }[] = [
    ...pending.mesas.map((m) => ({ k: `m${m.tableNumber}`, nombre: m.label, monto: m.porCobrar })),
    ...pending.domicilios.map((d) => ({ k: d.orderId, nombre: `Domicilio ${d.orderNumber.slice(-5)}`, monto: d.total })),
    ...pending.paraLlevar.map((d) => ({ k: d.orderId, nombre: `Para llevar ${d.orderNumber.slice(-5)}`, monto: d.total })),
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {filas.slice(0, 6).map((f) => (
        <div key={f.k} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
          <span style={{ color: 'var(--u-text-2)' }}>{f.nombre}</span>
          <span className="t-mono" style={{ fontWeight: 600, color: 'var(--u-text)' }}>{money(f.monto)}</span>
        </div>
      ))}
      {filas.length > 6 && (
        <span style={{ fontSize: 12, color: 'var(--u-text-4)' }}>y {filas.length - 6} más</span>
      )}
    </div>
  );
}

/** «Quedan 2 mesas abiertas y 1 domicilio sin liquidar». */
function resumenPendientes(p: Pendientes): string {
  const partes: string[] = [];
  if (p.mesas.length) partes.push(p.mesas.length === 1 ? '1 mesa abierta' : `${p.mesas.length} mesas abiertas`);
  if (p.domicilios.length) partes.push(p.domicilios.length === 1 ? '1 domicilio sin liquidar' : `${p.domicilios.length} domicilios sin liquidar`);
  if (p.paraLlevar.length) partes.push(p.paraLlevar.length === 1 ? '1 pedido para llevar sin cobrar' : `${p.paraLlevar.length} pedidos para llevar sin cobrar`);
  if (partes.length <= 1) return `Queda ${partes[0] ?? ''}`;
  return `Quedan ${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

function ConfirmarPendientes({ pending, enviando, onCancelar, onCerrar }: {
  pending: Pendientes; enviando: boolean; onCancelar: () => void; onCerrar: () => void;
}) {
  const una = pending.mesas.length + pending.domicilios.length + pending.paraLlevar.length === 1;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancelar(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{resumenPendientes(pending)}</DialogTitle>
          <DialogDescription>
            {una
              ? `Son ${money(pending.total)}. No entra en este cuadre porque no se ha cobrado: se cuenta en el turno en que se cobre. Si ya pagaron, cóbrala antes de cerrar.`
              : `Suman ${money(pending.total)}. No entran en este cuadre porque no se han cobrado: se cuentan en el turno en que se cobren. Si ya pagaron, cóbralas antes de cerrar.`}
          </DialogDescription>
        </DialogHeader>
        <ListaPendientes pending={pending} />
        <DialogFooter>
          <Button variant="secondary" onClick={onCancelar}>{una ? 'Volver a cobrarla' : 'Volver a cobrarlas'}</Button>
          <Button onClick={onCerrar} disabled={enviando}>{enviando ? 'Cerrando…' : 'Cerrar el turno igual'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── El indicador de pasos ────────────────────────────────────── */
function PasoChip({ n, titulo, detalle, on, hecho, onClick, ultimo }: {
  n: number; titulo: string; detalle: string; on: boolean; hecho: boolean;
  onClick: () => void; ultimo?: boolean;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        className="press"
        style={{
          display: 'flex', alignItems: 'center', gap: 11, flex: 1, minWidth: 0,
          border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
        }}
        aria-current={on ? 'step' : undefined}
      >
        <span
          className="t-mono"
          style={{
            display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 'var(--radius-full)', flexShrink: 0,
            fontSize: 13, fontWeight: 700,
            background: on ? 'var(--adm-accent-fill, var(--brand-accent))' : 'color-mix(in srgb, var(--u-text) 8%, transparent)',
            color: on ? 'var(--brand-on-accent, #fff)' : 'var(--u-text-2)',
          }}
        >
          {hecho ? '✓' : n}
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: on ? 'var(--brand-accent-ink)' : 'var(--u-text-2)' }}>
            {titulo}
          </span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--u-text-4)', marginTop: 1 }}>{detalle}</span>
        </span>
      </button>
      {!ultimo && (
        <span
          aria-hidden
          style={{
            flex: 1, height: 2, borderRadius: 'var(--radius-full)', minWidth: 20,
            background: on ? 'var(--adm-accent-fill, var(--brand-accent))' : 'color-mix(in srgb, var(--u-text) 12%, transparent)',
          }}
        />
      )}
    </div>
  );
}

/* ── Paso 1 · contar ──────────────────────────────────────────── */
function PasoEfectivo({ counts, setCount, opening, setOpening, fondoFijo }: {
  counts: Record<string, number>;
  setCount: (field: string, val: string) => void;
  opening: string;
  setOpening: (v: string) => void;
  /** El turno se abrió con fondo: se enseña, no se edita. */
  fondoFijo: { quien: string | null; cuando: string } | null;
}) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span className="t-display" style={{ flex: 1, minWidth: 160, fontSize: 18, lineHeight: 1.15 }}>
          Cuenta el efectivo
        </span>
        <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>Escribe cuántos hay de cada uno</span>
      </div>

      <div className="caja-cards">
        <Tarjeta titulo="Billetes">
          {BILLETES.map((d) => (
            <Denom key={d.field} field={d.field} label={d.label} centavos={d.centavos} qty={counts[d.field] || 0} onChange={setCount} />
          ))}
        </Tarjeta>

        <Tarjeta titulo="Monedas">
          {MONEDAS.map((d) => (
            <Denom key={d.field} field={d.field} label={d.label} centavos={d.centavos} qty={counts[d.field] || 0} onChange={setCount} />
          ))}

          {fondoFijo ? (
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingTop: 10, borderTop: '1px solid var(--u-hair)' }}>
              <span style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.4 }}>
                Fondo al abrir
                <span style={{ display: 'block', color: 'var(--u-text-4)' }}>
                  {[fondoFijo.quien?.split(' ')[0], fondoFijo.cuando].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="t-mono" style={{ fontSize: 18, fontWeight: 600, color: 'var(--u-text)' }}>
                {money(parseFloat(opening) || 0)}
              </span>
            </div>
          ) : (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="caja-fondo" style={{ fontSize: 12, color: 'var(--u-text-3)' }}>
                Fondo con el que abriste
              </label>
              <input
                id="caja-fondo"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
                aria-describedby="caja-fondo-ayuda"
                className="adm-field adm-field-mono"
                style={{ height: 44, padding: '0 12px', textAlign: 'right', fontSize: 18, fontWeight: 600 }}
              />
              {/* Sin esta línea nadie sabe si el fondo suma o resta al cuadre. */}
              <p id="caja-fondo-ayuda" style={{ margin: 0, fontSize: 11, lineHeight: 1.4, color: 'var(--u-text-4)' }}>
                Se descuenta del total contado para saber si cuadra.
              </p>
            </div>
          )}
        </Tarjeta>
      </div>
    </>
  );
}

function Denom({ field, label, centavos, qty, onChange }: {
  field: string; label: string; centavos: number; qty: number;
  onChange: (field: string, val: string) => void;
}) {
  const sub = (qty * centavos) / 100;
  const id = `denom-${field}`;
  const esBillete = centavos >= 500;
  /* El "Q200" era un <span> suelto: once casillas idénticas sin nombre de
     ningún tipo. Quien cuenta la caja de noche es justo el perfil menos
     técnico del local, y para cualquier lectura asistida eran once campos
     mudos. Ahora es un <label> de verdad que dice qué se escribe ahí. */
  const descripcion = esBillete ? `Cuántos billetes de ${label}` : `Cuántas monedas de ${label}`;
  return (
    <div className="caja-denom">
      <label htmlFor={id} className="caja-denom-label">
        {label}
        <span className="sr-only"> — {descripcion}</span>
      </label>
      <input
        id={id}
        name={field}
        type="number"
        inputMode="numeric"
        min="0"
        step="1"
        value={qty || ''}
        placeholder="0"
        aria-label={descripcion}
        aria-describedby={qty > 0 ? `${id}-sub` : undefined}
        data-filled={qty > 0 ? '1' : '0'}
        onChange={(e) => onChange(field, e.target.value)}
      />
      <span id={`${id}-sub`} className="caja-denom-sub" data-filled={qty > 0 ? '1' : '0'}>
        {money(sub)}
      </span>
    </div>
  );
}

/* ── Paso 2 · gastos ──────────────────────────────────────────── */
function PasoGastos({ restaurantId, state, onAviso, onCambio }: {
  restaurantId: string;
  state: CajaState;
  onAviso: (a: { text: string; bad: boolean }) => void;
  onCambio: () => void;
}) {
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [pending, start] = useTransition();
  const conceptRef = useRef<HTMLInputElement | null>(null);

  function anotar() {
    const monto = parseFloat(amount);
    start(async () => {
      const res = await addCashExpense({
        restaurantId, concept, amount: Number.isFinite(monto) ? monto : 0, paidBy,
      });
      if (res.error) { onAviso({ text: res.error, bad: true }); return; }
      setConcept(''); setAmount(''); setPaidBy('');
      onCambio();
      conceptRef.current?.focus();
    });
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span className="t-display" style={{ flex: 1, minWidth: 160, fontSize: 18, lineHeight: 1.15 }}>
          ¿Qué salió de la caja?
        </span>
        <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>Mercado, gas, mandados…</span>
      </div>

      <Tarjeta titulo="Gastos de hoy">
        {state.expenses.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
            Todavía no hay ninguno. Si hoy no se pagó nada con dinero de la caja, sigue al paso 3.
          </p>
        ) : state.expenses.map((g, i) => (
          <div
            key={g.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontSize: 13,
              borderTop: i === 0 ? 'none' : '1px solid var(--u-hair)', paddingTop: i === 0 ? 0 : 8,
            }}
          >
            <span style={{ flex: 1, minWidth: 0, color: 'var(--u-text-2)' }}>
              {g.concept}
              {g.paid_by && (
                <span style={{ display: 'block', fontSize: 12, color: 'var(--u-text-4)', marginTop: 1 }}>
                  {g.paid_by}
                </span>
              )}
            </span>
            <span className="t-mono" style={{ fontWeight: 600, color: 'var(--u-text)' }}>{money(g.amount)}</span>
            <button
              type="button"
              onClick={() => start(async () => {
                const res = await deleteCashExpense(restaurantId, g.id);
                if (res.error) { onAviso({ text: res.error, bad: true }); return; }
                onCambio();
              })}
              disabled={pending}
              aria-label={`Quitar el gasto ${g.concept}`}
              className="press"
              style={{
                display: 'grid', placeItems: 'center', width: 32, height: 32, flexShrink: 0,
                borderRadius: 'var(--radius-md)', border: '1px solid var(--u-hair-2)', background: 'none',
                color: 'var(--u-text-3)', cursor: 'pointer',
              }}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}

        <div style={{ height: 1, background: 'var(--u-hair)', margin: '4px 0' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            ref={conceptRef}
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder="En qué se gastó (ej. mercado, gas)"
            aria-label="Concepto del gasto"
            className="adm-field" style={campo}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="Monto"
              aria-label="Monto del gasto"
              className="adm-field adm-field-mono" style={{ ...campo, flex: '1 1 120px', width: 'auto', textAlign: 'right' }}
            />
            <input
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              placeholder="Quién lo pagó (opcional)"
              aria-label="Quién pagó el gasto"
              className="adm-field" style={{ ...campo, flex: '2 1 160px', width: 'auto' }}
            />
          </div>
          <button
            type="button"
            onClick={anotar}
            disabled={pending || !concept.trim() || !(parseFloat(amount) > 0)}
            className="press"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, height: 46,
              borderRadius: 'var(--radius-md)', border: '1px dashed var(--u-hair-2)', background: 'none',
              color: 'var(--u-text-2)', fontSize: 14, fontWeight: 600,
              cursor: pending ? 'default' : 'pointer',
              opacity: pending || !concept.trim() || !(parseFloat(amount) > 0) ? 0.55 : 1,
            }}
          >
            <Icon name="plus" size={15} strokeWidth={2} />
            Anotar un gasto
          </button>
        </div>
      </Tarjeta>
    </>
  );
}

/* ── Paso 3 · propinas ────────────────────────────────────────── */
function PasoPropinas({ tips, setTips, total, notes, setNotes }: {
  tips: TipShare[];
  setTips: (t: TipShare[]) => void;
  total: number;
  notes: string;
  setNotes: (v: string) => void;
}) {
  const repartido = r2(tips.reduce((s, t) => s + (Number(t.amount) || 0), 0));
  const resto = r2(total - repartido);

  function partesIguales() {
    if (tips.length === 0) return;
    const cada = Math.floor((total / tips.length) * 100) / 100;
    const ajuste = r2(total - cada * tips.length);
    setTips(tips.map((t, i) => ({ ...t, amount: i === 0 ? r2(cada + ajuste) : cada })));
  }

  function porLoAtendido() {
    const mesas = tips.reduce((s, t) => s + t.tables, 0);
    if (mesas === 0) return;
    let acumulado = 0;
    const next = tips.map((t, i) => {
      if (i === tips.length - 1) return { ...t, amount: r2(total - acumulado) };
      const monto = Math.floor((total * t.tables / mesas) * 100) / 100;
      acumulado = r2(acumulado + monto);
      return { ...t, amount: monto };
    });
    setTips(next);
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span className="t-display" style={{ flex: 1, minWidth: 160, fontSize: 18, lineHeight: 1.15 }}>
          Las propinas del turno
        </span>
        <span className="t-mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--u-text)' }}>{money(total)}</span>
      </div>

      <Tarjeta titulo="Cómo se reparten">
        {tips.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
            Hoy no entró ninguna propina. Puedes cerrar el turno igual.
          </p>
        ) : (
          <>
            {tips.map((t, i) => (
              <div key={`${t.profileId ?? 'casa'}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48 }}>
                <span
                  className="t-mono"
                  style={{
                    display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 'var(--radius-full)', flexShrink: 0,
                    background: 'color-mix(in srgb, var(--brand-accent) 10%, transparent)',
                    color: 'var(--brand-accent-ink)', fontSize: 13, fontWeight: 700,
                  }}
                >
                  {t.name.trim().charAt(0).toUpperCase() || '·'}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--u-text)' }}>{t.name}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--u-text-4)', marginTop: 1 }}>
                    {t.tables === 0 ? 'sin mesas' : `${t.tables} ${t.tables === 1 ? 'mesa atendida' : 'mesas atendidas'}`}
                  </span>
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={t.amount}
                  aria-label={`Propina para ${t.name}`}
                  onChange={(e) => {
                    const v = Math.max(0, parseFloat(e.target.value) || 0);
                    setTips(tips.map((x, j) => (j === i ? { ...x, amount: r2(v) } : x)));
                  }}
                  className="adm-field adm-field-mono"
                  style={{ width: 110, height: 44, padding: '0 12px', textAlign: 'right', flexShrink: 0, fontSize: 16, fontWeight: 600 }}
                />
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              <BotonSuave onClick={partesIguales}>Partes iguales</BotonSuave>
              <BotonSuave onClick={porLoAtendido}>Según lo atendido</BotonSuave>
            </div>

            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                paddingTop: 8, borderTop: '1px solid var(--u-hair)', fontSize: 13,
                color: Math.abs(resto) < 0.005 ? 'var(--u-text-3)' : 'var(--c-warn)',
              }}
            >
              <span>{Math.abs(resto) < 0.005 ? 'Todo repartido' : resto > 0 ? 'Falta repartir' : 'Repartido de más'}</span>
              <span className="t-mono" style={{ fontWeight: 600 }}>{money(Math.abs(resto))}</span>
            </div>
          </>
        )}
      </Tarjeta>

      <Tarjeta titulo="Observaciones">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Incidentes, entrega de fondo, lo que haga falta…"
          aria-label="Observaciones del cierre"
          className="adm-field" style={campo}
        />
      </Tarjeta>
    </>
  );
}

/* ── La tarjeta del cuadre ────────────────────────────────────── */
function TarjetaCuadre({ ventasEfectivo, devoluciones, desde, gastos, opening, contado, diferencia, cuadra, hayConteo }: {
  ventasEfectivo: number; devoluciones: number; desde: string; gastos: number; opening: number; contado: number;
  diferencia: number; cuadra: boolean; hayConteo: boolean;
}) {
  return (
    <div style={tarjeta}>
      {/* Lo COBRADO, no lo vendido: una mesa todavía comiendo no está aquí. */}
      <div>
        <Linea label="Cobrado en efectivo" value={money(r2(ventasEfectivo + devoluciones))} />
        <div style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 2 }}>{desde}</div>
      </div>
      {devoluciones > 0 && <Linea label="Devuelto a clientes" value={`−${money(devoluciones)}`} />}
      {gastos > 0 && <Linea label="Gastos pagados de caja" value={`−${money(gastos)}`} />}
      <Linea label="Fondo inicial" value={money(opening)} />
      <div style={{ height: 1, background: 'var(--u-hair)' }} />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)' }}>Total contado</span>
        <span className="t-mono" style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--u-text)' }}>
          {money(contado)}
        </span>
      </div>

      {/* El cuadre se recalcula a cada tecla, no al enviar. `aria-live` para
          que quien no ve la pantalla también se entere de que ya cuadró. */}
      {hayConteo && (
        <div
          aria-live="polite"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            padding: '12px 14px', borderRadius: 'var(--radius-lg)', fontSize: 14, fontWeight: 600,
            border: `1px solid ${cuadra ? 'var(--c-ok-line)' : 'color-mix(in srgb, var(--brand-accent) 34%, transparent)'}`,
            background: cuadra ? 'var(--c-ok-bg)' : 'color-mix(in srgb, var(--brand-accent) 8%, transparent)',
            color: cuadra ? 'var(--c-ok)' : 'var(--brand-accent-ink)',
          }}
        >
          {/* Al cuadrar, el aviso se estampa y la palomita se dibuja sola
              (`.adm-cuadra` en admin.css). La `key` hace que vuelva a pasar
              cada vez que llega a cuadrar, no en cada tecla. */}
          {cuadra ? (
            <span key="cuadra" className="adm-cuadra" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
                <path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Caja cuadrada
            </span>
          ) : (
            <span key="no">{diferencia > 0 ? 'Sobran' : 'Faltan'}</span>
          )}
          <span className="t-mono">
            {cuadra ? `+${money(0)}` : money(Math.abs(diferencia))}
          </span>
        </div>
      )}
    </div>
  );
}

function TarjetaGastos({ state, onAnotar }: { state: CajaState; onAnotar: () => void }) {
  return (
    <div style={{ ...tarjeta, gap: 9 }}>
      <div className="adm-label adm-label-caps" style={{ color: 'var(--u-text-3)' }}>Gastos de hoy</div>
      {state.expenses.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--u-text-4)', lineHeight: 1.45 }}>
          Nada salió de la caja todavía.
        </p>
      ) : state.expenses.map((g) => (
        <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
          <span style={{ flex: 1, minWidth: 0, color: 'var(--u-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {g.concept}
          </span>
          <span className="t-mono" style={{ fontWeight: 600, color: 'var(--u-text)' }}>{money(g.amount)}</span>
        </div>
      ))}
      <button
        type="button"
        onClick={onAnotar}
        className="press"
        style={{
          display: 'flex', alignItems: 'center', gap: 9, height: 42, padding: '0 12px',
          borderRadius: 'var(--radius-md)', border: '1px dashed var(--u-hair-2)', background: 'none',
          color: 'var(--u-text-3)', fontSize: 13, cursor: 'pointer',
        }}
      >
        <Icon name="plus" size={15} strokeWidth={2} />
        Anotar un gasto
      </button>
      {state.expensesTotal > 0 && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--u-hair)' }}>
          <span style={{ fontSize: 13, color: 'var(--u-text-2)' }}>Salió de la caja</span>
          <span className="t-mono" style={{ fontWeight: 700, fontSize: 16, color: 'var(--u-text)' }}>
            {money(state.expensesTotal)}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── El turno cerrado ─────────────────────────────────────────── */
function CierreHecho({ result, dateLabel, shift, cashierName, restaurantName, timezone, tips, onOtro }: {
  result: CajaCloseResult;
  dateLabel: string;
  shift: string;
  cashierName: string;
  restaurantName: string;
  timezone: string;
  tips: TipShare[];
  onOtro: () => void;
}) {
  const cuadra = Math.abs(result.difference) < 0.005;
  const periodo = `de ${hora(result.periodStart, timezone)} a ${hora(result.closedAt, timezone)}`;

  /* El resumen por WhatsApp es cómo se manda de verdad un cierre a un
     dueño que no está en el local: texto plano, sin adjuntos y sin
     pedirle que entre a ninguna parte. */
  const texto = [
    `Cierre de caja · ${restaurantName}`,
    `${dateLabel}${shift.trim() ? ` · ${shift.trim()}` : ''} · ${periodo} · ${cashierName}`,
    result.dia && result.dia.pedidos > 0
      ? `Hoy vendiste ${money(result.dia.ventas)} en ${result.dia.pedidos} ${result.dia.pedidos === 1 ? 'pedido' : 'pedidos'}${result.dia.record ? ` · ${result.dia.record.texto}` : ''}`
      : null,
    '',
    `Cobrado en efectivo: ${money(r2(result.expected + result.refundsCash))}`,
    result.refundsCash > 0 ? `Devuelto a clientes: −${money(result.refundsCash)}` : null,
    `Gastos de caja: −${money(result.expensesTotal)}`,
    `Fondo inicial: ${money(result.opening)}`,
    `Total contado: ${money(result.counted)}`,
    cuadra ? 'Caja cuadrada' : result.difference > 0
      ? `Sobran ${money(Math.abs(result.difference))}`
      : `Faltan ${money(Math.abs(result.difference))}`,
    result.tipsTotal > 0 ? '' : null,
    result.tipsTotal > 0 ? `Propinas: ${money(result.tipsTotal)}` : null,
    result.pendingTotal > 0 ? '' : null,
    result.pendingTotal > 0 ? `Quedó sin cobrar: ${money(result.pendingTotal)} (entra en el turno en que se cobre)` : null,
    ...tips.filter((t) => t.amount > 0).map((t) => `· ${t.name}: ${money(t.amount)}`),
  ].filter((l) => l !== null).join('\n');

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 560 }}>
      <div>
        <div className="t-display" style={{ fontSize: 22, lineHeight: 1.15 }}>Turno cerrado</div>
        <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 3 }}>
          {[dateLabel, shift.trim() || null, periodo, cashierName].filter(Boolean).join(' · ')}
        </div>
      </div>

      {/* El final del día (PLAN_MOMENTOS_PICO P5): lo vendido en todo el día
          sube solo y, si es récord de verdad, Leo celebra con confeti. */}
      {result.dia && result.dia.pedidos > 0 && (
        <div style={{ ...tarjeta, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {result.dia.record && <Confeti piezas={28} alcance={0.7} />}
            <Leo id="leo-cierre-caja" expresion={result.dia.record ? 'feliz' : 'saluda'} size={58} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--u-text-3)' }}>Hoy vendiste</div>
            <div className="t-mono" style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--u-text)' }}>
              <Rodillo texto={money(result.dia.ventas)} />
            </div>
            <div style={{ fontSize: 13, color: 'var(--u-text-2)', marginTop: 2 }}>
              {result.dia.pedidos} {result.dia.pedidos === 1 ? 'pedido' : 'pedidos'}
              {result.dia.record && (
                <strong style={{ color: 'var(--brand-accent-ink, var(--brand-accent))' }}> · {result.dia.record.texto}</strong>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={tarjeta} id="caja-resumen">
        <Linea label="Cobrado en efectivo" value={money(r2(result.expected + result.refundsCash))} />
        {result.refundsCash > 0 && <Linea label="Devuelto a clientes" value={`−${money(result.refundsCash)}`} />}
        {result.expensesTotal > 0 && <Linea label="Gastos pagados de caja" value={`−${money(result.expensesTotal)}`} />}
        <Linea label="Fondo inicial" value={money(result.opening)} />
        <div style={{ height: 1, background: 'var(--u-hair)' }} />
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)' }}>Total contado</span>
          <span className="t-mono" style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em' }}>{money(result.counted)}</span>
        </div>
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            padding: '12px 14px', borderRadius: 'var(--radius-lg)', fontSize: 14, fontWeight: 600,
            border: `1px solid ${cuadra ? 'var(--c-ok-line)' : 'color-mix(in srgb, var(--brand-accent) 34%, transparent)'}`,
            background: cuadra ? 'var(--c-ok-bg)' : 'color-mix(in srgb, var(--brand-accent) 8%, transparent)',
            color: cuadra ? 'var(--c-ok)' : 'var(--brand-accent-ink)',
          }}
        >
          <span>{cuadra ? 'Caja cuadrada' : result.difference > 0 ? 'Sobran' : 'Faltan'}</span>
          <span className="t-mono">{cuadra ? `+${money(0)}` : money(Math.abs(result.difference))}</span>
        </div>
        {result.pendingTotal > 0 && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.45 }}>
            Quedó sin cobrar {money(result.pendingTotal)}: entra en el turno en que se cobre.
          </p>
        )}
        {result.tipsTotal > 0 && (
          <>
            <div className="adm-label" style={{ color: 'var(--u-text-3)', marginTop: 4 }}>Propinas repartidas</div>
            {tips.filter((t) => t.amount > 0).map((t, i) => (
              <Linea key={i} label={t.name} value={money(t.amount)} />
            ))}
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
        <BotonSuave onClick={() => window.print()}>
          <Icon name="print" size={15} style={{ marginRight: 6, verticalAlign: '-2px' }} />
          Imprimir
        </BotonSuave>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="press"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 14px',
            borderRadius: 'var(--radius-md)', border: '1px solid var(--u-hair-2)', textDecoration: 'none',
            color: 'var(--u-text-2)', fontSize: 13, fontWeight: 500,
          }}
        >
          <Icon name="whatsapp" size={15} />
          Enviar por WhatsApp
        </a>
        <BotonSuave onClick={onOtro}>Abrir el siguiente turno</BotonSuave>
      </div>
    </div>
  );
}

/* ── Piezas menudas ───────────────────────────────────────────── */

const tarjeta: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10, padding: 16,
  borderRadius: 'var(--radius-lg)', border: '1px solid var(--u-hair)',
  background: 'var(--adm-card)', boxShadow: 'var(--adm-shadow-xs)',
};

/* Con `.adm-field`: solo lo que este formulario tiene de suyo (más alto). */
const campo: React.CSSProperties = { height: 46, padding: '0 13px' };

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ ...tarjeta, gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--u-text-4)' }}>
        {titulo}
      </div>
      {children}
    </div>
  );
}

function Linea({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ fontSize: 13, color: 'var(--u-text-2)' }}>{label}</span>
      <span className="t-mono" style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.02em', color: 'var(--u-text)' }}>
        {value}
      </span>
    </div>
  );
}

function BotonSuave({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press"
      style={{
        display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 14px',
        borderRadius: 'var(--radius-md)', border: '1px solid var(--u-hair-2)', background: 'none',
        color: 'var(--u-text-2)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
