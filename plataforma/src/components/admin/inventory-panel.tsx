'use client';

/* InventoryPanel — control de existencias por producto.
   Stepper rápido (+/−) vía adjustStock; stock exacto + umbral + on/off
   vía saveInventory. Badges de stock bajo / agotado. */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { adjustStock, saveInventory, getProductMovements } from '@/lib/actions/inventory';
import { Card } from '@/components/ui/card';
import { Stat, StatGroup } from '@/components/ui/stat';
import { Button } from '@/components/ui/button';
import type { Category, Product } from '@/types';
import type { StockMovement } from '@/lib/db/kardex';

const REASON_LABEL: Record<string, string> = {
  purchase: 'Compra a proveedor', sale: 'Venta', cancel: 'Cancelación', adjust: 'Ajuste manual', set: 'Stock fijado',
};

function MovementHistory({ movements }: { movements: StockMovement[] }) {
  if (movements.length === 0) {
    return <p style={{ fontSize: 12.5, color: 'var(--u-text-4)', padding: '6px 2px' }}>Sin movimientos registrados todavía.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 260, overflowY: 'auto' }}>
      {movements.map((m) => (
        <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '5px 2px', borderBottom: '1px solid var(--u-hair)' }}>
          <div>
            <div style={{ color: 'var(--u-text-2)' }}>{REASON_LABEL[m.reason] ?? m.reason}</div>
            <div style={{ color: 'var(--u-text-4)', fontSize: 10.5 }}>{new Date(m.created_at).toLocaleString('es-GT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          <div style={{ textAlign: 'right', fontFamily: 'var(--ui-font-mono)' }}>
            <div style={{ color: Number(m.delta) >= 0 ? 'var(--c-ok)' : 'var(--c-danger)' }}>{Number(m.delta) >= 0 ? '+' : ''}{m.delta}</div>
            {m.unit_cost != null && <div style={{ color: 'var(--u-text-3)', fontSize: 10.5 }}>costo Q{Number(m.unit_cost).toFixed(4)} · prom. Q{Number(m.avg_cost_after).toFixed(4)}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

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
      {/* Resumen: una sola tarjeta en columnas, con los números en la mono
          del panel — antes eran tres tarjetas sueltas con el número en la
          tipografía de titulares. */}
      <StatGroup>
        <Stat label="Con control" value={String(tracked.length)} />
        <Stat label="Stock bajo" value={String(low)} tone={low > 0 ? 'warn' : undefined} />
        <Stat label="Agotados" value={String(out)} tone={out > 0 ? 'danger' : undefined} />
      </StatGroup>

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

function Row({ product, restaurantId, last, onChanged }: { product: Product; restaurantId: string; last: boolean; onChanged: () => void }) {
  const [pending, start] = useTransition();
  const [stockVal, setStockVal] = useState(String(product.stock ?? 0));
  const [thresholdVal, setThresholdVal] = useState(String(product.low_stock_threshold ?? 0));
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<StockMovement[] | null>(null);
  const [loadingHistory, startHistory] = useTransition();

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

  function toggleHistory() {
    if (history !== null) { setHistory(null); return; }
    startHistory(async () => { setHistory(await getProductMovements(restaurantId, product.id)); });
  }

  return (
    <div style={{ padding: '12px 16px', borderBottom: last ? 'none' : '1px solid var(--u-hair)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14.5, color: 'var(--u-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
            <span style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 17, minWidth: 34, textAlign: 'center', color: isOut ? 'var(--c-danger)' : 'var(--u-text)' }}>
              {stock}
            </span>
            <Stepper onClick={() => quick(1)} disabled={pending} icon="plus" />
            <Button onClick={toggleHistory} disabled={loadingHistory} variant="secondary" size="icon" className="size-8.5" title="Historial (Kardex)">
              <Icon name="clock" size={15} />
            </Button>
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

      {/* Historial de movimientos (Kardex): entradas por compra, ventas, ajustes */}
      {history !== null && (
        <Card variant="flat" className="p-3">
          {loadingHistory ? <p style={{ fontSize: 12.5, color: 'var(--u-text-4)' }}>Cargando…</p> : <MovementHistory movements={history} />}
        </Card>
      )}

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
      <label className="adm-label">{label}</label>
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
    bad: { c: 'var(--c-danger)', b: 'var(--c-danger-bg)', br: 'var(--c-danger-line)' },
    warn: { c: 'var(--c-warn)', b: 'var(--c-warn-bg)', br: 'var(--c-warn-line)' },
    ok: { c: 'var(--c-ok)', b: 'var(--c-ok-bg)', br: 'var(--c-ok-line)' },
    none: { c: 'var(--u-text-4)', b: 'color-mix(in srgb, var(--u-text) 5%, transparent)', br: 'var(--u-hair)' },
  };
  const s = map[tone ?? 'none'];
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: s.c, padding: '2px 8px', borderRadius: 99, background: s.b, border: `1px solid ${s.br}` }}>
      {text}
    </span>
  );
}
