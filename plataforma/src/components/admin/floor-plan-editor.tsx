'use client';

/* FloorPlanEditor — diseñador del plano del salón.
   El restaurante coloca cada mesa donde está físicamente, en uno o varios
   niveles (pisos). "Toca para colocar, arrastra para posicionar". Las
   posiciones son relativas (0..1) al lienzo → se ven igual en cualquier
   pantalla. Funciona con mouse y con el dedo (pointer events). */

import { useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import type { FloorPlan, FloorTable } from '@/lib/theme/defaults';

const MAX_LEVELS = 3;
const TOKEN = 54; // px del token de mesa

function uid(): string {
  return `l${Math.random().toString(36).slice(2, 8)}`;
}

/** Mesas (1..count) que NO están colocadas en ningún nivel. */
function unplacedTables(count: number, tables: FloorTable[]): number[] {
  const placed = new Set(tables.map((t) => t.n));
  const out: number[] = [];
  for (let n = 1; n <= count; n++) if (!placed.has(n)) out.push(n);
  return out;
}

export default function FloorPlanEditor({
  tableCount,
  value,
  onChange,
}: {
  tableCount: number;
  value: FloorPlan;
  onChange: (fp: FloorPlan) => void;
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [activeLevel, setActiveLevel] = useState<string>(value.levels[0]?.id ?? 'l1');
  const [renaming, setRenaming] = useState<string | null>(null);
  const dragRef = useRef<{ n: number; pointerId: number } | null>(null);

  const levels = value.levels.length > 0 ? value.levels : [{ id: 'l1', name: 'Planta baja' }];
  const active = levels.some((l) => l.id === activeLevel) ? activeLevel : levels[0].id;

  // Solo mesas válidas (n ≤ tableCount) y del nivel activo.
  const tablesOnLevel = value.tables.filter((t) => t.level === active && t.n <= tableCount);
  const tray = unplacedTables(tableCount, value.tables.filter((t) => t.n <= tableCount));

  function patch(p: Partial<FloorPlan>) {
    onChange({ ...value, ...p });
  }

  function setTables(tables: FloorTable[]) {
    patch({ tables });
  }

  /* ── Niveles ─────────────────────────────────────────── */
  function addLevel() {
    if (levels.length >= MAX_LEVELS) return;
    const id = uid();
    const names = ['Planta baja', 'Segundo nivel', 'Tercer nivel'];
    patch({ levels: [...levels, { id, name: names[levels.length] ?? `Nivel ${levels.length + 1}` }] });
    setActiveLevel(id);
  }

  function removeLevel(id: string) {
    if (levels.length <= 1) return;
    const remaining = levels.filter((l) => l.id !== id);
    // Las mesas del nivel borrado vuelven a "sin ubicar".
    setTables(value.tables.filter((t) => t.level !== id));
    patch({ levels: remaining });
    if (active === id) setActiveLevel(remaining[0].id);
  }

  function renameLevel(id: string, name: string) {
    patch({ levels: levels.map((l) => (l.id === id ? { ...l, name } : l)) });
  }

  /* ── Colocar / quitar mesas ──────────────────────────── */
  function placeTable(n: number) {
    const countHere = tablesOnLevel.length;
    const col = countHere % 6;
    const rowi = Math.floor(countHere / 6);
    const x = Math.min(0.92, 0.1 + col * 0.15);
    const y = Math.min(0.9, 0.14 + rowi * 0.2);
    setTables([...value.tables, { n, level: active, x, y, shape: 'circle' }]);
  }

  function unplaceTable(n: number) {
    setTables(value.tables.filter((t) => t.n !== n));
  }

  function moveTable(n: number, x: number, y: number) {
    setTables(value.tables.map((t) => (t.n === n ? { ...t, x, y } : t)));
  }

  /* ── Arrastre (pointer events) ───────────────────────── */
  function onTokenPointerDown(e: React.PointerEvent, n: number) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { n, pointerId: e.pointerId };
  }

  function onTokenPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clamp((e.clientX - rect.left) / rect.width, 0.05, 0.95);
    const y = clamp((e.clientY - rect.top) / rect.height, 0.06, 0.94);
    moveTable(d.n, x, y);
  }

  function onTokenPointerUp(e: React.PointerEvent) {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  }

  const enabled = value.enabled;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--u-text)', marginBottom: 3 }}>Plano del salón</div>
          <div style={{ fontSize: 12.5, color: 'var(--u-text-4)', lineHeight: 1.45 }}>
            Coloca cada mesa donde está en tu restaurante. El mesero la verá en el mismo lugar.
          </div>
        </div>
        <button
          type="button"
          onClick={() => patch({ enabled: !enabled })}
          className="press"
          style={{
            width: 44, height: 26, borderRadius: 99, border: 'none', cursor: 'pointer', padding: 3,
            background: enabled ? 'var(--u-text)' : 'rgba(255,255,255,0.12)',
            display: 'flex', justifyContent: enabled ? 'flex-end' : 'flex-start',
            transition: 'background 180ms', flexShrink: 0,
          }}
        >
          <span style={{ width: 20, height: 20, borderRadius: 99, background: enabled ? 'var(--brand-bg)' : 'var(--u-text)' }} />
        </button>
      </div>

      {!enabled ? (
        <div style={{ fontSize: 12.5, color: 'var(--u-text-4)', padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--u-hair)', lineHeight: 1.5 }}>
          Desactivado: el mesero verá las mesas en una cuadrícula automática. Actívalo para diseñar tu salón por niveles.
        </div>
      ) : (
        <>
          {/* Niveles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {levels.map((l) => {
              const on = l.id === active;
              return (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center' }}>
                  {renaming === l.id ? (
                    <input
                      autoFocus
                      value={l.name}
                      onChange={(e) => renameLevel(l.id, e.target.value)}
                      onBlur={() => setRenaming(null)}
                      onKeyDown={(e) => { if (e.key === 'Enter') setRenaming(null); }}
                      style={{ width: 130, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--u-hair-2)', borderRadius: 99, padding: '7px 12px', color: 'var(--u-text)', fontSize: 13, outline: 'none' }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => (on ? setRenaming(l.id) : setActiveLevel(l.id))}
                      className="press"
                      title={on ? 'Toca de nuevo para renombrar' : ''}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 99, cursor: 'pointer',
                        border: `1px solid ${on ? 'transparent' : 'var(--u-hair)'}`,
                        background: on ? 'var(--u-text)' : 'rgba(255,255,255,0.04)',
                        color: on ? 'var(--brand-bg)' : 'var(--u-text-2)', fontSize: 13, fontWeight: 600,
                      }}
                    >
                      {l.name}
                      {on && <Icon name="edit" size={12} />}
                      {on && levels.length > 1 && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); removeLevel(l.id); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); removeLevel(l.id); } }}
                          style={{ display: 'grid', placeItems: 'center', marginLeft: 1, opacity: 0.75 }}
                        >
                          <Icon name="x" size={12} />
                        </span>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
            {levels.length < MAX_LEVELS && (
              <button
                type="button"
                onClick={addLevel}
                className="press"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 99, cursor: 'pointer', border: '1px dashed var(--u-hair-2)', background: 'transparent', color: 'var(--u-text-3)', fontSize: 12.5, fontWeight: 600 }}
              >
                <Icon name="plus" size={13} /> Nivel
              </button>
            )}
          </div>

          {/* Lienzo */}
          <div
            ref={canvasRef}
            onPointerMove={onTokenPointerMove}
            style={{
              position: 'relative', width: '100%', aspectRatio: '16 / 10',
              borderRadius: 16, overflow: 'hidden',
              border: '1px solid var(--u-hair-2)',
              background:
                'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px) 0 0 / 100% 9%,' +
                'linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px) 0 0 / 6.25% 100%,' +
                'rgba(255,255,255,0.02)',
              touchAction: 'none',
            }}
          >
            {tablesOnLevel.length === 0 && (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--u-text-4)', fontSize: 13, textAlign: 'center', padding: 20, pointerEvents: 'none' }}>
                Toca una mesa de abajo para colocarla aquí,<br />luego arrástrala a su lugar.
              </div>
            )}
            {tablesOnLevel.map((t) => (
              <div
                key={t.n}
                onPointerDown={(e) => onTokenPointerDown(e, t.n)}
                onPointerUp={onTokenPointerUp}
                style={{
                  position: 'absolute', left: `${t.x * 100}%`, top: `${t.y * 100}%`,
                  width: TOKEN, height: TOKEN, transform: 'translate(-50%, -50%)',
                  borderRadius: t.shape === 'square' ? 12 : 99,
                  background: 'var(--brand-accent)', color: 'var(--brand-on-accent, #fff)',
                  display: 'grid', placeItems: 'center', cursor: 'grab',
                  fontWeight: 800, fontSize: 18, userSelect: 'none', touchAction: 'none',
                  boxShadow: '0 4px 14px color-mix(in srgb, var(--brand-accent) 40%, transparent)',
                  border: '2px solid rgba(255,255,255,0.25)',
                }}
              >
                {t.n}
                <span
                  role="button"
                  tabIndex={0}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); unplaceTable(t.n); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') unplaceTable(t.n); }}
                  style={{ position: 'absolute', top: -7, right: -7, width: 20, height: 20, borderRadius: 99, background: 'var(--brand-bg)', border: '1px solid var(--u-hair-2)', display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--u-text)' }}
                >
                  <Icon name="x" size={11} />
                </span>
              </div>
            ))}
          </div>

          {/* Bandeja: mesas sin ubicar */}
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--u-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Mesas sin ubicar {tray.length > 0 ? `(${tray.length})` : ''}
            </div>
            {tray.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--u-text-4)' }}>Todas las mesas están colocadas. 🎉</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {tray.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => placeTable(n)}
                    className="press"
                    title={`Colocar mesa ${n} en ${levels.find((l) => l.id === active)?.name ?? 'este nivel'}`}
                    style={{ width: 44, height: 44, borderRadius: 12, cursor: 'pointer', border: '1px solid var(--u-hair-2)', background: 'rgba(255,255,255,0.04)', color: 'var(--u-text)', fontWeight: 700, fontSize: 15 }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
