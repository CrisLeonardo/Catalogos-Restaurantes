'use client';

/* ============================================================
   Gestión de cobro de UN restaurante (Super Admin, mig. 028)
   · Configura implementación + mensualidad + día de cobro.
   · Genera cobros (mensualidad, prorrateo, implementación, manual).
   · Lista las facturas y permite registrar el pago.
   ============================================================ */

import { useActionState, useEffect, useState } from 'react';
import { Glass } from '@/components/glass';
import { fmtMoney } from '@/lib/money';
import {
  saveBillingConfig,
  generateMonthlyForRestaurant,
  generateProrate,
  generateSetupInvoice,
  createManualInvoice,
  markInvoicePaid,
  markInvoiceUnpaid,
  deleteInvoice,
  type BillingState,
} from '@/lib/actions/billing';
import type { BillingConfig, Invoice } from '@/lib/db/billing';

const CONCEPT_LABEL: Record<string, string> = {
  MONTHLY: 'Mensualidad', SETUP: 'Implementación', PRORATE: 'Prorrateo', OTHER: 'Otro',
};
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: 'Pendiente', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  PAID: { label: 'Pagado', color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
  CANCELLED: { label: 'Cancelado', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
};

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--u-hair)',
  borderRadius: 11, padding: '10px 12px', color: 'var(--u-text)', fontSize: 14, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  fontSize: 10.5, color: 'var(--u-text-3)', fontWeight: 600,
  letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6, display: 'block',
};

function todayYmd() { return new Date().toISOString().slice(0, 10); }
function isOverdue(inv: Invoice) {
  return inv.status === 'PENDING' && !!inv.due_date && inv.due_date < todayYmd();
}

export default function BillingManager({
  restaurantId, config, invoices,
}: { restaurantId: string; config: BillingConfig | null; invoices: Invoice[] }) {
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const currency = config?.currency ?? 'GTQ';

  // Auto-ocultar el toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const pendingTotal = invoices.filter((i) => i.status === 'PENDING').reduce((s, i) => s + i.amount, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {toast && (
        <div style={{
          padding: '10px 14px', borderRadius: 12, fontSize: 13.5, fontWeight: 500,
          background: toast.ok ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
          border: `1px solid ${toast.ok ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)'}`,
          color: toast.ok ? '#4ade80' : '#f87171',
        }}>{toast.msg}</div>
      )}

      {/* Config */}
      <ConfigCard restaurantId={restaurantId} config={config} onResult={setToast} />

      {/* Acciones de cobro */}
      <Glass variant="quiet" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="t-kicker" style={{ fontSize: 9.5 }}>Generar cobros</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <ActionButton action={generateMonthlyForRestaurant} hidden={{ restaurantId }} label="Mensualidad de este mes" onResult={setToast} />
          <ActionButton action={generateProrate} hidden={{ restaurantId }} label="Prorrateo (resto del mes)" onResult={setToast} />
          <ActionButton action={generateSetupInvoice} hidden={{ restaurantId }} label="Cobro de implementación" onResult={setToast} />
        </div>
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', margin: 0, lineHeight: 1.5 }}>
          El prorrateo cobra solo los días que faltan del mes actual (útil cuando un restaurante arranca a mitad de mes).
          A partir del siguiente mes se cobra la mensualidad completa al inicio.
        </p>
        <ManualInvoiceForm restaurantId={restaurantId} onResult={setToast} />
      </Glass>

      {/* Facturas */}
      <Glass variant="quiet" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div className="t-kicker" style={{ fontSize: 9.5 }}>Historial de cobros</div>
          {pendingTotal > 0 && (
            <div style={{ fontSize: 13, color: '#fbbf24', fontWeight: 600 }}>
              Pendiente: {fmtMoney(pendingTotal, currency)}
            </div>
          )}
        </div>
        {invoices.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Aún no hay cobros generados.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {invoices.map((inv) => (
              <InvoiceRow key={inv.id} inv={inv} restaurantId={restaurantId} onResult={setToast} />
            ))}
          </div>
        )}
      </Glass>
    </div>
  );
}

