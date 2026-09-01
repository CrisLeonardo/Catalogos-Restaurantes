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
  addCashExpense, deleteCashExpense, saveCajaDraft, discardCajaDraft, closeCaja,
  type CajaState, type TipShare, type CajaCloseResult,
} from '@/lib/actions/finanzas';

const BILLETES = DENOM_FIELDS.filter((d) => d.kind === 'B');
const MONEDAS = DENOM_FIELDS.filter((d) => d.kind === 'M');

/* Con separador de miles. «Q4292.00» obliga a contar los dígitos con el
   dedo para saber si son cuatro mil o cuarenta y dos mil, y este número
   se lee de noche, con prisa. */
const money = (n: number) => `Q${n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** En qué paso va el cierre. El dato vive en la nube (el borrador); el
    cursor es de este aparato: retomar en la tablet donde lo dejaste no
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
}

export default function CashClose({ restaurantId, state, dateLabel, cashierName, restaurantName }: Props) {
  const router = useRouter();

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

  /* ── El conteo ────────────────────────────────────────────── */
  const [counts, setCounts] = useState<Record<string, number>>(state.draft?.counts ?? {});
  const [opening, setOpening] = useState<string>(String(state.draft?.openingFloat ?? 0));
  const [shift, setShift] = useState(state.draft?.shiftLabel ?? '');
  const [notes, setNotes] = useState(state.draft?.notes ?? '');

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
      setAviso({ text: 'Cierre guardado. Puedes retomarlo cuando quieras.', bad: false });
      router.refresh();
    });
  }

  function cerrarTurno() {
    startSave(async () => {
      const res = await closeCaja(payload());
      if (res.error || !res.result) { setAviso({ text: res.error ?? 'No se pudo cerrar la caja.', bad: true }); return; }
      setCerrado(res.result);
      try { localStorage.removeItem(PASO_KEY); } catch { /* no-op */ }
      router.refresh();
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
          <div className="t-display" style={{ fontSize: 19, lineHeight: 1.15 }}>Cierre del día</div>
          {/* La fecha, el turno y quién cierra, en una línea — como en el
              lienzo. El turno se escribe AQUÍ y no en una tarjeta aparte:
              es parte de decir de qué cierre estamos hablando, no un paso
              más que hacer. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13, color: 'var(--u-text-3)', marginTop: 2 }}>
            <span>{dateLabel}</span>
            <span aria-hidden>·</span>
            <label htmlFor="caja-turno" className="sr-only">Nombre del turno</label>
            <input
              id="caja-turno"
              className="caja-turno"
              type="text"
              list="caja-turnos"
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              placeholder="turno"
              size={Math.max(6, shift.length + 1)}
            />
            <datalist id="caja-turnos">
              <option value="turno mañana" />
              <option value="turno tarde" />
              <option value="turno noche" />
              <option value="apertura" />
              <option value="cierre" />
            </datalist>
            <span aria-hidden>·</span>
            <span>{cashierName}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={guardarBorrador}
          disabled={guardando}
          className="press"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, height: 38, padding: '0 14px',
            borderRadius: 11, border: '1px solid var(--u-hair-2)', background: 'none',
            color: 'var(--u-text-2)', fontSize: 13.5, fontWeight: 500,
            cursor: guardando ? 'default' : 'pointer', opacity: guardando ? 0.6 : 1,
          }}
        >
          {guardando ? 'Guardando…' : 'Guardar y seguir después'}
        </button>
      </div>

      {state.draft && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            padding: '10px 14px', borderRadius: 12, fontSize: 13,
            border: '1px solid color-mix(in srgb, var(--c-warn) 32%, transparent)',
            background: 'color-mix(in srgb, var(--c-warn) 9%, transparent)',
          }}
        >
          <Icon name="alertCircle" size={16} style={{ color: 'var(--c-warn)', flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 180, color: 'var(--u-text-2)' }}>
            Retomaste un cierre que quedó a medias.
          </span>
          <button
            type="button"
            onClick={() => startSave(async () => {
              const res = await discardCajaDraft(restaurantId);
              if (res.error) { setAviso({ text: res.error, bad: true }); return; }
              setCounts({}); setOpening('0'); setShift(''); setNotes('');
              irA(1);
              router.refresh();
            })}
            className="press"
            style={{
              height: 32, padding: '0 13px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid var(--u-hair-2)', background: 'none',
              color: 'var(--u-text-2)', fontSize: 13, fontWeight: 600,
            }}
          >
            Empezar de cero
          </button>
        </div>
      )}

      {state.needsMigration && (
        <p
          style={{
            margin: 0, padding: '10px 14px', borderRadius: 12, fontSize: 12.5, lineHeight: 1.5,
            color: 'var(--u-text-2)', border: '1px solid var(--u-hair)',
            background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
          }}
        >
          Los gastos de caja y el guardado a medias necesitan la migración 123 en esta base de datos.
          Mientras tanto puedes contar el efectivo y cerrar el turno igual que siempre.
        </p>
      )}

      {/* ── Los tres pasos ── */}
      <div className="caja-steps">
        <PasoChip n={1} titulo="Efectivo" detalle={hayConteo ? money(contado) : 'sin contar'} on={paso === 1} hecho={paso > 1} onClick={() => irA(1)} />
        <PasoChip n={2} titulo="Gastos" detalle={state.expenses.length === 0 ? 'ninguno' : `${state.expenses.length} anotado${state.expenses.length === 1 ? '' : 's'}`} on={paso === 2} hecho={paso > 2} onClick={() => irA(2)} />
        <PasoChip n={3} titulo="Propinas" detalle={state.tipsTotal > 0 ? `${money(state.tipsTotal)} por repartir` : 'sin propinas'} on={paso === 3} hecho={false} onClick={() => irA(3)} ultimo />
      </div>

      {aviso && (
        <div
          role="status"
          style={{
            padding: '10px 14px', borderRadius: 12, fontSize: 13, fontWeight: 500,
            color: aviso.bad ? 'var(--c-danger)' : 'var(--u-text-2)',
            border: `1px solid ${aviso.bad ? 'var(--c-danger-line)' : 'var(--u-hair)'}`,
            background: aviso.bad ? 'var(--c-danger-bg)' : 'color-mix(in srgb, var(--u-text) 4%, transparent)',
          }}
        >
          {aviso.text}
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
            />
          )}
          {paso === 2 && (
            <PasoGastos
              restaurantId={restaurantId}
              state={state}
              onAviso={setAviso}
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
            gastos={gastos}
            opening={openNum}
            contado={contado}
            diferencia={diferencia}
            cuadra={cuadra}
            hayConteo={hayConteo}
          />

          <TarjetaGastos state={state} onAnotar={() => irA(2)} />

          <div className="caja-foot">
            {paso < 3 ? (
              <button
                type="button"
                onClick={() => irA(paso === 1 ? 2 : 3)}
                className="press btn-accent"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                  height: 54, borderRadius: 14, border: 'none', cursor: 'pointer',
                  fontSize: 16, fontWeight: 600, width: '100%',
                }}
              >
                {paso === 1 ? 'Siguiente: gastos' : 'Siguiente: propinas'}
                <Icon name="arrowRight" size={19} strokeWidth={2} />
              </button>
            ) : (
              <button
                type="button"
                onClick={cerrarTurno}
                disabled={guardando || !hayConteo}
                className="press btn-accent"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                  height: 54, borderRadius: 14, border: 'none', width: '100%',
                  fontSize: 16, fontWeight: 600,
                  cursor: guardando || !hayConteo ? 'not-allowed' : 'pointer',
                  opacity: guardando || !hayConteo ? 0.6 : 1,
                }}
              >
                {guardando ? 'Cerrando…' : 'Cerrar el turno'}
              </button>
            )}
            {!hayConteo && paso === 3 && (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--u-text-4)', lineHeight: 1.45 }}>
                Falta contar el efectivo del paso 1 para poder cerrar.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
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
            display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 99, flexShrink: 0,
            fontSize: 13, fontWeight: 700,
            background: on ? 'var(--brand-accent)' : 'color-mix(in srgb, var(--u-text) 8%, transparent)',
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
            flex: 1, height: 2, borderRadius: 99, minWidth: 20,
            background: on ? 'var(--brand-accent)' : 'color-mix(in srgb, var(--u-text) 12%, transparent)',
          }}
        />
      )}
    </div>
  );
}

/* ── Paso 1 · contar ──────────────────────────────────────────── */
function PasoEfectivo({ counts, setCount, opening, setOpening }: {
  counts: Record<string, number>;
  setCount: (field: string, val: string) => void;
  opening: string;
  setOpening: (v: string) => void;
}) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span className="t-display" style={{ flex: 1, minWidth: 160, fontSize: 19, lineHeight: 1.15 }}>
          Contá el efectivo
        </span>
        <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>Escribí cuántos hay de cada uno</span>
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

          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="caja-fondo" style={{ fontSize: 12.5, color: 'var(--u-text-3)' }}>
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
              style={{
                width: '100%', height: 44, padding: '0 12px', textAlign: 'right',
                borderRadius: 10, border: '1px solid var(--u-hair-2)', outline: 'none',
                background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', color: 'var(--u-text)',
                fontFamily: 'var(--ui-font-mono)', fontSize: 18, fontWeight: 600,
              }}
            />
            {/* Sin esta línea nadie sabe si el fondo suma o resta al cuadre. */}
            <p id="caja-fondo-ayuda" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.4, color: 'var(--u-text-4)' }}>
              Se descuenta del total contado para saber si cuadra.
            </p>
          </div>
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
function PasoGastos({ restaurantId, state, onAviso }: {
  restaurantId: string;
  state: CajaState;
  onAviso: (a: { text: string; bad: boolean }) => void;
}) {
  const router = useRouter();
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
      conceptRef.current?.focus();
      router.refresh();
    });
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span className="t-display" style={{ flex: 1, minWidth: 160, fontSize: 19, lineHeight: 1.15 }}>
          ¿Qué salió de la caja?
        </span>
        <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>Mercado, gas, mandados…</span>
      </div>

      <Tarjeta titulo="Gastos de hoy">
        {state.expenses.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
            Todavía no hay ninguno. Si hoy no se pagó nada con dinero de la caja, sigue al paso 3.
          </p>
        ) : state.expenses.map((g, i) => (
          <div
            key={g.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontSize: 13.5,
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
                router.refresh();
              })}
              disabled={pending}
              aria-label={`Quitar el gasto ${g.concept}`}
              className="press"
              style={{
                display: 'grid', placeItems: 'center', width: 32, height: 32, flexShrink: 0,
                borderRadius: 9, border: '1px solid var(--u-hair-2)', background: 'none',
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
            style={campo}
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
              style={{ ...campo, flex: '1 1 120px', fontFamily: 'var(--ui-font-mono)', textAlign: 'right' }}
            />
            <input
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              placeholder="Quién lo pagó (opcional)"
              aria-label="Quién pagó el gasto"
              style={{ ...campo, flex: '2 1 160px' }}
            />
          </div>
          <button
            type="button"
            onClick={anotar}
            disabled={pending || !concept.trim() || !(parseFloat(amount) > 0)}
            className="press"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, height: 46,
              borderRadius: 11, border: '1px dashed var(--u-hair-2)', background: 'none',
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
        <span className="t-display" style={{ flex: 1, minWidth: 160, fontSize: 19, lineHeight: 1.15 }}>
          Las propinas del turno
        </span>
        <span className="t-mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--u-text)' }}>{money(total)}</span>
      </div>

      <Tarjeta titulo="Cómo se reparten">
        {tips.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
            Hoy no entró ninguna propina. Puedes cerrar el turno igual.
          </p>
        ) : (
          <>
            {tips.map((t, i) => (
              <div key={`${t.profileId ?? 'casa'}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48 }}>
                <span
                  className="t-mono"
                  style={{
                    display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 99, flexShrink: 0,
                    background: 'color-mix(in srgb, var(--brand-accent) 10%, transparent)',
                    color: 'var(--brand-accent-ink)', fontSize: 13, fontWeight: 700,
                  }}
                >
                  {t.name.trim().charAt(0).toUpperCase() || '·'}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--u-text)' }}>{t.name}</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: 'var(--u-text-4)', marginTop: 1 }}>
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
                  style={{
                    width: 110, height: 44, padding: '0 12px', textAlign: 'right', flexShrink: 0,
                    borderRadius: 10, border: '1px solid var(--u-hair-2)', outline: 'none',
                    background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', color: 'var(--u-text)',
                    fontFamily: 'var(--ui-font-mono)', fontSize: 16, fontWeight: 600,
                  }}
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
                paddingTop: 8, borderTop: '1px solid var(--u-hair)', fontSize: 13.5,
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
          style={campo}
        />
      </Tarjeta>
    </>
  );
}

