'use client';

/* ============================================================
   EL SALÓN, EN EL PANEL DEL DUEÑO
   ------------------------------------------------------------
   «Mesas» significaba dos cosas distintas en el mismo producto:
   en el panel era una pantalla de CONFIGURACIÓN (cuántas mesas,
   códigos QR, plano, propina) y en el panel de mesero era el
   estado del salón. Ninguna de las dos contestaba la pregunta
   del dueño: qué está pasando en mi salón AHORA MISMO.

   Esto es esa respuesta. Usa exactamente la misma regla que el
   mesero (lib/table-state.ts) para que las dos pantallas no
   puedan discrepar: si una mesa aquí sale en acento, en el
   teléfono del mesero también.
   ============================================================ */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Icon } from '@/components/icons';
import { TableToken } from '@/components/admin/floor-map';
import { fmtMoney } from '@/components/admin/orders-panel';
import type { PanelCurrency } from '@/components/admin/order-card';
import { tablesWithState, needsAttention } from '@/lib/table-state';
import type { TableOccupancy, TableCall } from '@/lib/db/orders';

interface Props {
  tableCount: number;
  occupancy: Record<number, TableOccupancy>;
  calls: Record<number, TableCall>;
  currency: PanelCurrency;
  /** A dónde manda tocar una mesa (el panel de mesero), si el plan lo permite. */
  waiterHref: string | null;
}

export default function SalonBoard({ tableCount, occupancy, calls, currency, waiterHref }: Props) {
  const router = useRouter();

  /* El reloj entra por estado y arranca en null: los avisos por tiempo
     dependen de la hora del cliente, y pintarlos en el HTML del servidor
     haría que el primer render no coincida. Igual criterio que el panel
     de mesero. */
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Traer el salón de vuelta cada minuto: es un tablero, no un formulario.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(id);
  }, [router]);

  const salon = useMemo(
    () => tablesWithState(tableCount, occupancy, calls, now),
    [tableCount, occupancy, calls, now],
  );
  const urgentes = useMemo(() => needsAttention(salon), [salon]);
  const abiertas = useMemo(() => salon.filter((t) => t.occ), [salon]);
  const sinCobrar = useMemo(
    () => abiertas.reduce((s, t) => s + (t.occ?.total ?? 0), 0),
    [abiertas],
  );

  function abrir(n: number) {
    if (!waiterHref) return;
    router.push(`${waiterHref}?mesa=${n}`);
  }

  if (tableCount <= 0) {
    return (
      <div style={{ fontSize: 14, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
        Todavía no hay mesas configuradas. Ponles número abajo y el salón aparece aquí.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Resumen: tres números, no un tablero de doce. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          border: '1px solid var(--u-hair)',
          borderRadius: 14,
          overflow: 'hidden',
          background: 'var(--admin-panel-bg, transparent)',
        }}
      >
        {([
          ['Mesas con gente', `${abiertas.length} / ${tableCount}`],
          ['Te necesitan', String(urgentes.length)],
          ['Sin cobrar', fmtMoney(sinCobrar, currency)],
        ] as const).map(([label, valor], i) => (
          <div key={label} style={{ padding: '14px 18px', borderLeft: i === 0 ? 'none' : '1px solid var(--u-hair)' }}>
            <div style={{ fontSize: 13, color: 'var(--u-text-3)' }}>{label}</div>
            <div className="t-mono" style={{ fontSize: 24, fontWeight: 700, color: 'var(--u-text)', marginTop: 4, letterSpacing: '-0.02em' }}>
              {valor}
            </div>
          </div>
        ))}
      </div>

      {urgentes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--u-text-3)', padding: '0 2px' }}>
            Necesitan atención
          </div>
          {urgentes.map((t) => (
            <button
              key={t.n}
              type="button"
              onClick={() => abrir(t.n)}
              disabled={!waiterHref}
              className="press"
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderRadius: 13,
                border: '1px solid color-mix(in srgb, var(--brand-accent) 34%, transparent)',
                background: 'color-mix(in srgb, var(--brand-accent) 8%, transparent)',
                cursor: waiterHref ? 'pointer' : 'default', textAlign: 'left', width: '100%',
              }}
            >
              <span className="t-mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--u-text)', width: 32, flexShrink: 0 }}>
                {t.n}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: 'var(--brand-accent-ink)' }}>
                  {t.state.label}
                </span>
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 1 }}>
                  {t.occ
                    ? `${t.occ.itemCount} ${t.occ.itemCount === 1 ? 'plato' : 'platos'}${t.occ.waiterName ? ` · ${t.occ.waiterName}` : ' · pedido por el comensal'}`
                    : 'Mesa libre'}
                </span>
              </span>
              {t.occ && (
                <span className="t-mono" style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', flexShrink: 0 }}>
                  {fmtMoney(t.occ.total, currency)}
                </span>
              )}
              {waiterHref && <Icon name="chevronRight" size={17} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />}
            </button>
          ))}
        </div>
      )}

      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10, padding: '0 2px' }}>
          <div style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--u-text-3)' }}>El salón ahora</div>
          {waiterHref && (
            <Link href={waiterHref} style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand-accent-ink)' }}>
              Tomar un pedido
            </Link>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 10 }}>
          {salon.map((t) => (
            <TableToken
              key={t.n}
              n={t.n}
              state={t.state}
              total={t.occ ? fmtMoney(t.occ.total, currency) : null}
              onTap={() => abrir(t.n)}
            />
          ))}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--u-text-4)', lineHeight: 1.5, marginTop: 10, padding: '0 2px' }}>
          Una mesa libre no dice nada. Solo se pinta de color la que necesita a alguien ahora.
        </div>
      </div>
    </div>
  );
}
