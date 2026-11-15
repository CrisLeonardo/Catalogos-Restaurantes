// El mundo de la toma: los cuatro aparatos del restaurante flotan en un
// mismo espacio y una cámara continua (sin cortes) sigue la chispa del
// pedido de uno a otro. Al final se aleja y revela el recorrido completo.
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { clamp, easeIO, easeIn, easeOut, lerp, marca, prog, T, useFormato } from './base';
import { TAB, TEL, Tableta, Telefono } from './dispositivos';
import { PantallaCaja, PantallaCocina, PantallaDuenio, PantallaMesero } from './pantallas';
import { fuente } from '../marca';

// ── distribución (coordenadas del mundo) ─────────────────────────────────
export const LUGAR = {
  mesero: { x: 0, y: 0 },
  cocina: { x: 1150, y: -20 },
  caja: { x: 1250, y: 1150 },
  duenio: { x: 0, y: 1150 },
  logo: { x: 625, y: 565 },
};
const enTel = (c: { x: number; y: number }, px: number, py: number) => ({ x: c.x - TEL.w / 2 + px, y: c.y - TEL.h / 2 + py });
const enTab = (c: { x: number; y: number }, px: number, py: number) => ({ x: c.x - TAB.w / 2 + px, y: c.y - TAB.h / 2 + py });
const P = {
  enviar: enTel(LUGAR.mesero, 195, 793),
  tarjeta: enTab(LUGAR.cocina, 879, 600),
  listo: enTab(LUGAR.cocina, 879, 716),
  total: enTel(LUGAR.caja, 195, 262),
  cuadra: enTel(LUGAR.caja, 195, 681),
  ventas: enTel(LUGAR.duenio, 150, 304),
};

// ── la chispa: cuatro saltos con curva ───────────────────────────────────
type Pt = { x: number; y: number };
type Salto = { de: number; a: number; p0: Pt; c1: Pt; c2: Pt; p1: Pt };
const mas = (p: Pt, dx: number, dy: number) => ({ x: p.x + dx, y: p.y + dy });
export const SALTOS: Salto[] = [
  { de: T.mesero.sale, a: T.cocina.llega, p0: P.enviar, c1: mas(P.enviar, 300, -620), c2: mas(P.tarjeta, -520, -520), p1: P.tarjeta },
  { de: T.cocina.sale, a: T.caja.llega, p0: P.listo, c1: mas(P.listo, 420, 260), c2: mas(P.total, 380, -260), p1: P.total },
  { de: T.caja.sale, a: T.duenio.llega, p0: P.cuadra, c1: mas(P.cuadra, -260, 420), c2: mas(P.ventas, 380, 520), p1: P.ventas },
  { de: T.revela.aLogo, a: T.cierre.inicio, p0: P.ventas, c1: mas(P.ventas, 120, -300), c2: mas(LUGAR.logo, -260, 80), p1: LUGAR.logo },
];
const bez = (s: Salto, t: number): Pt => {
  const u = 1 - t;
  return {
    x: u * u * u * s.p0.x + 3 * u * u * t * s.c1.x + 3 * u * t * t * s.c2.x + t * t * t * s.p1.x,
    y: u * u * u * s.p0.y + 3 * u * u * t * s.c1.y + 3 * u * t * t * s.c2.y + t * t * t * s.p1.y,
  };
};
export const chispaEn = (f: number): Pt | null => {
  for (const s of SALTOS) if (f >= s.de && f <= s.a) return bez(s, easeIO(prog(f, s.de, s.a)));
  return null;
};
const caminoSvg = (s: Salto) => `M${s.p0.x},${s.p0.y} C${s.c1.x},${s.c1.y} ${s.c2.x},${s.c2.y} ${s.p1.x},${s.p1.y}`;