/* ── La tarjeta del cuadre ────────────────────────────────────── */
function TarjetaCuadre({ ventasEfectivo, gastos, opening, contado, diferencia, cuadra, hayConteo }: {
  ventasEfectivo: number; gastos: number; opening: number; contado: number;
  diferencia: number; cuadra: boolean; hayConteo: boolean;
}) {
  return (
    <div style={tarjeta}>
      <Linea label="Ventas en efectivo" value={money(ventasEfectivo)} />
      {gastos > 0 && <Linea label="Gastos pagados de caja" value={`−${money(gastos)}`} />}
      <Linea label="Fondo inicial" value={money(opening)} />
      <div style={{ height: 1, background: 'var(--u-hair)' }} />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)' }}>Total contado</span>
        <span className="t-mono" style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--u-text)' }}>
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
            padding: '12px 14px', borderRadius: 12, fontSize: 14, fontWeight: 600,
            border: `1px solid ${cuadra ? 'var(--c-ok-line)' : 'color-mix(in srgb, var(--brand-accent) 34%, transparent)'}`,
            background: cuadra ? 'var(--c-ok-bg)' : 'color-mix(in srgb, var(--brand-accent) 8%, transparent)',
            color: cuadra ? 'var(--c-ok)' : 'var(--brand-accent-ink)',
          }}
        >
          <span>{cuadra ? 'Caja cuadrada' : diferencia > 0 ? 'Sobran' : 'Faltan'}</span>
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
        <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
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
          borderRadius: 11, border: '1px dashed var(--u-hair-2)', background: 'none',
          color: 'var(--u-text-3)', fontSize: 13.5, cursor: 'pointer',
        }}
      >
        <Icon name="plus" size={15} strokeWidth={2} />
        Anotar un gasto
      </button>
      {state.expensesTotal > 0 && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--u-hair)' }}>
          <span style={{ fontSize: 13.5, color: 'var(--u-text-2)' }}>Salió de la caja</span>
          <span className="t-mono" style={{ fontWeight: 700, fontSize: 16, color: 'var(--u-text)' }}>
            {money(state.expensesTotal)}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── El turno cerrado ─────────────────────────────────────────── */
