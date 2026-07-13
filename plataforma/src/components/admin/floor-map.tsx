'use client';

/* FloorMap — visor del plano del salón para el mesero.
   Canvas virtual 1000×625: las mesas se posicionan en unidades virtuales y un
   único factor baseScale (containerWidth / 1000) escala TODO (posiciones Y
   tamaños) para que el plano se vea proporcionalmente idéntico en cualquier
   pantalla. El usuario puede hacer zoom adicional (pinch / botones). */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import type { FloorTable } from '@/lib/theme/defaults';

const VIRT_W = 1000;
const VIRT_H = 625;
const MAX_USER_ZOOM = 4;
const TAP_THRESHOLD = 7;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Tiempo ocupada, formato corto: "12m", "1h05". */
export function fmtOccupied(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}m`;
}

/** Umbrales fijos de antigüedad: recién ocupada / tardando / hay que revisarla. */
const OCCUPIED_WARN_MIN = 30;
const OCCUPIED_ALERT_MIN = 60;

/** Color de la mesa según cuánto lleva ocupada (más tiempo = más urgente). */
function occupiedColor(elapsedMs: number | null): string {
  if (elapsedMs == null) return '#fbbf24'; // sin dato aún: ámbar por defecto
  const min = elapsedMs / 60000;
  if (min >= OCCUPIED_ALERT_MIN) return '#f87171'; // roja: revisar la mesa
  if (min >= OCCUPIED_WARN_MIN) return '#f97316';  // naranja: se está tardando
  return '#fbbf24';                                 // ámbar: recién ocupada
}

/* Token de mesa (también lo usa la cuadrícula y "Otras mesas"). */
export function TableToken({
  n, occupied, since, now, onTap, style,
}: {
  n: number;
  occupied: boolean;
  /** ISO timestamp de cuándo se ocupó (para el temporizador). */
  since?: string;
  now?: number | null;
  onTap: () => void;
  style?: React.CSSProperties;
}) {
  const elapsedMs = occupied && since && now != null ? now - new Date(since).getTime() : null;
  const elapsed = elapsedMs != null ? fmtOccupied(elapsedMs) : null;
  const color = occupied ? occupiedColor(elapsedMs) : null;
  return (
    <button
      type="button"
      onClick={onTap}
      className="press"
      style={{
        borderRadius: 16, cursor: 'pointer',
        border: `1.5px solid ${color ? `color-mix(in srgb, ${color} 55%, transparent)` : 'var(--u-hair-2)'}`,
        background: color ? `color-mix(in srgb, ${color} 14%, transparent)` : 'color-mix(in srgb, var(--u-text) 5%, transparent)',
        color: color ?? 'var(--u-text)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
        boxShadow: color ? `0 4px 14px color-mix(in srgb, ${color} 18%, transparent)` : '0 2px 10px rgba(0,0,0,0.18)',
        transition: 'border-color .3s, background .3s, color .3s, box-shadow .3s',
        ...style,
      }}
    >
      <span style={{ fontSize: 11, color: color ? `color-mix(in srgb, ${color} 85%, transparent)` : 'var(--u-text-4)', fontWeight: 600 }}>Mesa</span>
      <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{n}</span>
      {occupied && <span style={{ fontSize: 11, fontWeight: 700, marginTop: 1 }}>● {elapsed ?? 'activa'}</span>}
    </button>
  );
}

interface Transform { s: number; x: number; y: number; base: number }

export default function FloorMap({
  tables,
  occupied,
  occupiedSince,
  now,
  onSelect,
}: {
  tables: FloorTable[];
  occupied: Set<number>;
  /** Mesa → ISO timestamp de cuándo se ocupó (para el temporizador). */
  occupiedSince?: Record<number, string>;
  now?: number | null;
  onSelect: (n: number) => void;
}) {
  const vpRef = useRef<HTMLDivElement | null>(null);
  // `base` = escala mínima (todo el plano cabe). Vive en el estado (no en un ref)
  // para poder leerlo en render sin romper la regla react-hooks/refs.
  const [t, setT] = useState<Transform>({ s: 1, x: 0, y: 0, base: 1 });

  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gesture = useRef<{ moved: boolean; lastDist: number; lastMid: { x: number; y: number } | null; last: { x: number; y: number } | null; start: { x: number; y: number } | null; downN: number | null }>({
    moved: false, lastDist: 0, lastMid: null, last: null, start: null, downN: null,
  });

  /* Limita el paneo: el mundo virtual nunca se sale por completo de la vista.
     Si el mundo es más chico que el viewport en un eje (el mapa es más alto
     que 16:10 en móvil para que quepan dos dedos al pellizcar), se centra. */
  function clampPanWith(s: number, x: number, y: number, vpW: number, vpH: number) {
    const axis = (v: number, world: number, vp: number) =>
      world <= vp ? (vp - world) / 2 : clamp(v, vp - world, 0);
    return { x: axis(x, VIRT_W * s, vpW), y: axis(y, VIRT_H * s, vpH) };
  }

  function clampPan(s: number, x: number, y: number) {
    const vp = vpRef.current;
    if (!vp) return { x, y };
    return clampPanWith(s, x, y, vp.clientWidth, vp.clientHeight);
  }

  /* Calcula baseScale inicial y lo actualiza al redimensionar la ventana. */
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
  }, []);

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
    // pointercancel, interrumpiendo el paneo. Excluye botones para que sus clicks sigan funcionando.
    const stopDefault = (e: TouchEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
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
  }, []);

  function rel(e: React.PointerEvent) {
    const r = vpRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault(); // impide que el browser tome control y dispare pointercancel
    // try/catch: si setPointerCapture lanza (pointer ya inactivo), el gesto
    // debe seguir registrándose — sin esto un throw aquí mataba el pellizco.
    try { vpRef.current?.setPointerCapture(e.pointerId); } catch { /* no-op */ }
    const p = rel(e);
    pointers.current.set(e.pointerId, p);
    const tokenAttr = (e.target as HTMLElement).closest('[data-table]')?.getAttribute('data-table');
    if (pointers.current.size === 1) {
      gesture.current.moved = false;
      gesture.current.last = p;
      gesture.current.start = p; // punto de origen para medir distancia acumulada
      gesture.current.downN = tokenAttr ? Number(tokenAttr) : null;
    } else if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      gesture.current.lastDist = dist(pts[0], pts[1]);
      gesture.current.lastMid = mid(pts[0], pts[1]);
      gesture.current.moved = true;
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
    // Mide distancia ACUMULADA desde el inicio (no por-paso): en móvil los eventos
    // llegan muy seguido con pasos de 2-3px; el check por-paso nunca superaba el
    // umbral aunque el dedo se moviera 30px → el paneo nunca arrancaba.
    if (!gesture.current.moved && gesture.current.start) {
      const tdx = p.x - gesture.current.start.x;
      const tdy = p.y - gesture.current.start.y;
      if (Math.abs(tdx) > TAP_THRESHOLD || Math.abs(tdy) > TAP_THRESHOLD) gesture.current.moved = true;
    }
    if (gesture.current.moved) panBy(dx, dy);
    gesture.current.last = p;
  }

  function onPointerUp(e: React.PointerEvent) {
    const had = pointers.current.has(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (!had) return;
    if (pointers.current.size === 0) {
      if (!gesture.current.moved && gesture.current.downN != null) {
        onSelect(gesture.current.downN);
      }
      gesture.current.last = null;
      gesture.current.downN = null;
      gesture.current.lastMid = null;
    } else if (pointers.current.size === 1) {
      const [pt] = [...pointers.current.values()];
      gesture.current.last = pt;
      gesture.current.lastMid = null;
    }
  }

  const zoomed = t.s > t.base * 1.001;

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
            'linear-gradient(color-mix(in srgb, var(--u-text) 3.5%, transparent) 1px, transparent 1px) 0 0 / 100% 9%,' +
            'linear-gradient(90deg, color-mix(in srgb, var(--u-text) 3.5%, transparent) 1px, transparent 1px) 0 0 / 6.25% 100%,' +
            'color-mix(in srgb, var(--u-text) 2%, transparent)',
          touchAction: 'none', cursor: zoomed ? 'grab' : 'default', userSelect: 'none',
        }}
      >
        {/* Mundo virtual: 1000×625 unidades, escalado para caber en el viewport. */}
        <div style={{
          position: 'absolute', left: 0, top: 0,
          width: VIRT_W, height: VIRT_H,
          transformOrigin: '0 0',
          transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`,
        }}>
          {tables.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--u-text-4)', fontSize: 13, textAlign: 'center', padding: 20 }}>
              Este nivel no tiene mesas colocadas.
            </div>
          )}
        </div>

        {/* Pines de mesa: tamaño FIJO en pantalla (como pines de mapa) → siempre
            cómodos de tocar en móvil/tablet sin importar el zoom. La posición se
            calcula aplicando el mismo transform (pan + zoom) al centro de la mesa. */}
        {tables.map((tb) => {
          const isOcc = occupied.has(tb.n);
          const since = occupiedSince?.[tb.n];
          const elapsedMs = isOcc && since && now != null ? now - new Date(since).getTime() : null;
          const elapsed = elapsedMs != null ? fmtOccupied(elapsedMs) : null;
          const color = isOcc ? occupiedColor(elapsedMs) : null;
          const sx = tb.x * VIRT_W * t.s + t.x;
          const sy = tb.y * VIRT_H * t.s + t.y;
          return (
            <div
              key={tb.n}
              data-table={tb.n}
              style={{
                position: 'absolute',
                left: sx, top: sy,
                width: 'var(--floor-pin, 50px)', height: 'var(--floor-pin, 50px)',
                transform: 'translate(-50%, -50%)',
                borderRadius: tb.shape === 'square' ? 13 : 99, cursor: 'pointer',
                border: `1.5px solid ${color ? `color-mix(in srgb, ${color} 60%, transparent)` : 'var(--u-hair-2)'}`,
                background: color ? `color-mix(in srgb, ${color} 18%, transparent)` : 'color-mix(in srgb, var(--brand-bg) 80%, transparent)',
                color: color ?? 'var(--u-text)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0,
                boxShadow: color ? `0 4px 14px color-mix(in srgb, ${color} 22%, transparent)` : '0 2px 10px rgba(0,0,0,0.3)',
                WebkitBackdropFilter: 'blur(2px)', backdropFilter: 'blur(2px)',
                transition: 'border-color .3s, background .3s, color .3s, box-shadow .3s',
              }}
            >
              <span style={{ fontSize: 10, color: color ? `color-mix(in srgb, ${color} 85%, transparent)` : 'var(--u-text-4)', fontWeight: 600, pointerEvents: 'none', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Mesa</span>
              <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, pointerEvents: 'none' }}>{tb.n}</span>
              {isOcc && <span style={{ fontSize: 9.5, fontWeight: 700, pointerEvents: 'none' }}>● {elapsed ?? 'activa'}</span>}
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