/* ── Card de configuración ──────────────────────────────────── */
function ConfigCard({
  restaurantId, config, onResult,
}: { restaurantId: string; config: BillingConfig | null; onResult: (t: { ok: boolean; msg: string }) => void }) {
  const [state, formAction, pending] = useActionState<BillingState, FormData>(saveBillingConfig, null);
  useEffect(() => {
    if (state && 'ok' in state) onResult({ ok: true, msg: state.msg ?? 'Guardado.' });
    else if (state && 'error' in state) onResult({ ok: false, msg: state.error });
  }, [state, onResult]);

  return (
    <Glass variant="quiet" style={{ padding: 18 }}>
      <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <input type="hidden" name="restaurantId" value={restaurantId} />
        <div className="t-kicker" style={{ fontSize: 9.5 }}>Configuración del cobro</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <div>
            <label style={labelStyle}>Implementación (una vez)</label>
            <input name="setup_fee" type="number" min="0" step="0.01" defaultValue={config?.setup_fee ?? 0} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Mensualidad</label>
            <input name="monthly_fee" type="number" min="0" step="0.01" defaultValue={config?.monthly_fee ?? 0} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Moneda</label>
            <select name="currency" defaultValue={config?.currency ?? 'GTQ'} style={inputStyle}>
              <option value="GTQ">GTQ (Q)</option>
              <option value="MXN">MXN ($)</option>
              <option value="USD">USD ($)</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Día de cobro</label>
            <input name="billing_day" type="number" min="1" max="28" defaultValue={config?.billing_day ?? 1} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Inicio del servicio</label>
            <input name="started_at" type="date" defaultValue={config?.started_at ?? ''} style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Notas internas</label>
          <input name="notes" type="text" defaultValue={config?.notes ?? ''} placeholder="Descuento acordado, observaciones…" style={inputStyle} />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--u-text-2)', cursor: 'pointer' }}>
          <input type="checkbox" name="active" defaultChecked={config?.active ?? true} style={{ width: 16, height: 16 }} />
          Cobro activo (se le sigue facturando la mensualidad)
        </label>

        <button type="submit" disabled={pending} className="press btn-accent" style={{
          alignSelf: 'flex-start', padding: '10px 20px', borderRadius: 'var(--radius-full)',
          fontWeight: 600, fontSize: 14, border: 'none', cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.6 : 1,
        }}>
          {pending ? 'Guardando…' : 'Guardar configuración'}
        </button>
      </form>
    </Glass>
  );
}

/* ── Botón que dispara un server action y reporta resultado ─── */
function ActionButton({
  action, hidden, label, onResult, danger,
}: {
  action: (s: BillingState, fd: FormData) => Promise<BillingState>;
  hidden: Record<string, string>;
  label: string;
  onResult: (t: { ok: boolean; msg: string }) => void;
  danger?: boolean;
}) {
  const [state, formAction, pending] = useActionState<BillingState, FormData>(action, null);
  useEffect(() => {
    if (state && 'ok' in state) onResult({ ok: true, msg: state.msg ?? 'Listo.' });
    else if (state && 'error' in state) onResult({ ok: false, msg: state.error });
  }, [state, onResult]);
  return (
    <form action={formAction} style={{ display: 'inline-flex' }}>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button type="submit" disabled={pending} className="press" style={{
        padding: '8px 14px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 12.5,
        border: '1px solid var(--u-hair-2)', cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.55 : 1,
        background: danger ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.06)',
        color: danger ? '#f87171' : 'var(--u-text)', whiteSpace: 'nowrap',
      }}>
        {pending ? '…' : label}
      </button>
    </form>
  );
}

/* ── Cobro manual ───────────────────────────────────────────── */
function ManualInvoiceForm({
  restaurantId, onResult,
}: { restaurantId: string; onResult: (t: { ok: boolean; msg: string }) => void }) {
  const [state, formAction, pending] = useActionState<BillingState, FormData>(createManualInvoice, null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (state && 'ok' in state) onResult({ ok: true, msg: state.msg ?? 'Cobro creado.' });
    else if (state && 'error' in state) onResult({ ok: false, msg: state.error });
  }, [state, onResult]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="press" style={{
        alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 12.5,
        border: '1px dashed var(--u-hair-2)', background: 'transparent', color: 'var(--u-text-3)', cursor: 'pointer',
      }}>+ Otro cobro</button>
    );
  }
  return (
    <form action={formAction} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <div style={{ flex: '2 1 160px' }}>
        <label style={labelStyle}>Concepto</label>
        <input name="description" type="text" placeholder="Cambio de diseño, dominio…" style={inputStyle} required />
      </div>
      <div style={{ flex: '1 1 90px' }}>
        <label style={labelStyle}>Monto</label>
        <input name="amount" type="number" min="0" step="0.01" style={inputStyle} required />
      </div>
      <div style={{ flex: '1 1 120px' }}>
        <label style={labelStyle}>Vence</label>
        <input name="due_date" type="date" defaultValue={todayYmd()} style={inputStyle} />
      </div>
      <button type="submit" disabled={pending} className="press btn-accent" style={{
        padding: '10px 16px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', opacity: pending ? 0.6 : 1,
      }}>{pending ? '…' : 'Crear'}</button>
    </form>
  );
}

