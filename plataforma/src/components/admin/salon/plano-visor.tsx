'use client';

/* ============================================================
   EL VISOR DEL PLANO — lo comparten Pedidos › Mesas y Tomar pedidos
   ------------------------------------------------------------
   Mide el hueco que le dan, pide a `lib/plano-salon.ts` cómo acomodar
   el local ahí dentro y coloca cada mesa en su sitio. Qué se dibuja en
   cada mesa lo decide quien lo usa (`renderMesa`): el dueño ve una
   ficha con mesero y monto, el mesero un número con su color.

   Lo que trae de los POS de referencia:
     · el plano CABE: nada de anchos mínimos ni de página corrida de
       lado; si el local es ancho y el teléfono vertical, se gira;
     · pellizcar para acercar (y Ctrl + rueda en PC, y botones para
       quien no pellizca), con el punto bajo los dedos quieto;
     · las mesas crecen con el zoom y enseñan más cuanto más grandes
       son, en vez de un tamaño único que en un local apretado se
       enciman y en uno amplio sobran.
   ============================================================ */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/icons';
import {
  COMPLETO, densidadDeMesa, disponerPlano, disponerRejilla, encuadrar,
  type Densidad, type Giro, type Rect,
} from '@/lib/plano-salon';
import type { FloorFixture } from '@/lib/theme/defaults';

export interface GeoMesa { ancho: number; alto: number; densidad: Densidad }

interface Props {
  /** Mesas colocadas en el plano, en coordenadas del local (0..1). */
  colocadas: { n: number; x: number; y: number }[];
  /** Sin plano dibujado: los números que se reparten en rejilla. */
  numeros?: number[];
  zonas?: FloorFixture[];
  /** Ancho ÷ alto de cada mesa. */
  proporcion?: number;
  mesaMax?: number;
  renderMesa: (n: number, geo: GeoMesa) => ReactNode;
  renderZona?: (f: FloorFixture) => ReactNode;
  /** Dónde se recuerda el giro elegido, por aparato. */
  claveGiro: string;
  className?: string;
}

const ZOOM_MAX = 3;
/** Aire entre el lienzo y el borde del visor: media mesa mínima. */
const PAD = 22;

const clamp = (z: number) => Math.min(ZOOM_MAX, Math.max(1, z));

/**
 * El giro que eligió quien mira, guardado POR ORIENTACIÓN del hueco: girar
 * el plano en el teléfono vertical no debe girarlo en la tablet apaisada.
 */
function useGiro(clave: string, vertical: boolean | null): [Giro, (g: Giro) => void] {
  const [giro, setGiro] = useState<Giro>('auto');
  const k = vertical == null ? null : `${clave}:${vertical ? 'v' : 'h'}`;
  useEffect(() => {
    if (!k) return;
    try {
      const v = localStorage.getItem(k);
      setGiro(v === 'normal' || v === 'girado' ? v : 'auto');
    } catch { setGiro('auto'); }
  }, [k]);
  const elegir = (g: Giro) => {
    setGiro(g);
    if (!k) return;
    try { localStorage.setItem(k, g); } catch { /* sin almacenamiento */ }
  };
  return [giro, elegir];
}