function CierreHecho({ result, dateLabel, shift, cashierName, restaurantName, tips, onOtro }: {
  result: CajaCloseResult;
  dateLabel: string;
  shift: string;
  cashierName: string;
  restaurantName: string;
  tips: TipShare[];
  onOtro: () => void;
}) {
  const cuadra = Math.abs(result.difference) < 0.005;

  /* El resumen por WhatsApp es cómo se manda de verdad un cierre a un
     dueño que no está en el local: texto plano, sin adjuntos y sin
     pedirle que entre a ninguna parte. */
  const texto = [
    `Cierre de caja · ${restaurantName}`,
    `${dateLabel}${shift.trim() ? ` · ${shift.trim()}` : ''} · ${cashierName}`,
    '',
    `Ventas en efectivo: ${money(result.expected)}`,
    `Gastos de caja: −${money(result.expensesTotal)}`,
    `Fondo inicial: ${money(result.opening)}`,
    `Total contado: ${money(result.counted)}`,
    cuadra ? 'Caja cuadrada' : result.difference > 0
      ? `Sobran ${money(Math.abs(result.difference))}`
      : `Faltan ${money(Math.abs(result.difference))}`,
    result.tipsTotal > 0 ? '' : null,
    result.tipsTotal > 0 ? `Propinas: ${money(result.tipsTotal)}` : null,
    ...tips.filter((t) => t.amount > 0).map((t) => `· ${t.name}: ${money(t.amount)}`),
  ].filter((l) => l !== null).join('\n');

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 560 }}>
      <div>
        <div className="t-display" style={{ fontSize: 22, lineHeight: 1.15 }}>Turno cerrado</div>
        <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 3 }}>
          {[dateLabel, shift.trim() || null, cashierName].filter(Boolean).join(' · ')}
        </div>
      </div>

      <div style={tarjeta} id="caja-resumen">
        <Linea label="Ventas en efectivo" value={money(result.expected)} />
        {result.expensesTotal > 0 && <Linea label="Gastos pagados de caja" value={`−${money(result.expensesTotal)}`} />}
        <Linea label="Fondo inicial" value={money(result.opening)} />
        <div style={{ height: 1, background: 'var(--u-hair)' }} />
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)' }}>Total contado</span>
          <span className="t-mono" style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em' }}>{money(result.counted)}</span>
        </div>
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            padding: '12px 14px', borderRadius: 12, fontSize: 14, fontWeight: 600,
            border: `1px solid ${cuadra ? 'var(--c-ok-line)' : 'color-mix(in srgb, var(--brand-accent) 34%, transparent)'}`,
            background: cuadra ? 'var(--c-ok-bg)' : 'color-mix(in srgb, var(--brand-accent) 8%, transparent)',
            color: cuadra ? 'var(--c-ok)' : 'var(--brand-accent-ink)',
          }}
        >
          <span>{cuadra ? 'Caja cuadrada' : result.difference > 0 ? 'Sobran' : 'Faltan'}</span>
          <span className="t-mono">{cuadra ? `+${money(0)}` : money(Math.abs(result.difference))}</span>
        </div>
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
            borderRadius: 11, border: '1px solid var(--u-hair-2)', textDecoration: 'none',
            color: 'var(--u-text-2)', fontSize: 13.5, fontWeight: 500,
          }}
        >
          <Icon name="whatsapp" size={15} />
          Enviar por WhatsApp
        </a>
        <BotonSuave onClick={onOtro}>Empezar otro cierre</BotonSuave>
      </div>
    </div>
  );
}

/* ── Piezas menudas ───────────────────────────────────────────── */

const tarjeta: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10, padding: 16,
  borderRadius: 15, border: '1px solid var(--u-hair)',
  background: 'var(--adm-card)', boxShadow: 'var(--adm-shadow-xs)',
};

const campo: React.CSSProperties = {
  width: '100%', height: 46, padding: '0 13px', borderRadius: 10, outline: 'none',
  border: '1px solid var(--u-hair-2)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
  color: 'var(--u-text)', fontSize: 14.5,
};

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ ...tarjeta, gap: 8 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--u-text-4)' }}>
        {titulo}
      </div>
      {children}
    </div>
  );
}

function Linea({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ fontSize: 13.5, color: 'var(--u-text-2)' }}>{label}</span>
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
        borderRadius: 11, border: '1px solid var(--u-hair-2)', background: 'none',
        color: 'var(--u-text-2)', fontSize: 13.5, fontWeight: 500, cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
