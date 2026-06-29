'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteCashCount, type CashCount } from '@/lib/actions/finanzas';
import { DENOM_FIELDS } from '@/lib/finanzas-constants';

const money = (n: number) => `Q${n.toFixed(2)}`;
const DENOM_MAP = Object.fromEntries(DENOM_FIELDS.map(d => [d.field, d]));

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-GT', { weekday: 'short', day: 'numeric', month: 'short' });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });
}
function isWithin24h(iso: string) {
  return Date.now() - new Date(iso).getTime() < 24 * 60 * 60 * 1000;
}

function DenomBreakdown({ breakdown }: { breakdown: Record<string, number> }) {
  const entries = DENOM_FIELDS
    .map(d => ({ ...d, qty: breakdown[d.field] || 0 }))
    .filter(d => d.qty > 0);

  if (entries.length === 0) return null;

  const billetes = entries.filter(d => d.kind === 'B');
  const monedas  = entries.filter(d => d.kind === 'M');

  return (
    <div style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, fontSize: 11.5 }}>
      {billetes.length > 0 && (
        <div style={{ marginBottom: monedas.length > 0 ? 6 : 0 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--u-text-4)' }}>
            Billetes
          </span>
          {billetes.map(d => (
            <div key={d.field} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--u-text-3)', marginTop: 2 }}>
              <span>{d.label} × {d.qty}</span>
              <span style={{ fontFamily: 'var(--ui-font-mono)' }}>{money((d.qty * d.centavos) / 100)}</span>
            </div>
          ))}
        </div>
      )}
      {monedas.length > 0 && (
        <div>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--u-text-4)' }}>
            Monedas
          </span>
          {monedas.map(d => (
            <div key={d.field} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--u-text-3)', marginTop: 2 }}>
              <span>{d.label} × {d.qty}</span>
              <span style={{ fontFamily: 'var(--ui-font-mono)' }}>{money((d.qty * d.centavos) / 100)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CashCountCard({
  entry, restaurantId,
}: { entry: CashCount; restaurantId: string }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const diff = Number(entry.difference);
  const diffColor = Math.abs(diff) < 0.005 ? '#4ade80' : '#f87171';
  const diffLabel = Math.abs(diff) < 0.005 ? 'Cuadrada' : diff > 0 ? 'Sobrante' : 'Faltante';
  const canDelete = isWithin24h(entry.created_at);
  const hasBreakdown = !!entry.denomination_breakdown;

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteCashCount(entry.id, restaurantId);
      if ('error' in result) {
        setDeleteError(result.error);
        setConfirmDelete(false);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--u-hair)' }}>
      {/* Fila principal: fecha + turno + diferencia */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 13, color: 'var(--u-text-2)', fontWeight: 600 }}>
              {formatDate(entry.created_at)} · {formatTime(entry.created_at)}
            </span>
            {entry.shift_label && (
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
                background: 'rgba(255,255,255,0.07)', color: 'var(--u-text-3)',
                letterSpacing: '0.04em',
              }}>
                {entry.shift_label}
              </span>
            )}
          </div>
          {entry.cashier_name && (
            <div style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 2 }}>
              {entry.cashier_name}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 14, color: diffColor }}>
            {diff >= 0 ? '+' : ''}{money(diff)}
          </div>
          <div style={{ fontSize: 10, color: diffColor, opacity: 0.8 }}>{diffLabel}</div>
        </div>
      </div>

      {/* Fila de montos */}
      <div style={{ display: 'flex', gap: 12, marginTop: 5, fontSize: 11.5, color: 'var(--u-text-4)', fontFamily: 'var(--ui-font-mono)' }}>
        <span>Esp. {money(Number(entry.expected_cash))}</span>
        <span>·</span>
        <span>Cont. {money(Number(entry.counted_cash))}</span>
        {Number(entry.opening_float) > 0 && (
          <>
            <span>·</span>
            <span>Fondo {money(Number(entry.opening_float))}</span>
          </>
        )}
      </div>

      {entry.notes && (
        <div style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 4, fontStyle: 'italic' }}>
          "{entry.notes}"
        </div>
      )}

      {/* Desglose de denominaciones */}
      {expanded && hasBreakdown && (
        <DenomBreakdown breakdown={entry.denomination_breakdown as Record<string, number>} />
      )}

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        {hasBreakdown && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontSize: 11, color: 'var(--u-text-4)', textDecoration: 'underline',
            }}
          >
            {expanded ? 'Ocultar desglose' : 'Ver desglose'}
          </button>
        )}
        <div style={{ flex: 1 }} />
        {canDelete && !confirmDelete && (
          <button
            type="button"
            onClick={() => { setConfirmDelete(true); setDeleteError(null); }}
            style={{
              background: 'none', border: '1px solid rgba(248,113,113,0.3)', padding: '3px 9px',
              borderRadius: 7, cursor: 'pointer', fontSize: 11, color: '#f87171',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
            Eliminar
          </button>
        )}
        {canDelete && confirmDelete && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--u-text-3)' }}>¿Confirmar?</span>
            <button
              type="button" disabled={isPending}
              onClick={handleDelete}
              style={{
                background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.4)',
                padding: '3px 10px', borderRadius: 7, cursor: isPending ? 'not-allowed' : 'pointer',
                fontSize: 11, color: '#f87171', fontWeight: 600,
              }}
            >
              {isPending ? '…' : 'Sí, eliminar'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              style={{
                background: 'none', border: '1px solid var(--u-hair)', padding: '3px 9px',
                borderRadius: 7, cursor: 'pointer', fontSize: 11, color: 'var(--u-text-3)',
              }}
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
      {deleteError && (
        <div style={{ fontSize: 11.5, color: '#f87171', marginTop: 4 }}>{deleteError}</div>
      )}
    </div>
  );
}

export default function CashHistoryPanel({
  history, restaurantId,
}: { history: CashCount[]; restaurantId: string }) {
  return (
    <div className="glass" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div className="t-kicker" style={{ fontSize: 9.5, marginBottom: 4 }}>Cortes recientes</div>
      {history.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--u-text-4)', marginTop: 8 }}>
          Aún no hay arqueos guardados.
        </div>
      ) : (
        history.map(c => (
          <CashCountCard key={c.id} entry={c} restaurantId={restaurantId} />
        ))
      )}
    </div>
  );
}