// ── cámara ───────────────────────────────────────────────────────────────
type Clave = { f: number; x: number; y: number; s: number; hueco?: number; curva?: (t: number) => number };
const claves = (vertical: boolean): Clave[] => {
  const tel = vertical ? 1.5 : 1.0;
  const tab = vertical ? 0.84 : 0.88;
  const tarj = vertical ? 1.55 : 0.92;
  const lejos = vertical ? 0.5 : 0.47;
  const { mesero: M, cocina: K, caja: C, duenio: D, logo: L } = LUGAR;
  return [
    { f: T.gancho.iris, x: M.x, y: M.y + 60, s: tel * 0.42 },
    { f: T.drop + 22, x: M.x, y: M.y, s: tel, curva: easeOut },
    { f: T.mesero.sale, x: M.x, y: M.y + 8, s: tel * 1.04 },
    { f: T.cocina.llega, x: K.x - (vertical ? 0 : 40), y: K.y, s: tab, hueco: 0.75 },
    { f: T.cocina.acerca, x: K.x + (vertical ? 15 : -40), y: K.y, s: tab * 1.02 },
    { f: T.cocina.acerca + 28, x: vertical ? P.tarjeta.x : K.x - 40, y: vertical ? P.tarjeta.y + 20 : K.y + 10, s: tarj },
    { f: T.cocina.sale, x: vertical ? P.tarjeta.x : K.x - 40, y: vertical ? P.tarjeta.y + 30 : K.y + 20, s: tarj * 1.03 },
    { f: T.caja.llega, x: C.x, y: C.y, s: tel, hueco: 0.6 },
    { f: T.caja.sale, x: C.x, y: C.y + 8, s: tel * 1.04 },
    { f: T.duenio.llega, x: D.x, y: D.y, s: tel, hueco: 0.6 },
    { f: T.revela.inicio, x: D.x, y: D.y - 10, s: tel * 1.05 },
    { f: T.revela.golpe + 10, x: L.x - (vertical ? 0 : 130), y: L.y, s: lejos, curva: (t) => easeIO(t) },
    { f: T.revela.aLogo, x: L.x - (vertical ? 0 : 130), y: L.y, s: lejos * 1.06 },
    { f: T.cierre.inicio, x: L.x, y: L.y, s: 7, curva: easeIn },
  ];
};
const camaraEn = (f: number, cl: Clave[]) => {
  if (f <= cl[0].f) return { x: cl[0].x, y: cl[0].y, s: cl[0].s };
  for (let i = 0; i < cl.length - 1; i++) {
    const a = cl[i], b = cl[i + 1];
    if (f >= a.f && f <= b.f) {
      const t = (f - a.f) / (b.f - a.f);
      const e = (b.curva ?? easeIO)(t);
      const ls = lerp(Math.log(a.s), Math.log(b.s), e) - (b.hueco ?? 0) * Math.sin(Math.PI * e);
      return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), s: Math.exp(ls) };
    }
  }
  const u = cl[cl.length - 1];
  return { x: u.x, y: u.y, s: u.s };
};

export const useCamara = () => {
  const f = useCurrentFrame();
  const { vertical, W, H } = useFormato();
  const cl = claves(vertical);
  const ancla = vertical ? { x: W / 2, y: 1060 } : { x: 1320, y: H / 2 };
  const c = camaraEn(f, cl);
  const a = camaraEn(f - 1, cl);
  const vx = (c.x - a.x) * c.s, vy = (c.y - a.y) * c.s;
  const vel = Math.hypot(vx, vy) + Math.abs(Math.log(c.s / a.s)) * 350;
  return { ...c, ancla, vx, vy, vel };
};

// ── la chispa dibujada ───────────────────────────────────────────────────
const Chispa: React.FC<{ s: number }> = ({ s }) => {
  const f = useCurrentFrame();
  const p = chispaEn(f);
  if (!p) return null;
  const k = 1 / s; // tamaño constante en pantalla
  const cola: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const q = chispaEn(f - i * 0.8);
    if (q) cola.push(q);
  }
  const d = cola.map((q, i) => `${i ? 'L' : 'M'}${q.x},${q.y}`).join(' ');
  return (
    <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1} height={1}>
      <defs>
        <radialGradient id="chispa-g">
          <stop offset="0" stopColor="#FFF8E6" />
          <stop offset=".35" stopColor={marca.mango} />
          <stop offset="1" stopColor={marca.brasa} stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={d} stroke={marca.brasa} strokeOpacity={0.35} strokeWidth={34 * k} strokeLinecap="round" fill="none" style={{ filter: `blur(${8 * k}px)` }} />
      <path d={d} stroke={marca.mango} strokeWidth={10 * k} strokeLinecap="round" fill="none" />
      <path d={d} stroke="#FFF3D6" strokeWidth={4 * k} strokeLinecap="round" fill="none" />
      <circle cx={p.x} cy={p.y} r={70 * k} fill="url(#chispa-g)" />
      <circle cx={p.x} cy={p.y} r={11 * k} fill="#FFFDF6" />
    </svg>
  );
};