export default function PlanoVisor({
  colocadas, numeros = [], zonas = [], proporcion = 1, mesaMax = 96,
  renderMesa, renderZona, claveGiro, className,
}: Props) {
  const box = useRef<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const [tam, setTam] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const pendiente = useRef<{ fx: number; fy: number; z0: number; z1: number; sl: number; st: number } | null>(null);

  /* Se mide el VISOR, no la ventana: dentro del panel la barra lateral se
     lleva 244 px y en Tomar pedidos el plano vive en una capa. */
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const medir = () => {
      const w = el.clientWidth - PAD * 2;
      const h = el.clientHeight - PAD * 2;
      if (w > 0 && h > 0) setTam((prev) => (prev && Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1 ? prev : { w, h }));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    // Respaldo: en una pestaña que no pinta el observador se retrasa.
    window.addEventListener('resize', medir);
    return () => { ro.disconnect(); window.removeEventListener('resize', medir); };
  }, []);

  const [giro, setGiro] = useGiro(claveGiro, tam ? tam.h > tam.w : null);

  const auto = colocadas.length === 0;
  const enc = useMemo(() => (auto ? COMPLETO : encuadrar([
    ...colocadas.map((t) => ({ x0: t.x, y0: t.y, x1: t.x, y1: t.y })),
    ...zonas.map((f) => ({ x0: f.x - f.w / 2, y0: f.y - f.h / 2, x1: f.x + f.w / 2, y1: f.y + f.h / 2 })),
  ])), [auto, colocadas, zonas]);

  const geo = useMemo(() => {
    if (!tam) return null;
    if (auto) {
      const r = disponerRejilla(numeros.length, tam.w, tam.h, { proporcion, mesaMax });
      return {
        ancho: r.ancho, alto: r.alto, mesa: r.mesa, girado: false,
        sitios: numeros.map((n, i) => ({ n, ...r.punto(i) })),
        zonas: [] as { f: FloorFixture; r: Rect }[],
      };
    }
    const d = disponerPlano(enc, colocadas, tam.w, tam.h, { proporcion, mesaMax, giro });
    return {
      ancho: d.ancho, alto: d.alto, mesa: d.mesa, girado: d.girado,
      sitios: colocadas.map((t) => ({ n: t.n, ...d.punto(t.x, t.y) })),
      zonas: zonas.map((f) => ({ f, r: d.caja(f) })),
    };
  }, [tam, auto, numeros, enc, colocadas, zonas, proporcion, mesaMax, giro]);

  /** Cambia el zoom dejando quieto el punto (fx, fy) del visor. */
  const zoomEn = useCallback((z: number, fx?: number, fy?: number) => {
    const el = scroller.current;
    const z1 = clamp(z);
    const z0 = zoomRef.current;
    if (!el || Math.abs(z1 - z0) < 0.001) return;
    pendiente.current = {
      fx: fx ?? el.clientWidth / 2, fy: fy ?? el.clientHeight / 2,
      z0, z1, sl: el.scrollLeft, st: el.scrollTop,
    };
    zoomRef.current = z1;
    setZoom(z1);
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    const p = pendiente.current;
    if (!el || !p) return;
    pendiente.current = null;
    el.scrollLeft = (p.sl + p.fx) * (p.z1 / p.z0) - p.fx;
    el.scrollTop = (p.st + p.fy) * (p.z1 / p.z0) - p.fy;
  }, [zoom]);

  /* Pellizco con eventos táctiles, no de puntero: en cuanto el navegador
     empieza a desplazar con un dedo cancela ese puntero, y el segundo dedo
     llegaría huérfano. `touch-action: pan-x pan-y` en el CSS impide que el
     pellizco amplíe la página entera. */
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let d0 = 0;
    let z0 = 1;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const centro = (t: TouchList) => {
      const r = el.getBoundingClientRect();
      return { x: (t[0].clientX + t[1].clientX) / 2 - r.left, y: (t[0].clientY + t[1].clientY) / 2 - r.top };
    };
    const start = (e: TouchEvent) => {
      if (e.touches.length === 2) { d0 = dist(e.touches); z0 = zoomRef.current; }
    };
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !d0) return;
      e.preventDefault();
      const c = centro(e.touches);
      zoomEn(z0 * (dist(e.touches) / d0), c.x, c.y);
    };
    const end = (e: TouchEvent) => { if (e.touches.length < 2) d0 = 0; };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;   // la rueda sola desplaza, como siempre
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomEn(zoomRef.current * Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
      el.removeEventListener('wheel', wheel);
    };
  }, [zoomEn]);

  const encuadrarTodo = () => {
    zoomRef.current = 1;
    setZoom(1);
    scroller.current?.scrollTo({ left: 0, top: 0 });
  };

  /* Con zoom las mesas crecen, pero no sin techo: a 3× una mesa de 96 px
     sería un cartel. Por encima de eso se separan, que es lo que se busca. */
  const mesaW = geo ? Math.min(geo.mesa * zoom, Math.max(mesaMax, geo.mesa) * 1.35) : 0;
  const mesaH = mesaW / proporcion;
  const densidad = densidadDeMesa(mesaW);

  /* El visor no es más alto que el plano: un local apaisado en una tablet
     vertical dejaba media pantalla de cuadrícula vacía. Es estable — con
     el alto recortado el plano sigue cabiendo igual, porque ya lo limitaba
     el ancho. (+2: el borde del visor.) */
  const altoUtil = geo ? geo.alto + PAD * 2 + 2 : undefined;

  return (
    <div ref={box} className={`plano-visor${className ? ` ${className}` : ''}`} style={{ maxHeight: altoUtil }}>
      <div ref={scroller} className="plano-scroll">
        {geo && (
          <div className="plano-pista" style={{ padding: PAD }}>
            <div className="plano-lienzo" style={{ width: geo.ancho * zoom, height: geo.alto * zoom }}>
              {geo.zonas.map(({ f, r }) => (
                <div
                  key={f.id}
                  className="plano-zona"
                  style={{ left: r.left * zoom, top: r.top * zoom, width: r.width * zoom, height: r.height * zoom }}
                >
                  {renderZona?.(f)}
                </div>
              ))}
              {geo.sitios.map((s) => (
                <div
                  key={s.n}
                  className="plano-sitio"
                  style={{ left: s.left * zoom - mesaW / 2, top: s.top * zoom - mesaH / 2, width: mesaW, height: mesaH }}
                >
                  {renderMesa(s.n, { ancho: mesaW, alto: mesaH, densidad })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {geo && (
        <div className="plano-mandos">
          <button type="button" onClick={() => zoomEn(zoomRef.current * 1.4)} disabled={zoom >= ZOOM_MAX} aria-label="Acercar el plano">
            <Icon name="plus" size={18} />
          </button>
          <button type="button" onClick={() => zoomEn(zoomRef.current / 1.4)} disabled={zoom <= 1} aria-label="Alejar el plano">
            <Icon name="minus" size={18} />
          </button>
          {zoom > 1 && (
            <button type="button" onClick={encuadrarTodo} aria-label="Ver el plano entero">
              <Icon name="maximize" size={16} />
            </button>
          )}
          {!auto && (
            <button
              type="button"
              onClick={() => { encuadrarTodo(); setGiro(geo.girado ? 'normal' : 'girado'); }}
              aria-label={geo.girado ? 'Ver el plano como se dibujó' : 'Girar el plano'}
              title={geo.girado ? 'Ver como se dibujó' : 'Girar el plano'}
              data-on={geo.girado ? '1' : '0'}
            >
              <Icon name="rotate" size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