/* ── Fila de factura ────────────────────────────────────────── */
function InvoiceRow({
  inv, restaurantId, onResult,
}: { inv: Invoice; restaurantId: string; onResult: (t: { ok: boolean; msg: string }) => void }) {
  const overdue = isOverdue(inv);
  const meta = STATUS_META[inv.status] ?? STATUS_META.PENDING;
  const [payOpen, setPayOpen] = useState(false);

  return (
    <div style={{
      padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${overdue ? 'rgba(248,113,113,0.3)' : 'var(--u-hair)'}`,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--u-text)' }}>
          {inv.description ?? CONCEPT_LABEL[inv.concept]}
        </span>
        <span style={{
          fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
          background: 'rgba(255,255,255,0.06)', color: 'var(--u-text-3)', letterSpacing: '0.05em',
        }}>{CONCEPT_LABEL[inv.concept]}</span>
        <span style={{
          fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
          background: overdue ? 'rgba(248,113,113,0.15)' : meta.bg,
          color: overdue ? '#f87171' : meta.color, letterSpacing: '0.05em',
        }}>{overdue ? 'VENCIDO' : meta.label.toUpperCase()}</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 15, color: 'var(--u-text)' }}>
          {fmtMoney(inv.amount, inv.currency)}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--u-text-4)' }}>
        {inv.due_date && <span>Vence {inv.due_date}</span>}
        {inv.status === 'PAID' && inv.paid_at && <span>Pagado {inv.paid_at.slice(0, 10)}{inv.payment_method ? ` · ${inv.payment_method}` : ''}</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {inv.status === 'PENDING' ? (
            <button onClick={() => setPayOpen((v) => !v)} className="press" style={miniBtn('#4ade80')}>Registrar pago</button>
          ) : (
            <ActionButton action={markInvoiceUnpaid} hidden={{ invoiceId: inv.id, restaurantId }} label="Marcar pendiente" onResult={onResult} />
          )}
          <ActionButton action={deleteInvoice} hidden={{ invoiceId: inv.id, restaurantId }} label="Eliminar" onResult={onResult} danger />
        </div>
      </div>

      {payOpen && inv.status === 'PENDING' && (
        <PayForm inv={inv} restaurantId={restaurantId} onResult={(t) => { onResult(t); if (t.ok) setPayOpen(false); }} />
      )}
    </div>
  );
}

function PayForm({
  inv, restaurantId, onResult,
}: { inv: Invoice; restaurantId: string; onResult: (t: { ok: boolean; msg: string }) => void }) {
  const [state, formAction, pending] = useActionState<BillingState, FormData>(markInvoicePaid, null);
  useEffect(() => {
    if (state && 'ok' in state) onResult({ ok: true, msg: state.msg ?? 'Pago registrado.' });
    else if (state && 'error' in state) onResult({ ok: false, msg: state.error });
  }, [state, onResult]);
  return (
    <form action={formAction} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', paddingTop: 4 }}>
      <input type="hidden" name="invoiceId" value={inv.id} />
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <div style={{ flex: '1 1 90px' }}>
        <label style={labelStyle}>Monto pagado</label>
        <input name="paid_amount" type="number" min="0" step="0.01" defaultValue={inv.amount} style={inputStyle} />
      </div>
      <div style={{ flex: '1 1 120px' }}>
        <label style={labelStyle}>Método</label>
        <select name="payment_method" defaultValue="Transferencia" style={inputStyle}>
          <option>Transferencia</option>
          <option>Efectivo</option>
          <option>Depósito</option>
          <option>Tarjeta</option>
          <option>Otro</option>
        </select>
      </div>
      <button type="submit" disabled={pending} className="press btn-accent" style={{
        padding: '10px 16px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', opacity: pending ? 0.6 : 1,
      }}>{pending ? '…' : 'Confirmar pago'}</button>
    </form>
  );
}

function miniBtn(color: string): React.CSSProperties {
  return {
    padding: '8px 14px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 12.5,
    border: '1px solid var(--u-hair-2)', background: 'rgba(255,255,255,0.06)', color, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}
