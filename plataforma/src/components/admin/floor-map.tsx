'use client';

/* FloorMap — visor del plano del salón para el mesero.
   Mapa ampliable y desplazable (zoom + paneo) para que las mesas se vean
   bien en CUALQUIER dispositivo: en un teléfono angosto se acerca con los
   dedos (pinch) o con los botones + / −; en PC con la rueda o los botones.
   Las posiciones de las mesas son relativas (0..1), así que el plano se
   mantiene fiel a lo diseñado y solo cambia el nivel de acercamiento. */

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import type { FloorTable } from '@/lib/theme/defaults';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const TAP_THRESHOLD = 7; // px de movimiento por debajo del cual cuenta como "toque"

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/* Token de mesa (también lo usa la cuadrícula y "Otras mesas"). */
export function TableToken({
  n, occupied, onTap, style,
}: {
  n: number;
  occupied: boolean;
  onTap: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="press"
      style={{
        borderRadius: 16, cursor: 'pointer',
        border: `1.5px solid ${occupied ? 'rgba(251,191,36,0.55)' : 'var(--u-hair-2)'}`,
        background: occupied ? 'rgba(251,191,36,0.14)' : 'rgba(255,255,255,0.05)',
        color: occupied ? '#fbbf24' : 'var(--u-text)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
        boxShadow: occupied ? '0 4px 14px rgba(251,191,36,0.18)' : '0 2px 10px rgba(0,0,0,0.18)',
        ...style,
      }}
    >
      <span style={{ fontSize: 10, color: occupied ? 'rgba(251,191,36,0.85)' : 'var(--u-text-4)', fontWeight: 600 }}>Mesa</span>
      <span style={{ fontSize: 23, fontWeight: 800, lineHeight: 1 }}>{n}</span>
      {occupied && <span style={{ fontSize: 9, fontWeight: 700, marginTop: 1 }}>● activa</span>}
    </button>
  );
}

interface Transform { s: number; x: number; y: number }