// Destello donde aterriza la chispa.
const Aterriza: React.FC<{ en: number; p: Pt; s: number }> = ({ en, p, s }) => {
  const f = useCurrentFrame();
  const t = prog(f, en, en + 16);
  if (f < en || t >= 1) return null;
  const k = 1 / s;
  return (
    <div style={{ position: 'absolute', left: p.x, top: p.y, width: 0, height: 0, zIndex: 40 }}>
      <div style={{ position: 'absolute', width: 300 * k, height: 300 * k, left: -150 * k, top: -150 * k, borderRadius: 999, border: `${6 * k * (1 - t)}px solid ${marca.mango}`, transform: `scale(${0.2 + t * 1.2})`, opacity: 1 - t }} />
      <div style={{ position: 'absolute', width: 160 * k, height: 160 * k, left: -80 * k, top: -80 * k, borderRadius: 999, background: `radial-gradient(circle, rgba(255,248,230,${1 - t}) 0%, rgba(245,160,48,${0.6 * (1 - t)}) 40%, transparent 70%)` }} />
    </div>
  );
};

// ── el recorrido completo (revelación) ───────────────────────────────────
const Recorrido: React.FC<{ s: number }> = ({ s }) => {
  const f = useCurrentFrame();
  const r = T.revela;
  const dib = easeOut(prog(f, r.inicio + 10, r.golpe + 20));
  if (dib <= 0) return null;
  const k = 1 / s;
  const hilo = easeOut(prog(f, r.golpe, r.golpe + 30));
  const latido = 0.5 + 0.5 * Math.sin((f - r.golpe) / 4);
  return (
    <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1} height={1}>
      {/* hilos del centro a cada aparato */}
      {[LUGAR.mesero, LUGAR.cocina, LUGAR.caja, LUGAR.duenio].map((q, i) => (
        <line key={i} x1={LUGAR.logo.x} y1={LUGAR.logo.y} x2={lerp(LUGAR.logo.x, q.x, hilo)} y2={lerp(LUGAR.logo.y, q.y, hilo)} stroke="#FFFFFF" strokeOpacity={0.22} strokeWidth={2.5 * k} strokeDasharray={`${10 * k} ${12 * k}`} strokeDashoffset={-f * 2 * k} />
      ))}
      {SALTOS.slice(0, 3).map((sl, i) => (
        <g key={i}>
          <path d={caminoSvg(sl)} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - dib} stroke={marca.brasa} strokeOpacity={0.4 + 0.2 * latido} strokeWidth={30 * k} fill="none" strokeLinecap="round" style={{ filter: `blur(${10 * k}px)` }} />
          <path d={caminoSvg(sl)} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - dib} stroke={marca.mango} strokeWidth={7 * k} fill="none" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
};

const Etiqueta: React.FC<{ p: Pt; texto: string; s: number; i: number; abajo: number }> = ({ p, texto, s, i, abajo }) => {
  const f = useCurrentFrame();
  const t = easeOut(prog(f, T.revela.golpe + i * 4, T.revela.golpe + i * 4 + 12));
  if (t <= 0) return null;
  const k = 1 / s;
  return (
    <div style={{ position: 'absolute', left: p.x, top: p.y + abajo, transform: `translate(-50%, 0) scale(${k})`, transformOrigin: 'top center', opacity: t }}>
      <div style={{ transform: `translateY(${(1 - t) * 20}px)`, padding: '10px 22px', borderRadius: 99, background: marca.carbon, border: '1.5px solid rgba(255,255,255,.18)', color: '#fff', fontFamily: fuente.titular, fontSize: 30, fontWeight: 700, whiteSpace: 'nowrap' }}>{texto}</div>
    </div>
  );
};

const LogoMundo: React.FC<{ s: number }> = ({ s }) => {
  const f = useCurrentFrame();
  const t = easeOut(prog(f, T.revela.inicio + 20, T.revela.golpe));
  if (t <= 0) return null;
  const tam = 190;
  return (
    <div style={{ position: 'absolute', left: LUGAR.logo.x - tam / 2, top: LUGAR.logo.y - tam / 2, width: tam, height: tam, transform: `scale(${t})`, filter: `drop-shadow(0 0 ${40 / Math.max(s, 0.5)}px rgba(232,83,74,.55))` }}>
      <LogoMarca tam={tam} />
    </div>
  );
};

export const LogoMarca: React.FC<{ tam: number; dibujo?: number }> = ({ tam, dibujo = 1 }) => (
  <svg width={tam} height={tam} viewBox="0 0 100 100">
    <defs>
      <linearGradient id="lg-logo" x1="27" y1="19" x2="72" y2="81" gradientUnits="userSpaceOnUse">
        <stop stopColor={marca.brasa} />
        <stop offset="1" stopColor={marca.mango} />
      </linearGradient>
    </defs>
    <rect width="100" height="100" rx="22" fill={marca.carbon} stroke="rgba(255,255,255,.14)" strokeWidth="1" />
    <path d="M27 19 h18 v44 h27 v18 H27 Z" fill="url(#lg-logo)" style={{ clipPath: `inset(0 ${100 - 100 * dibujo}% 0 0)` }} />
  </svg>
);

// ── el mundo completo ────────────────────────────────────────────────────
export const Mundo: React.FC = () => {
  const f = useCurrentFrame();
  const { vertical } = useFormato();
  const cam = useCamara();
  const desenfoque = clamp((cam.vel - 40) / 50, 0, 3);
  const giro = clamp(cam.vx * 0.012, -4, 4);
  const brillo = (en: number, hasta: number) => clamp(1 - Math.abs(f - en) / 14) * (f < hasta ? 1 : 0);
  const revelado = prog(f, T.revela.golpe - 10, T.revela.golpe + 10);
  const abajoTel = TEL.h / 2 + 40;
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute', left: 0, top: 0, transformOrigin: '0 0',
          transform: `translate(${cam.ancla.x}px, ${cam.ancla.y}px) rotate(${giro}deg) scale(${cam.s}) translate(${-cam.x}px, ${-cam.y}px)`,
          filter: desenfoque > 0.2 ? `blur(${desenfoque}px)` : undefined,
        }}
      >
        {/* piso: retícula de puntos que delata el movimiento */}
        <div style={{ position: 'absolute', left: -4000, top: -4000, width: 9000, height: 9000, backgroundImage: 'radial-gradient(rgba(255,255,255,.13) 2.2px, transparent 2.6px)', backgroundSize: '64px 64px' }} />
        <Recorrido s={cam.s} />
        <LogoMundo s={cam.s} />
        <Telefono cx={LUGAR.mesero.x} cy={LUGAR.mesero.y} brillo={brillo(T.mesero.sale, T.cocina.llega) + revelado * 0.5}><PantallaMesero /></Telefono>
        <Tableta cx={LUGAR.cocina.x} cy={LUGAR.cocina.y} brillo={brillo(T.cocina.llega, T.caja.llega) + revelado * 0.5}><PantallaCocina /></Tableta>
        <Telefono cx={LUGAR.caja.x} cy={LUGAR.caja.y} brillo={brillo(T.caja.llega, T.duenio.llega) + revelado * 0.5}><PantallaCaja /></Telefono>
        <Telefono cx={LUGAR.duenio.x} cy={LUGAR.duenio.y} brillo={brillo(T.duenio.llega, T.revela.inicio) + revelado * 0.5}><PantallaDuenio /></Telefono>
        <Etiqueta p={LUGAR.mesero} texto="Mesero" s={cam.s} i={0} abajo={abajoTel} />
        <Etiqueta p={LUGAR.cocina} texto="Cocina" s={cam.s} i={1} abajo={TAB.h / 2 + 50} />
        <Etiqueta p={LUGAR.caja} texto="Caja" s={cam.s} i={2} abajo={abajoTel} />
        <Etiqueta p={LUGAR.duenio} texto="Tú" s={cam.s} i={3} abajo={abajoTel} />
        <Aterriza en={T.cocina.llega} p={P.tarjeta} s={cam.s} />
        <Aterriza en={T.caja.llega} p={P.total} s={cam.s} />
        <Aterriza en={T.duenio.llega} p={P.ventas} s={cam.s} />
        <Chispa s={cam.s} />
      </div>
      {/* sombra detrás de los titulares: lo que quede debajo no estorba la lectura */}
      <AbsoluteFill style={{ pointerEvents: 'none', background: vertical ? `linear-gradient(to bottom, ${marca.noche} 0%, rgba(14,14,16,.92) 17%, rgba(14,14,16,0) 27%)` : `linear-gradient(to right, ${marca.noche} 0%, rgba(14,14,16,.9) 30%, rgba(14,14,16,0) 42%)`, opacity: 1 - prog(f, T.revela.inicio, T.revela.golpe) * 0.6 }} />
      {/* luz ambiente que sigue a la cámara */}
      <AbsoluteFill style={{ pointerEvents: 'none', background: `radial-gradient(ellipse at 50% ${vertical ? 55 : 50}%, transparent 45%, rgba(0,0,0,.55) 100%)` }} />
    </AbsoluteFill>
  );
};
