'use client';

/* Directorio de restaurantes del Super Admin: búsqueda instantánea,
   filtros por estado/plan y orden. Recibe los datos ya cruzados del
   servidor (restaurantes + tráfico + cobro) y filtra en el cliente —
   con decenas de tenants esto vuela sin round-trips. */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/icons';
import { PlanChip, StatusChip, EmptyState, PLAN_DOT } from '@/components/super/ui';
import { fmtMoney } from '@/lib/money';

export type DirectoryRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  color: string | null;
  createdAt: string;
  visits30: number;
  orders30: number;
  monthlyFee: number;
  currency: string;
  hasOverdue: boolean;
  onTrial: boolean;
  trialDays: number;
  menuUrl: string;
};

type SortKey = 'recent' | 'name' | 'visits' | 'orders';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recientes' },
  { key: 'name',   label: 'Nombre' },
  { key: 'visits', label: 'Visitas 30d' },
  { key: 'orders', label: 'Pedidos 30d' },
];

export default function RestaurantsDirectory({ rows, planOrder }: { rows: DirectoryRow[]; planOrder: string[] }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'suspended'>('all');
  const [plan, setPlan] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('recent');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (plan !== 'all' && r.plan !== plan) return false;
      if (needle && !r.name.toLowerCase().includes(needle) && !r.slug.toLowerCase().includes(needle)) return false;
      return true;
    });
    switch (sort) {
      case 'name':   out.sort((a, b) => a.name.localeCompare(b.name, 'es')); break;
      case 'visits': out.sort((a, b) => b.visits30 - a.visits30); break;
      case 'orders': out.sort((a, b) => b.orders30 - a.orders30); break;
      default:       out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    }
    return out;
  }, [rows, q, status, plan, sort]);

  const suspendedCount = rows.filter((r) => r.status === 'suspended').length;
  const plansPresent = planOrder.filter((p) => rows.some((r) => r.plan === p));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Búsqueda + filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* El buscador del panel (`.adm-search`, D-8). */}
        <label className="adm-search" style={{ flex: '1 1 220px', maxWidth: 380 }}>
          <Icon name="search" size={16} aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o slug…"
            aria-label="Buscar restaurante"
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Ordenar por"
          className="adm-field adm-field-auto"
        >
          {SORTS.map((s) => <option key={s.key} value={s.key}>Orden: {s.label}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <FilterChip active={status === 'all'} onClick={() => setStatus('all')} label={`Todos · ${rows.length}`} />
        <FilterChip active={status === 'active'} onClick={() => setStatus('active')} label={`Activos · ${rows.length - suspendedCount}`} />
        {suspendedCount > 0 && (
          <FilterChip active={status === 'suspended'} onClick={() => setStatus('suspended')} label={`Suspendidos · ${suspendedCount}`} danger />
        )}
        {plansPresent.length > 1 && (
          <>
            <span aria-hidden style={{ width: 1, height: 18, background: 'var(--adm-border-2, var(--u-hair-2))', margin: '0 4px' }} />
            <FilterChip active={plan === 'all'} onClick={() => setPlan('all')} label="Todo plan" />
            {plansPresent.map((p) => (
              <FilterChip key={p} active={plan === p} onClick={() => setPlan(plan === p ? 'all' : p)} label={labelOf(p)} dot={PLAN_DOT[p]} />
            ))}
          </>
        )}
      </div>

      {/* Resultados */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="search"
          title={rows.length === 0 ? 'Aún no hay restaurantes' : 'Sin resultados'}
          body={rows.length === 0 ? 'Crea el primero para empezar a operar la plataforma.' : 'Prueba con otro término o quita los filtros.'}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((r) => (
            <Card key={r.id} variant="interactive" style={{ padding: 0 }}>
              <Link
                href={`/super/restaurantes/${r.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', textDecoration: 'none' }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 38, height: 38, borderRadius: 'var(--radius-md)', flexShrink: 0, display: 'grid', placeItems: 'center',
                    background: `color-mix(in srgb, ${r.color ?? 'var(--brand-accent)'} 16%, transparent)`,
                    color: r.color ?? 'var(--brand-accent)',
                    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15,
                  }}
                >
                  {r.name.trim().charAt(0).toUpperCase() || '·'}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.name}
                    </span>
                    {r.hasOverdue && <Badge variant="danger" style={{ fontSize: 11 }}>Vencido</Badge>}
                    {r.onTrial && <Badge variant="info" style={{ fontSize: 11 }}>Prueba · {r.trialDays}d</Badge>}
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 3, fontSize: 11, color: 'var(--u-text-4)', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--ui-font-mono)' }}>{r.slug}</span>
                    <span className="hide-mobile">{r.visits30} visitas · {r.orders30} pedidos 30d</span>
                    {r.monthlyFee > 0 && <span className="hide-mobile">{fmt(r.monthlyFee, r.currency)}/mes</span>}
                  </div>
                </div>

                <span className="hide-mobile"><PlanChip plan={r.plan} /></span>
                <StatusChip status={r.status} />
                <Icon name="chevronRight" size={16} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick, danger, dot }: {
  label: string; active: boolean; onClick: () => void; danger?: boolean; dot?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 'var(--radius-full)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        background: active
          ? (danger ? 'color-mix(in srgb, var(--c-danger) 14%, transparent)' : 'color-mix(in srgb, var(--brand-accent) 14%, transparent)')
          : 'var(--adm-card, color-mix(in srgb, var(--u-text) 5%, transparent))',
        color: active ? (danger ? 'var(--c-danger)' : 'var(--brand-accent)') : 'var(--u-text-3)',
        border: `1px solid ${active
          ? (danger ? 'color-mix(in srgb, var(--c-danger) 30%, transparent)' : 'color-mix(in srgb, var(--brand-accent) 30%, transparent)')
          : 'var(--adm-border, var(--u-hair))'}`,
        transition: 'all 140ms',
      }}
    >
      {dot && <span style={{ width: 7, height: 7, borderRadius: 'var(--radius-full)', background: dot }} />}
      {label}
    </button>
  );
}


const PLAN_LABELS: Record<string, string> = { BASICO: 'Básico', ESTANDAR: 'Estándar', PREMIUM: 'Premium', PRO: 'Pro' };
function labelOf(plan: string): string { return PLAN_LABELS[plan] ?? plan; }

function fmt(n: number, cur: string): string {
  return fmtMoney(n, cur, 0);
}