export default function FloorMap({
  tables,
  occupied,
  onSelect,
}: {
  tables: FloorTable[];
  occupied: Set<number>;
  onSelect: (n: number) => void;
}) {
  const vpRef = useRef<HTMLDivElement | null>(null);
  const [t, setT] = useState<Transform>({ s: 1, x: 0, y: 0 });

  // Estado del gesto (refs → no provocan re-render por cada movimiento).
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gesture = useRef<{ moved: boolean; lastDist: number; lastMid: { x: number; y: number } | null; last: { x: number; y: number } | null; downN: number | null }>({
    moved: false, lastDist: 0, lastMid: null, last: null, downN: null,
  });

  /* Limita el paneo para que el plano nunca se salga por completo de la vista. */
  function clampPan(s: number, x: number, y: number) {
    const vp = vpRef.current;
    if (!vp) return { x, y };
    const w = vp.clientWidth, h = vp.clientHeight;
    const minX = w - w * s; // ≤ 0 cuando s ≥ 1
    const minY = h - h * s;
    return { x: clamp(x, minX, 0), y: clamp(y, minY, 0) };
  }

  /* Zoom multiplicativo manteniendo fijo el punto (cx,cy) relativo a la vista. */
  function zoomBy(factor: number, cx: number, cy: number) {
    setT((prev) => {
      const s = clamp(prev.s * factor, MIN_SCALE, MAX_SCALE);
      if (s === prev.s) return prev;
      const wx = (cx - prev.x) / prev.s;
      const wy = (cy - prev.y) / prev.s;
      const c = clampPan(s, cx - wx * s, cy - wy * s);
      return { s, x: c.x, y: c.y };
    });
  }

  function panBy(dx: number, dy: number) {
    setT((prev) => {
      const c = clampPan(prev.s, prev.x + dx, prev.y + dy);
      return { ...prev, x: c.x, y: c.y };
    });
  }

  // Rueda del ratón: listener nativo no-pasivo para poder preventDefault.
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomBy(factor, e.clientX - rect.left, e.clientY - rect.top);
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function rel(e: React.PointerEvent) {
    const r = vpRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e: React.PointerEvent) {
    vpRef.current?.setPointerCapture(e.pointerId);
    const p = rel(e);
    pointers.current.set(e.pointerId, p);
    const tokenAttr = (e.target as HTMLElement).closest('[data-table]')?.getAttribute('data-table');
    if (pointers.current.size === 1) {
      gesture.current.moved = false;
      gesture.current.last = p;
      gesture.current.downN = tokenAttr ? Number(tokenAttr) : null;
    } else if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      gesture.current.lastDist = dist(pts[0], pts[1]);
      gesture.current.lastMid = mid(pts[0], pts[1]);
      gesture.current.moved = true; // un pinch nunca es un toque
      gesture.current.downN = null;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, rel(e));
    const pts = [...pointers.current.values()];

    if (pts.length >= 2) {
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
    const dx = p.x - last.x, dy = p.y - last.y;
    if (Math.abs(dx) > TAP_THRESHOLD || Math.abs(dy) > TAP_THRESHOLD) gesture.current.moved = true;
    if (gesture.current.moved) panBy(dx, dy);
    gesture.current.last = p;
  }

  function onPointerUp(e: React.PointerEvent) {
    const had = pointers.current.has(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (!had) return;
    if (pointers.current.size === 0) {
      // Toque (sin arrastre) sobre una mesa → seleccionar.
      if (!gesture.current.moved && gesture.current.downN != null) {
        onSelect(gesture.current.downN);
      }
      gesture.current.last = null;
      gesture.current.downN = null;
      gesture.current.lastMid = null;
    } else if (pointers.current.size === 1) {
      // Quedó un dedo: reanuda paneo desde su posición actual.
      const [pt] = [...pointers.current.values()];
      gesture.current.last = pt;
      gesture.current.lastMid = null;
    }
  }

  const zoomed = t.s > 1.001;

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={vpRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="floor-map-vp"
        style={{
          position: 'relative', width: '100%', overflow: 'hidden',
          borderRadius: 18, border: '1px solid var(--u-hair-2)',
          background:
            'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px) 0 0 / 100% 9%,' +
            'linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px) 0 0 / 6.25% 100%,' +
            'rgba(255,255,255,0.02)',
          touchAction: 'none', cursor: zoomed ? 'grab' : 'default', userSelect: 'none',
        }}
      >
        {/* Capa "mundo": se escala/desplaza en conjunto. */}
        <div style={{ position: 'absolute', inset: 0, transformOrigin: '0 0', transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})` }}>
          {tables.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--u-text-4)', fontSize: 13, textAlign: 'center', padding: 20 }}>
              Este nivel no tiene mesas colocadas.
            </div>
          )}
          {tables.map((tb) => {
            const isOcc = occupied.has(tb.n);
            return (
              <div
                key={tb.n}
                data-table={tb.n}
                style={{
                  position: 'absolute', left: `${tb.x * 100}%`, top: `${tb.y * 100}%`,
                  width: 64, height: 64, transform: 'translate(-50%, -50%)',
                  borderRadius: tb.shape === 'square' ? 14 : 99, cursor: 'pointer',
                  border: `1.5px solid ${isOcc ? 'rgba(251,191,36,0.55)' : 'var(--u-hair-2)'}`,
                  background: isOcc ? 'rgba(251,191,36,0.14)' : 'rgba(255,255,255,0.06)',
                  color: isOcc ? '#fbbf24' : 'var(--u-text)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                  boxShadow: isOcc ? '0 4px 14px rgba(251,191,36,0.2)' : '0 2px 10px rgba(0,0,0,0.22)',
                }}
              >
                <span style={{ fontSize: 9.5, color: isOcc ? 'rgba(251,191,36,0.85)' : 'var(--u-text-4)', fontWeight: 600, pointerEvents: 'none' }}>Mesa</span>
                <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, pointerEvents: 'none' }}>{tb.n}</span>
                {isOcc && <span style={{ fontSize: 8.5, fontWeight: 700, marginTop: 1, pointerEvents: 'none' }}>● activa</span>}
              </div>
            );
          })}
        </div>

        {/* Controles de zoom */}
        <div style={{ position: 'absolute', right: 10, bottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <ZoomBtn label="Acercar" onTap={() => { const vp = vpRef.current!; zoomBy(1.3, vp.clientWidth / 2, vp.clientHeight / 2); }}>+</ZoomBtn>
          <ZoomBtn label="Alejar" onTap={() => { const vp = vpRef.current!; zoomBy(1 / 1.3, vp.clientWidth / 2, vp.clientHeight / 2); }}>−</ZoomBtn>
          {zoomed && (
            <ZoomBtn label="Restablecer" onTap={() => setT({ s: 1, x: 0, y: 0 })}>
              <Icon name="x" size={15} />
            </ZoomBtn>
          )}
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 7, textAlign: 'center' }}>
        Pellizca o usa + / − para acercar el plano · arrastra para moverte
      </div>
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

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function mid(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
