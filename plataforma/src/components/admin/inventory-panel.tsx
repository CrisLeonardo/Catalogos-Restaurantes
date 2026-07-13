'use client';

/* InventoryPanel — control de existencias por producto.
   Stepper rápido (+/−) vía adjustStock; stock exacto + umbral + on/off
   vía saveInventory. Badges de stock bajo / agotado. */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { adjustStock, saveInventory } from '@/lib/actions/inventory';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Category, Product } from '@/types';

interface Props {
  restaurantId: string;
  categories: Category[];
  products: Product[];
}

export default function InventoryPanel({ restaurantId, categories, products }: Props) {
  const [activeCat, setActiveCat] = useState('todos');
  const router = useRouter();

  const list = products.filter((p) => activeCat === 'todos' || p.category_id === activeCat);

  const tracked = products.filter((p) => p.track_stock);
  const out = tracked.filter((p) => Number(p.stock ?? 0) <= 0).length;
  const low = tracked.filter((p) => {
    const s = Number(p.stock ?? 0);
    return s > 0 && s <= Number(p.low_stock_threshold ?? 0);
  }).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Summary label="Con control" value={String(tracked.length)} />
        <Summary label="Stock bajo" value={String(low)} tone={low > 0 ? 'warn' : undefined} />
        <Summary label="Agotados" value={String(out)} tone={out > 0 ? 'bad' : undefined} />
      </div>

      {/* Filtro de categorías */}
      <div className="u-noscroll" style={{ display: 'flex', gap: 7, overflowX: 'auto' }}>
        {[{ id: 'todos', name: 'Todas' }, ...categories].map((c) => {
          const on = c.id === activeCat;
          return (
            <Button
              key={c.id}
              variant={on ? 'primary' : 'secondary'}
              size="sm"
              className="shrink-0 rounded-adm-full"
              onClick={() => setActiveCat(c.id)}
            >
              {c.name}
            </Button>
          );
        })}
      </div>

      {/* Lista */}
      {list.length === 0 ? (
        <Card className="p-10 text-center" style={{ color: 'var(--u-text-3)', fontSize: 14 }}>
          No hay platillos en esta categoría.
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {list.map((p, i) => (
            <Row
              key={p.id}
              product={p}
              restaurantId={restaurantId}
              last={i === list.length - 1}
              onChanged={() => router.refresh()}
            />
          ))}
        </Card>
      )}
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#f87171' : tone === 'warn' ? '#fbbf24' : 'var(--u-text)';
  return (
    <Card className="flex flex-col gap-1.5 p-4.5">
      <div className="t-kicker" style={{ fontSize: 9.5 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color, lineHeight: 1 }}>{value}</div>
    </Card>
  );
}

function Row({ product, restaurantId, last, onChanged }: { product: Product; restaurantId: string; last: boolean; onChanged: () => void }) {
  const [pending, start] = useTransition();
  const [stockVal, setStockVal] = useState(String(product.stock ?? 0));
  const [thresholdVal, setThresholdVal] = useState(String(product.low_stock_threshold ?? 0));
  const [open, setOpen] = useState(false);

  const stock = Number(product.stock ?? 0);
  const tracked = product.track_stock;
  const isOut = tracked && stock <= 0;
  const isLow = tracked && stock > 0 && stock <= Number(product.low_stock_threshold ?? 0);

  function quick(delta: number) {
    const fd = new FormData();
    fd.set('restaurantId', restaurantId);
    fd.set('id', product.id);
    fd.set('delta', String(delta));
    start(async () => { await adjustStock(fd); onChanged(); });
  }

  function save(track: boolean) {
    const fd = new FormData();
    fd.set('restaurantId', restaurantId);
    fd.set('id', product.id);
    fd.set('track_stock', String(track));
    fd.set('stock', stockVal);
    fd.set('low_stock_threshold', thresholdVal);
    start(async () => { await saveInventory(null, fd); setOpen(false); onChanged(); });
  }

  return (
    <div style={{ padding: '12px 16px', borderBottom: last ? 'none' : '1px solid var(--u-hair)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--u-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {product.name}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
            {!tracked && <Tag text="Sin control" />}
            {isOut && <Tag text="Agotado" tone="bad" />}
            {isLow && <Tag text="Stock bajo" tone="warn" />}
            {tracked && !isOut && !isLow && <Tag text="OK" tone="ok" />}
          </div>
        </div>

        {tracked ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Stepper onClick={() => quick(-1)} disabled={pending || stock <= 0} icon="minus" />
            <span style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 17, minWidth: 34, textAlign: 'center', color: isOut ? '#f87171' : 'var(--u-text)' }}>
              {stock}
            </span>
            <Stepper onClick={() => quick(1)} disabled={pending} icon="plus" />
            <Button onClick={() => setOpen((v) => !v)} variant="secondary" size="icon" className="size-8.5" title="Ajustes">
              <Icon name="settings" size={15} />
            </Button>
          </div>
        ) : (
          <Button onClick={() => setOpen(true)} disabled={pending} variant="secondary" size="sm">
            Activar control
          </Button>
        )}
      </div>

      {/* Ajustes inline (activar control o editar stock/umbral) */}
      {open && (
        <Card variant="flat" className="flex flex-wrap items-end gap-3 p-3">
          <Field label="Stock exacto">
            <input type="number" inputMode="decimal" min="0" value={stockVal} onChange={(e) => setStockVal(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Alertar cuando ≤">
            <input type="number" inputMode="decimal" min="0" value={thresholdVal} onChange={(e) => setThresholdVal(e.target.value)} style={inputStyle} />
          </Field>
          <Button onClick={() => save(true)} disabled={pending} size="sm">
            {pending ? '…' : tracked ? 'Guardar' : 'Activar'}
          </Button>
          {tracked ? (
            <Button onClick={() => save(false)} disabled={pending} variant="outline" size="sm">
              Desactivar control
            </Button>
          ) : (
            <Button onClick={() => setOpen(false)} disabled={pending} variant="outline" size="sm">
              Cancelar
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: 110, background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair)',
  borderRadius: 10, padding: '9px 11px', color: 'var(--u-text)', fontSize: 14,
  outline: 'none', fontFamily: 'var(--ui-font-mono)',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label className="t-kicker" style={{ fontSize: 9.5 }}>{label}</label>
      {children}
    </div>
  );
}

function Stepper({ onClick, disabled, icon }: { onClick: () => void; disabled?: boolean; icon: string }) {
  return (
    <Button onClick={onClick} disabled={disabled} variant="secondary" size="icon" className="size-8.5">
      <Icon name={icon} size={16} />
    </Button>
  );
}

function Tag({ text, tone }: { text: string; tone?: 'bad' | 'warn' | 'ok' }) {
  const map = {
    bad: { c: '#f87171', b: 'rgba(248,113,113,0.12)', br: 'rgba(248,113,113,0.25)' },
    warn: { c: '#fbbf24', b: 'rgba(251,191,36,0.12)', br: 'rgba(251,191,36,0.25)' },
    ok: { c: '#4ade80', b: 'rgba(74,222,128,0.1)', br: 'rgba(74,222,128,0.22)' },
    none: { c: 'var(--u-text-4)', b: 'color-mix(in srgb, var(--u-text) 5%, transparent)', br: 'var(--u-hair)' },
  };
  const s = map[tone ?? 'none'];
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: s.c, padding: '2px 8px', borderRadius: 99, background: s.b, border: `1px solid ${s.br}` }}>
      {text}
    </span>
  );
}
