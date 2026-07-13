'use client';

/* FloorPlanEditor — diseñador del plano del salón.
   Canvas virtual 1000×625 con zoom y paneo (pellizco, rueda o botones), igual
   que el visor del mesero: un factor baseScale (containerWidth / 1000) hace que
   el plano quepa completo, y el usuario puede acercarse hasta 4× para colocar
   mesas con precisión en pantallas chicas. Los tokens se dibujan con tamaño
   FIJO en pantalla (cómodos al dedo) y su posición se calcula aplicando el
   transform (pan + zoom) a sus coordenadas relativas 0..1. */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import type { FloorPlan, FloorTable } from '@/lib/theme/defaults';

const MAX_LEVELS = 3;
const VIRT_W = 1000;
const VIRT_H = 625;
const MAX_USER_ZOOM = 4;

function uid(): string {
  return `l${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function mid(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Mesas (1..count) que NO están colocadas en ningún nivel. */
function unplacedTables(count: number, tables: FloorTable[]): number[] {
  const placed = new Set(tables.map((t) => t.n));
  const out: number[] = [];
  for (let n = 1; n <= count; n++) if (!placed.has(n)) out.push(n);
  return out;
}

interface Transform { s: number; x: number; y: number; base: number }

type GestureMode = 'none' | 'drag' | 'pan' | 'pinch';

export default function FloorPlanEditor({
  tableCount,
  value,
  onChange,
}: {
  tableCount: number;
  value: FloorPlan;
  onChange: (fp: FloorPlan) => void;
}) {
  const vpRef = useRef<HTMLDivElement | null>(null);
  const [activeLevel, setActiveLevel] = useState<string>(value.levels[0]?.id ?? 'l1');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragN, setDragN] = useState<number | null>(null);

  // ── Zoom / paneo ──
  const [t, setT] = useState<Transform>({ s: 1, x: 0, y: 0, base: 1 });
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gesture = useRef<{ mode: GestureMode; n: number | null; lastDist: number; lastMid: { x: number; y: number } | null; last: { x: number; y: number } | null }>({
    mode: 'none', n: null, lastDist: 0, lastMid: null, last: null,
  });

  const levels = value.levels.length > 0 ? value.levels : [{ id: 'l1', name: 'Planta baja' }];
  const active = levels.some((l) => l.id === activeLevel) ? activeLevel : levels[0].id;

  const tablesOnLevel = value.tables.filter((tb) => tb.level === active && tb.n <= tableCount);
  const tray = unplacedTables(tableCount, value.tables.filter((tb) => tb.n <= tableCount));

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
    patch({ levels: remaining, tables: value.tables.filter((tb) => tb.level !== id) });
    if (active === id) setActiveLevel(remaining[0].id);
  }

  function renameLevel(id: string, name: string) {
    patch({ levels: levels.map((l) => (l.id === id ? { ...l, name } : l)) });
  }

  /* ── Colocar / quitar / mover mesas ──────────────────── */
  function placeTable(n: number) {
    const countHere = tablesOnLevel.length;
    const col = countHere % 6;
    const rowi = Math.floor(countHere / 6);
    const x = Math.min(0.92, 0.1 + col * 0.15);
    const y = Math.min(0.9, 0.14 + rowi * 0.2);
    setTables([...value.tables, { n, level: active, x, y, shape: 'circle' }]);
  }

  function unplaceTable(n: number) {
    setTables(value.tables.filter((tb) => tb.n !== n));
  }

  function moveTable(n: number, x: number, y: number) {
    setTables(value.tables.map((tb) => (tb.n === n ? { ...tb, x, y } : tb)));
  }

  /* ── Zoom / paneo (mismo modelo que el visor del mesero) ── */

  /* Limita el paneo; si el mundo es más chico que el viewport en un eje
     (letterbox por minHeight), se centra en ese eje. */
  function clampPanWith(s: number, x: number, y: number, vpW: number, vpH: number) {
    const wW = VIRT_W * s;
    const wH = VIRT_H * s;
    const axis = (v: number, world: number, vp: number) =>
      world <= vp ? (vp - world) / 2 : clamp(v, vp - world, 0);
    return { x: axis(x, wW, vpW), y: axis(y, wH, vpH) };
  }

  function clampPan(s: number, x: number, y: number) {
    const vp = vpRef.current;
    if (!vp) return { x, y };
    return clampPanWith(s, x, y, vp.clientWidth, vp.clientHeight);
  }

  /* baseScale inicial + actualización al redimensionar. Depende de
     `value.enabled` porque el lienzo solo existe con el plano activado:
     si el efecto corriera solo al montar (deps []), vpRef sería null y el
     zoom quedaría muerto al activar el plano después. */
  useLayoutEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const update = () => {
      const newBase = vp.clientWidth / VIRT_W;
      setT((prev) => {
        const ratio = newBase / prev.base;
        const s = Math.max(prev.s * ratio, newBase);
        return { s, base: newBase, ...clampPanWith(s, prev.x * ratio, prev.y * ratio, vp.clientWidth, vp.clientHeight) };
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(vp);
    return () => ro.disconnect();
  }, [value.enabled]);

  /* Zoom multiplicativo manteniendo fijo el punto (cx,cy). */
  function zoomBy(factor: number, cx: number, cy: number) {
    setT((prev) => {
      const minS = prev.base;
      const s = clamp(prev.s * factor, minS, minS * MAX_USER_ZOOM);
      if (s === prev.s) return prev;
      const wx = (cx - prev.x) / prev.s;
      const wy = (cy - prev.y) / prev.s;
      const c = clampPan(s, cx - wx * s, cy - wy * s);
      return { s, x: c.x, y: c.y, base: prev.base };
    });
  }

  function panBy(dx: number, dy: number) {
    setT((prev) => {
      const c = clampPan(prev.s, prev.x + dx, prev.y + dy);
      return { ...prev, x: c.x, y: c.y };
    });
  }

  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomBy(factor, e.clientX - rect.left, e.clientY - rect.top);
    };
    // Evita que el browser móvil tome control del touch (scroll nativo) y dispare
    // pointercancel, interrumpiendo el arrastre/pellizco. Excluye los controles
    // (botones de zoom, quitar mesa) para que sus taps sigan funcionando.
    const stopDefault = (e: TouchEvent) => {
      if ((e.target as HTMLElement).closest('button,[role="button"]')) return;
      e.preventDefault();
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    vp.addEventListener('touchstart', stopDefault, { passive: false });
    vp.addEventListener('touchmove', stopDefault, { passive: false });
    return () => {
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('touchstart', stopDefault as EventListener);
      vp.removeEventListener('touchmove', stopDefault as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.enabled]);

  function rel(e: React.PointerEvent) {
    const r = vpRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /* ── Gestos: 1 dedo sobre mesa = arrastrarla · 1 dedo en el piso = paneo
       · 2 dedos = pellizco (zoom), cancelando cualquier arrastre. ── */
  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('[role="button"]')) return; // quitar mesa
    e.preventDefault();
    // try/catch: setPointerCapture lanza NotFoundError si el pointer ya no está
    // activo (p. ej. levantó el dedo en el mismo frame); no debe matar el gesto.
    try { vpRef.current?.setPointerCapture(e.pointerId); } catch { /* no-op */ }
    const p = rel(e);
    pointers.current.set(e.pointerId, p);

    if (pointers.current.size === 1) {
      const tokenAttr = (e.target as HTMLElement).closest('[data-token]')?.getAttribute('data-token');
      if (tokenAttr) {
        gesture.current.mode = 'drag';
        gesture.current.n = Number(tokenAttr);
        setDragN(gesture.current.n);
      } else {
        gesture.current.mode = 'pan';
        gesture.current.n = null;
      }
      gesture.current.last = p;
    } else if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      gesture.current.mode = 'pinch';
      gesture.current.n = null;
      gesture.current.lastDist = dist(pts[0], pts[1]);
      gesture.current.lastMid = mid(pts[0], pts[1]);
      setDragN(null);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, rel(e));
    const pts = [...pointers.current.values()];

    if (gesture.current.mode === 'pinch' && pts.length >= 2) {
      const d = dist(pts[0], pts[1]);
      const m = mid(pts[0], pts[1]);
      if (gesture.current.lastDist > 0) zoomBy(d / gesture.current.lastDist, m.x, m.y);
      if (gesture.current.lastMid) panBy(m.x - gesture.current.lastMid.x, m.y - gesture.current.lastMid.y);
      gesture.current.lastDist = d;
      gesture.current.lastMid = m;
      return;
    }

    const p = pts[0];
    const last = gesture.current.last;
    if (!last) return;

    if (gesture.current.mode === 'drag' && gesture.current.n != null) {
      // Pantalla → mundo (des-aplica pan y zoom) → coordenadas relativas 0..1.
      const wx = clamp((p.x - t.x) / t.s / VIRT_W, 0.05, 0.95);
      const wy = clamp((p.y - t.y) / t.s / VIRT_H, 0.06, 0.94);
      moveTable(gesture.current.n, wx, wy);
    } else if (gesture.current.mode === 'pan') {
      panBy(p.x - last.x, p.y - last.y);
    }
    gesture.current.last = p;
  }

  function onPointerUp(e: React.PointerEvent) {
    const had = pointers.current.has(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (!had) return;
    if (pointers.current.size === 0) {
      gesture.current.mode = 'none';
      gesture.current.n = null;
      gesture.current.last = null;
      gesture.current.lastMid = null;
      setDragN(null);
    } else if (pointers.current.size === 1) {
      // De pellizco a paneo con el dedo que queda.
      const [pt] = [...pointers.current.values()];
      gesture.current.mode = 'pan';
      gesture.current.last = pt;
      gesture.current.lastMid = null;
    }
  }

  const enabled = value.enabled;
  const zoomed = t.s > t.base * 1.001;

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
            background: enabled ? 'var(--u-text)' : 'color-mix(in srgb, var(--u-text) 12%, transparent)',
            display: 'flex', justifyContent: enabled ? 'flex-end' : 'flex-start',
            transition: 'background 180ms', flexShrink: 0,
          }}
        >
          <span style={{ width: 20, height: 20, borderRadius: 99, background: enabled ? 'var(--brand-bg)' : 'var(--u-text)' }} />
        </button>
      </div>

      {!enabled ? (
        <div style={{ fontSize: 12.5, color: 'var(--u-text-4)', padding: '12px 14px', borderRadius: 12, background: 'color-mix(in srgb, var(--u-text) 3%, transparent)', border: '1px solid var(--u-hair)', lineHeight: 1.5 }}>
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
                      style={{ width: 130, background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', border: '1px solid var(--u-hair-2)', borderRadius: 99, padding: '7px 12px', color: 'var(--u-text)', fontSize: 13, outline: 'none' }}
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
                        background: on ? 'var(--u-text)' : 'color-mix(in srgb, var(--u-text) 4%, transparent)',
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

          {/* Lienzo con zoom/paneo — los tokens tienen tamaño FIJO en pantalla
              (cómodo al dedo); su posición aplica el transform del mundo. */}
          <div
            ref={vpRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="floor-edit-canvas"
            style={{
              position: 'relative', width: '100%', aspectRatio: `${VIRT_W} / ${VIRT_H}`,
              minHeight: 300,
              borderRadius: 16, overflow: 'hidden',
              border: '1px solid var(--u-hair-2)',
              background: 'color-mix(in srgb, var(--u-text) 2%, transparent)',
              touchAction: 'none', userSelect: 'none',
              cursor: zoomed ? 'grab' : 'default',
            }}
          >
            {/* Mundo virtual: la cuadrícula del piso se mueve con el zoom/paneo. */}
            <div
              aria-hidden
              style={{
                position: 'absolute', left: 0, top: 0,
                width: VIRT_W, height: VIRT_H,
                transformOrigin: '0 0',
                transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`,
                background:
                  'linear-gradient(color-mix(in srgb, var(--u-text) 4%, transparent) 2px, transparent 2px) 0 0 / 100% 9%,' +
                  'linear-gradient(90deg, color-mix(in srgb, var(--u-text) 4%, transparent) 2px, transparent 2px) 0 0 / 6.25% 100%,' +
                  'color-mix(in srgb, var(--u-text) 2%, transparent)',
                pointerEvents: 'none',
              }}
            />
            {tablesOnLevel.length === 0 && (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--u-text-4)', fontSize: 13, textAlign: 'center', padding: 20, pointerEvents: 'none' }}>
                Toca una mesa de abajo para colocarla aquí,<br />luego arrástrala a su lugar con el dedo.
              </div>
            )}
            {tablesOnLevel.map((tb) => {
              const dragging = dragN === tb.n;
              const sx = tb.x * VIRT_W * t.s + t.x;
              const sy = tb.y * VIRT_H * t.s + t.y;
              return (
                <div
                  key={tb.n}
                  data-token={tb.n}
                  style={{
                    position: 'absolute',
                    left: sx,
                    top: sy,
                    width: 'var(--floor-token, 68px)', height: 'var(--floor-token, 68px)',
                    transform: `translate(-50%, -50%) scale(${dragging ? 1.12 : 1})`,
                    transition: dragging ? 'none' : 'transform 120ms',
                    borderRadius: tb.shape === 'square' ? 14 : 99,
                    border: `2px solid ${dragging ? 'var(--brand-accent)' : 'var(--u-hair-2)'}`,
                    background: dragging ? 'color-mix(in srgb, var(--brand-accent) 18%, var(--brand-bg))' : 'color-mix(in srgb, var(--brand-bg) 85%, transparent)',
                    color: 'var(--u-text)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0,
                    cursor: 'grab', userSelect: 'none', touchAction: 'none',
                    boxShadow: dragging ? '0 8px 24px rgba(0,0,0,0.35)' : '0 2px 10px rgba(0,0,0,0.22)',
                    zIndex: dragging ? 5 : 1,
                  }}
                >
                  <span style={{ fontSize: 8.5, color: 'var(--u-text-4)', fontWeight: 600, pointerEvents: 'none', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Mesa</span>
                  <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1, pointerEvents: 'none' }}>{tb.n}</span>
                  <span
                    role="button"
                    aria-label={`Quitar mesa ${tb.n}`}
                    tabIndex={0}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); unplaceTable(tb.n); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') unplaceTable(tb.n); }}
                    style={{ position: 'absolute', top: -9, right: -9, width: 24, height: 24, borderRadius: 99, background: 'var(--brand-bg)', border: '1px solid var(--u-hair-2)', display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--u-text)' }}
                  >
                    <Icon name="x" size={12} />
                  </span>
                </div>
              );
            })}

            {/* Controles de zoom */}
            <div style={{ position: 'absolute', right: 10, bottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <ZoomBtn label="Acercar" onTap={() => { const vp = vpRef.current!; zoomBy(1.3, vp.clientWidth / 2, vp.clientHeight / 2); }}>+</ZoomBtn>
              <ZoomBtn label="Alejar" onTap={() => { const vp = vpRef.current!; zoomBy(1 / 1.3, vp.clientWidth / 2, vp.clientHeight / 2); }}>−</ZoomBtn>
              {zoomed && (
                <ZoomBtn label="Restablecer" onTap={() => setT((prev) => ({ s: prev.base, x: 0, y: 0, base: prev.base }))}>
                  <Icon name="x" size={15} />
                </ZoomBtn>
              )}
            </div>
          </div>

          <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: -6, textAlign: 'center' }}>
            Pellizca o usa + / − para acercar el plano · arrastra el piso para moverte · arrastra una mesa para colocarla
          </div>

          {/* Bandeja: mesas sin ubicar */}
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--u-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Mesas sin ubicar {tray.length > 0 ? `(${tray.length})` : ''}
            </div>
            {tray.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--u-text-4)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="checkCircle" size={14} style={{ color: '#4ade80' }} /> Todas las mesas están colocadas.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {tray.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => placeTable(n)}
                    className="press"
                    title={`Colocar mesa ${n} en ${levels.find((l) => l.id === active)?.name ?? 'este nivel'}`}
                    style={{ width: 44, height: 44, borderRadius: 12, cursor: 'pointer', border: '1px solid var(--u-hair-2)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', color: 'var(--u-text)', fontWeight: 700, fontSize: 15 }}
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

function ZoomBtn({ children, label, onTap }: { children: React.ReactNode; label: string; onTap: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onTap}
      className="press glass-quiet"
      style={{ width: 38, height: 38, borderRadius: 11, border: '1px solid var(--u-hair-2)', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 700, color: 'var(--u-text)', lineHeight: 1 }}
    >
      {children}
    </button>
  );
}
