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
import { downloadReceipt } from '@/lib/receipt';
import {
  saveBillingConfig,
  liftSuspension,
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
import { fechaCorta } from '@/lib/dates';

const CONCEPT_LABEL: Record<string, string> = {
  MONTHLY: 'Mensualidad', SETUP: 'Implementación', PRORATE: 'Prorrateo', OTHER: 'Otro',
};
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: 'Pendiente', color: 'var(--c-warn)', bg: 'var(--c-warn-bg)' },
  PAID: { label: 'Pagado', color: 'var(--c-ok)', bg: 'var(--c-ok-bg)' },
  CANCELLED: { label: 'Cancelado', color: '#94a3b8', bg: 'color-mix(in srgb, var(--u-text) 8%, transparent)' },
};

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair)',
  borderRadius: 'var(--radius-md)', padding: '10px 12px', color: 'var(--u-text)', fontSize: 14, outline: 'none',
};
const optionStyle: React.CSSProperties = { color: '#000', background: '#fff' };
const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--u-text-3)', fontWeight: 600,
  letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6, display: 'block',
};

function todayYmd() { return new Date().toISOString().slice(0, 10); }
function isOverdue(inv: Invoice) {
  return inv.status === 'PENDING' && !!inv.due_date && inv.due_date < todayYmd();
}

export default function BillingManager({
  restaurantId, restaurantName = 'Restaurante', config, invoices, suggestedFee, planName, globalGraceDays,
}: {
  restaurantId: string;
  /** Nombre del restaurante (para el recibo PDF). */
  restaurantName?: string;
  config: BillingConfig | null;
  invoices: Invoice[];
  /** Precio mensual sugerido por el plan + sucursales (RPC org-aware). */
  suggestedFee: number;
  /** Nombre legible del plan (Básico / Popular / Premium). */
  planName: string;
  /** Días de gracia globales por defecto (placeholder del campo). */
  globalGraceDays: number;
}) {
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
          padding: '10px 14px', borderRadius: 'var(--radius-lg)', fontSize: 13.5, fontWeight: 500,
          background: toast.ok ? 'var(--c-ok-bg)' : 'var(--c-danger-bg)',
          border: `1px solid ${toast.ok ? 'var(--c-ok-line)' : 'var(--c-danger-line)'}`,
          color: toast.ok ? 'var(--c-ok)' : 'var(--c-danger)',
        }}>{toast.msg}</div>
      )}

      {/* Config */}
      <ConfigCard
        restaurantId={restaurantId}
        config={config}
        suggestedFee={suggestedFee}
        planName={planName}
        globalGraceDays={globalGraceDays}
        onResult={setToast}
      />

      {/* Acciones de cobro */}
      <Glass variant="quiet" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="t-kicker" style={{ fontSize: 11 }}>Generar cobros</div>
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
          <div className="t-kicker" style={{ fontSize: 11 }}>Historial de cobros</div>
          {pendingTotal > 0 && (
            <div style={{ fontSize: 13, color: 'var(--c-warn)', fontWeight: 600 }}>
              Pendiente: {fmtMoney(pendingTotal, currency)}
            </div>
          )}
        </div>
        {invoices.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Aún no hay cobros generados.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {invoices.map((inv) => (
              <InvoiceRow key={inv.id} inv={inv} restaurantId={restaurantId} restaurantName={restaurantName} onResult={setToast} />
            ))}
          </div>
        )}
      </Glass>
    </div>
  );
}

