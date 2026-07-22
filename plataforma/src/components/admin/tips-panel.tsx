'use client';

/* ============================================================
   PROPINAS — reparto entre personal (Fase 2 auditoría de lanzamiento)
   ------------------------------------------------------------
   Vista previa de propinas SIN repartir en un rango (por mesero + fondo
   común sin asignar), ajustable a mano antes de confirmar el reparto.
   Al confirmar, marca esos pedidos como ya repartidos (no se repiten en
   el siguiente período) y deja el reparto en el historial de abajo.
   ============================================================ */

import { useActionState, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import DateRangeForm from '@/components/admin/date-range-form';
import { createTipDistribution, type TipDistributionState, type TipPreview, type TipDistributionHistoryRow } from '@/lib/actions/tips';

const money = (n: number) => `Q${n.toFixed(2)}`;

type Row = { key: string; staffId: string | null; staffName: string; amount: number; ordersCount: number };

function buildInitialRows(preview: TipPreview): Row[] {
  const map = new Map<string, Row>();
  for (const w of preview.byWaiter) {
    map.set(w.waiterId, { key: w.waiterId, staffId: w.waiterId, staffName: w.name, amount: w.amount, ordersCount: w.ordersCount });
  }

  if (preview.unassigned.amount > 0) {
    if (preview.staff.length > 0) {
      // Reparte el fondo común en partes iguales entre el personal actual
      // (ajustable a mano abajo); el resto de centavos va al último.
      const cents = Math.round(preview.unassigned.amount * 100);
      const per = Math.floor(cents / preview.staff.length);
      let remainder = cents - per * preview.staff.length;
      for (const s of preview.staff) {
        const share = (per + (remainder > 0 ? 1 : 0)) / 100;
        if (remainder > 0) remainder -= 1;
        const existing = map.get(s.id);
        if (existing) existing.amount = Math.round((existing.amount + share) * 100) / 100;
        else map.set(s.id, { key: s.id, staffId: s.id, staffName: s.name, amount: share, ordersCount: 0 });
      }
    } else {
      // Sin personal registrado todavía: deja una fila manual para que el
      // dueño escriba a quién le toca antes de confirmar.
      map.set('manual-0', {
        key: 'manual-0', staffId: null, staffName: '', amount: preview.unassigned.amount, ordersCount: preview.unassigned.ordersCount,
      });
    }
  }

  return Array.from(map.values());
}

export default function TipsPanel({
  restaurantId, preview, history,
}: {
  restaurantId: string;
  preview: TipPreview;
  history: TipDistributionHistoryRow[];
}) {
  const [rows, setRows] = useState<Row[]>(() => buildInitialRows(preview));
  const [notes, setNotes] = useState('');
  const [state, formAction, isPending] = useActionState<TipDistributionState, FormData>(createTipDistribution, null);

  const rowsTotal = useMemo(() => Math.round(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0) * 100) / 100, [rows]);
  const matches = Math.abs(rowsTotal - preview.total) < 0.01;

  useEffect(() => {
    if (state && 'ok' in state) {
      setRows(buildInitialRows({ ...preview, total: 0, byWaiter: [], unassigned: { amount: 0, ordersCount: 0 } }));
    }
  }, [state, preview]);

  const patchRow = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));
  const addRow = () =>
    setRows((prev) => [...prev, { key: `manual-${Date.now()}`, staffId: null, staffName: '', amount: 0, ordersCount: 0 }]);

  const inputStyle: React.CSSProperties = {
    background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair)',
    borderRadius: 10, padding: '7px 10px', color: 'var(--u-text)', fontSize: 13.5, outline: 'none',
  };

  const canSubmit = matches && preview.total > 0 && rows.every((r) => r.staffName.trim().length > 0 && r.amount > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card className="flex flex-col gap-3 p-4">
        <DateRangeForm from={preview.from} to={preview.to} basePath="/admin/personal/propinas" />
      </Card>

      <Card className="flex flex-col gap-3.5 p-4.5">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="t-kicker" style={{ fontSize: 9.5 }}>Propinas sin repartir del período</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--u-text)' }}>{money(preview.total)}</div>
        </div>

        {preview.total === 0 ? (
          <div style={{ fontSize: 13.5, color: 'var(--u-text-4)' }}>
            No hay propinas pendientes de repartir en este rango (o ya se repartieron todas).
          </div>
        ) : (
          <>
            <p style={{ fontSize: 12, color: 'var(--u-text-4)', margin: 0, lineHeight: 1.5 }}>
              Ajusta libremente cuánto le toca a cada quien — por defecto, lo directo de cada
              mesero más una parte igual del fondo común (pedidos sin mesero asignado). El total
              de abajo debe cuadrar exacto con el monto de arriba para poder confirmar.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map((r) => (
                <div key={r.key} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {r.staffId ? (
                    <span style={{ flex: '1 1 160px', fontSize: 13.5, fontWeight: 600, color: 'var(--u-text)' }}>{r.staffName}</span>
                  ) : (
                    <input
                      value={r.staffName}
                      onChange={(e) => patchRow(r.key, { staffName: e.target.value })}
                      placeholder="Nombre de la persona"
                      style={{ ...inputStyle, flex: '1 1 160px' }}
                    />
                  )}
                  {r.ordersCount > 0 && (
                    <span style={{ fontSize: 11.5, color: 'var(--u-text-4)' }}>{r.ordersCount} pedido{r.ordersCount === 1 ? '' : 's'}</span>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Q</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={r.amount}
                      onChange={(e) => patchRow(r.key, { amount: Math.max(0, parseFloat(e.target.value) || 0) })}
                      style={{ ...inputStyle, width: 100, fontFamily: 'var(--ui-font-mono)' }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(r.key)}
                    aria-label="Quitar"
                    style={{
                      width: 24, height: 24, borderRadius: 99, border: 'none',
                      background: 'rgba(239,68,68,0.14)', color: 'var(--c-danger, #f87171)',
                      cursor: 'pointer', fontSize: 14, lineHeight: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addRow}
                style={{
                  alignSelf: 'flex-start', padding: '5px 12px', borderRadius: 'var(--radius-md)',
                  border: '1px dashed var(--u-hair-2)', background: 'transparent',
                  color: 'var(--u-text-4)', fontSize: 12.5, cursor: 'pointer',
                }}
              >
                + Persona
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--u-hair)' }}>
              <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>Suma del reparto</span>
              <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--ui-font-mono)', color: matches ? 'var(--u-text)' : 'var(--c-danger, #f87171)' }}>
                {money(rowsTotal)} {!matches && `/ ${money(preview.total)}`}
              </span>
            </div>

            <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input type="hidden" name="restaurantId" value={restaurantId} />
              <input type="hidden" name="from" value={preview.from} />
              <input type="hidden" name="to" value={preview.to} />
              <input
                type="hidden"
                name="shares"
                value={JSON.stringify(rows.map((r) => ({ staffId: r.staffId, staffName: r.staffName, amount: r.amount, ordersCount: r.ordersCount })))}
              />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                name="notes"
                placeholder="Notas (opcional) — ej. quincena, turno, evento…"
                rows={2}
                style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'var(--ui-font-sans)' }}
              />
              {state && 'error' in state && <div style={{ fontSize: 13, color: 'var(--c-danger, #f87171)' }}>{state.error}</div>}
              {state && 'ok' in state && <div style={{ fontSize: 13, color: '#4ade80' }}>Reparto confirmado y registrado.</div>}
              <Button type="submit" disabled={!canSubmit || isPending} size="lg" className="rounded-adm-full">
                {isPending ? 'Confirmando…' : 'Confirmar reparto'}
              </Button>
            </form>
          </>
        )}
      </Card>

      <Card className="flex flex-col gap-2.5 p-4.5">
        <div className="t-kicker" style={{ fontSize: 9.5 }}>Historial de repartos</div>
        {history.length === 0 ? (
          <div style={{ fontSize: 13.5, color: 'var(--u-text-4)' }}>Todavía no has cerrado ningún reparto.</div>
        ) : history.map((h) => (
          <div key={h.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--u-hair)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--u-text-2)' }}>
                {new Date(h.period_start).toLocaleDateString('es-GT')} – {new Date(h.period_end).toLocaleDateString('es-GT')}
                {h.notes ? ` · ${h.notes}` : ''}
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--ui-font-mono)', color: 'var(--u-text)' }}>{money(h.total_tip)}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {h.shares.map((s, i) => (
                <span key={i} style={{ fontSize: 11.5, color: 'var(--u-text-4)' }}>
                  {s.staff_name}: {money(s.amount)}{i < h.shares.length - 1 ? ' ·' : ''}
                </span>
              ))}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