/* ── Card de configuración ──────────────────────────────────── */
function ConfigCard({
  restaurantId, config, suggestedFee, planName, globalGraceDays, onResult,
}: {
  restaurantId: string;
  config: BillingConfig | null;
  suggestedFee: number;
  planName: string;
  globalGraceDays: number;
  onResult: (t: { ok: boolean; msg: string }) => void;
}) {
  const [state, formAction, pending] = useActionState<BillingState, FormData>(saveBillingConfig, null);
  // Modo de precio: automático (del plan) vs manual (override). Default automático.
  const [auto, setAuto] = useState(config?.auto_price ?? true);
  const currency = config?.currency ?? 'GTQ';

  useEffect(() => {
    if (state && 'ok' in state) onResult({ ok: true, msg: state.msg ?? 'Guardado.' });
    else if (state && 'error' in state) onResult({ ok: false, msg: state.error });
  }, [state, onResult]);

  return (
    <Glass variant="quiet" style={{ padding: 18 }}>
      <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <input type="hidden" name="restaurantId" value={restaurantId} />
        <div className="t-kicker" style={{ fontSize: 11 }}>Configuración del cobro</div>

        {config?.suspended_for_nonpayment && (
          <SuspensionBanner restaurantId={restaurantId} onResult={onResult} />
        )}

        {config?.auto_price === false && Math.abs((config?.monthly_fee ?? 0) - suggestedFee) >= 1 && (
          <div style={{
            padding: '9px 12px', borderRadius: 'var(--radius-md)', fontSize: 12.5, fontWeight: 600,
            background: 'var(--c-danger-bg)', border: '1px solid var(--c-danger-line)', color: 'var(--c-danger)',
          }}>
            ⚠ Precio manual desincronizado: cobra {fmtMoney(config?.monthly_fee ?? 0, currency)}/mes pero el precio
            vigente del plan {planName} sería {fmtMoney(suggestedFee, currency)}/mes. Si no es un descuento
            acordado a propósito, activa &quot;Precio automático&quot; abajo para sincronizarlo.
          </div>
        )}

        {!config?.suspended_for_nonpayment && config?.admin_override_suspend && (
          <div style={{
            padding: '9px 12px', borderRadius: 'var(--radius-md)', fontSize: 12.5, fontWeight: 600,
            background: 'var(--c-warn-bg)', border: '1px solid var(--c-warn-line)', color: 'var(--c-warn)',
          }}>
            ⚡ Override activo: la suspensión automática por impago está pausada para este restaurante.
            Desactiva el override (abajo) cuando regularice su pago.
          </div>
        )}

        {/* Toggle de precio automático */}
        <label style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 'var(--radius-md)',
          background: auto ? 'var(--c-ok-bg)' : 'color-mix(in srgb, var(--u-text) 4%, transparent)',
          border: `1px solid ${auto ? 'var(--c-ok-line)' : 'var(--u-hair)'}`, cursor: 'pointer',
        }}>
          <input
            type="checkbox" name="auto_price" checked={auto}
            onChange={(e) => setAuto(e.target.checked)} style={{ width: 16, height: 16 }}
          />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--u-text)' }}>
              Precio automático según el plan
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--u-text-4)' }}>
              {auto
                ? `Plan ${planName}: ${fmtMoney(suggestedFee, currency)}/mes (incluye sucursales extra). Se actualiza solo al cambiar de plan.`
                : 'Precio manual: escribe el monto que quieras (descuento, trato especial).'}
            </span>
          </span>
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <div>
            <label style={labelStyle}>Implementación (una vez)</label>
            <input name="setup_fee" type="number" min="0" step="0.01" defaultValue={config?.setup_fee ?? 0} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Mensualidad {auto && <span style={{ color: 'var(--c-ok)' }}>· auto</span>}</label>
            {auto ? (
              <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--u-text)', opacity: 0.85 }}>
                <span style={{ fontWeight: 700, fontFamily: 'var(--ui-font-mono)' }}>{fmtMoney(suggestedFee, currency)}</span>
                <span style={{ fontSize: 11, color: 'var(--u-text-4)' }}>{planName}</span>
              </div>
            ) : (
              <input name="monthly_fee" type="number" min="0" step="0.01" defaultValue={config?.monthly_fee ?? suggestedFee} style={inputStyle} />
            )}
          </div>
          <div>
            <label style={labelStyle}>Moneda</label>
            <select name="currency" defaultValue={config?.currency ?? 'GTQ'} style={inputStyle}>
              <option value="GTQ" style={optionStyle}>GTQ (Q)</option>
              <option value="MXN" style={optionStyle}>MXN ($)</option>
              <option value="USD" style={optionStyle}>USD ($)</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Día de cobro</label>
            <input name="billing_day" type="number" min="1" max="28" defaultValue={config?.billing_day ?? 1} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Días de gracia</label>
            <input name="grace_days" type="number" min="0" max="90" defaultValue={config?.grace_days ?? ''} placeholder={`${globalGraceDays} (global)`} style={inputStyle} />
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

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: config?.admin_override_suspend ? 'var(--c-warn)' : 'var(--u-text-2)', cursor: 'pointer' }}>
          <input type="checkbox" name="admin_override_suspend" defaultChecked={config?.admin_override_suspend ?? false} style={{ width: 16, height: 16 }} />
          Pausar suspensión automática (override manual)
          {config?.admin_override_suspend && <span style={{ fontSize: 11, color: 'var(--c-warn)', fontWeight: 700 }}>ACTIVO</span>}
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
        background: danger ? 'var(--c-danger-bg)' : 'color-mix(in srgb, var(--u-text) 6%, transparent)',
        color: danger ? 'var(--c-danger)' : 'var(--u-text)', whiteSpace: 'nowrap',
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
  inv, restaurantId, restaurantName, onResult,
}: { inv: Invoice; restaurantId: string; restaurantName: string; onResult: (t: { ok: boolean; msg: string }) => void }) {
  const overdue = isOverdue(inv);
  const meta = STATUS_META[inv.status] ?? STATUS_META.PENDING;
  const [payOpen, setPayOpen] = useState(false);

  async function receipt() {
    try {
      await downloadReceipt({
        folio: inv.id.slice(0, 8).toUpperCase(),
        restaurantName,
        concept: inv.description ?? CONCEPT_LABEL[inv.concept],
        period: inv.period,
        amount: inv.paid_amount ?? inv.amount,
        currency: inv.currency,
        paidAt: inv.paid_at ?? new Date().toISOString(),
        paymentMethod: inv.payment_method,
      });
    } catch {
      onResult({ ok: false, msg: 'No se pudo generar el recibo.' });
    }
  }

  return (
    <div style={{
      padding: '10px 12px', borderRadius: 'var(--radius-lg)', background: 'color-mix(in srgb, var(--u-text) 3%, transparent)',
      border: `1px solid ${overdue ? 'var(--c-danger-line)' : 'var(--u-hair)'}`,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--u-text)' }}>
          {inv.description ?? CONCEPT_LABEL[inv.concept]}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--radius-full)',
          background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', color: 'var(--u-text-3)', letterSpacing: '0.05em',
        }}>{CONCEPT_LABEL[inv.concept]}</span>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--radius-full)',
          background: overdue ? 'var(--c-danger-bg)' : meta.bg,
          color: overdue ? 'var(--c-danger)' : meta.color, letterSpacing: '0.05em',
        }}>{overdue ? 'VENCIDO' : meta.label.toUpperCase()}</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 15, color: 'var(--u-text)' }}>
          {fmtMoney(inv.amount, inv.currency)}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--u-text-4)' }}>
        {inv.due_date && <span>Vence {inv.due_date}</span>}
        {inv.status === 'PAID' && inv.paid_at && <span>Pagado el {fechaCorta(inv.paid_at)}{inv.payment_method ? ` · ${inv.payment_method}` : ''}</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {inv.status === 'PENDING' ? (
            <button onClick={() => setPayOpen((v) => !v)} className="press" style={miniBtn('var(--c-ok)')}>Registrar pago</button>
          ) : (
            <>
              {inv.status === 'PAID' && (
                <button onClick={receipt} className="press" style={miniBtn('var(--brand-accent)')} title="Descargar comprobante en PDF para enviárselo al dueño">
                  Recibo PDF
                </button>
              )}
              <ActionButton action={markInvoiceUnpaid} hidden={{ invoiceId: inv.id, restaurantId }} label="Marcar pendiente" onResult={onResult} />
            </>
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
          <option style={optionStyle}>Transferencia</option>
          <option style={optionStyle}>Efectivo</option>
          <option style={optionStyle}>Depósito</option>
          <option style={optionStyle}>Tarjeta</option>
          <option style={optionStyle}>Otro</option>
        </select>
      </div>
      <button type="submit" disabled={pending} className="press btn-accent" style={{
        padding: '10px 16px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', opacity: pending ? 0.6 : 1,
      }}>{pending ? '…' : 'Confirmar pago'}</button>
    </form>
  );
}

/* ── Banner de suspensión por impago con botón de habilitación manual ── */
function SuspensionBanner({
  restaurantId, onResult,
}: { restaurantId: string; onResult: (t: { ok: boolean; msg: string }) => void }) {
  const [state, formAction, pending] = useActionState<BillingState, FormData>(liftSuspension, null);
  useEffect(() => {
    if (state && 'ok' in state) onResult({ ok: true, msg: state.msg ?? 'Restaurante habilitado.' });
    else if (state && 'error' in state) onResult({ ok: false, msg: state.error });
  }, [state, onResult]);

  return (
    <div style={{
      padding: '12px 14px', borderRadius: 'var(--radius-md)', fontSize: 12.5,
      background: 'var(--c-danger-bg)', border: '1px solid var(--c-danger-line)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{ fontWeight: 600, color: 'var(--c-danger)' }}>
        ⚠ Suspendido automáticamente por impago.
        <span style={{ fontWeight: 400, color: 'var(--u-text-3)', marginLeft: 6 }}>
          Se reactiva solo al registrar el pago, o puedes habilitarlo manualmente.
        </span>
      </div>
      <form action={formAction} style={{ flexShrink: 0 }}>
        <input type="hidden" name="restaurantId" value={restaurantId} />
        <button type="submit" disabled={pending} className="press" style={{
          padding: '8px 16px', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: 12.5,
          border: '1px solid var(--c-ok-line)', background: 'var(--c-ok-bg)',
          color: 'var(--c-ok)', cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.6 : 1,
          whiteSpace: 'nowrap',
        }}>
          {pending ? 'Habilitando…' : 'Habilitar manualmente'}
        </button>
      </form>
    </div>
  );
}

function miniBtn(color: string): React.CSSProperties {
  return {
    padding: '8px 14px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 12.5,
    border: '1px solid var(--u-hair-2)', background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', color, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}
