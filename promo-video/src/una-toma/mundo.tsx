// El mundo de la toma: los aparatos del restaurante flotan en un mismo
// espacio y una cámara continua (sin cortes) sigue la chispa del pedido de
// uno a otro. Al final se aleja y revela el recorrido completo.
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { clamp, easeIO, easeIn, easeOut, lerp, marca, prog, useFormato } from './base';
import { TAB, TEL, Tableta, Telefono } from './dispositivos';
import { caminoSvg, chispaEn, useGuion, type Clave, type Pt, type Tiempos } from './guion';
import { fuente } from '../marca';

/** Escala de la cámara para un teléfono, una tableta y la vista lejana. */
export const ESCALA = (vertical: boolean) => ({
  tel: vertical ? 1.5 : 1.0,
  tab: vertical ? 0.84 : 0.88,
  lejos: vertical ? 0.5 : 0.47,
});

/** Las claves finales, iguales en los tres videos: alejarse, revelar y entrar al logo. */
export const clavesFinales = (T: Tiempos, ultimo: Pt, logo: Pt, vertical: boolean, desfaseH = 130): Clave[] => {
  const e = ESCALA(vertical);
  const lx = logo.x - (vertical ? 0 : desfaseH);
  return [
    { f: T.revela.inicio, x: ultimo.x, y: ultimo.y - 10, s: e.tel * 1.05 },
    { f: T.revela.golpe + 10, x: lx, y: logo.y, s: e.lejos, curva: easeIO },
    { f: T.revela.aLogo, x: lx, y: logo.y, s: e.lejos * 1.06 },
    { f: T.cierre.inicio, x: logo.x, y: logo.y, s: 7, curva: easeIn },
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

const useCamara = () => {
  const f = useCurrentFrame();
  const g = useGuion();
  const { vertical, W, H } = useFormato();
  const cl = g.claves(vertical);
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
  const { saltos } = useGuion();
  const p = chispaEn(saltos, f);
  if (!p) return null;
  const k = 1 / s; // tamaño constante en pantalla
  const cola: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const q = chispaEn(saltos, f - i * 0.8);
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
  const { T, saltos, lugares, logo } = useGuion();
  const r = T.revela;
  const dib = easeOut(prog(f, r.inicio + 10, r.golpe + 20));
  if (dib <= 0) return null;
  const k = 1 / s;
  const hilo = easeOut(prog(f, r.golpe, r.golpe + 30));
  const latido = 0.5 + 0.5 * Math.sin((f - r.golpe) / 4);
  return (
    <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1} height={1}>
      {lugares.map((q) => (
        <line key={q.id} x1={logo.x} y1={logo.y} x2={lerp(logo.x, q.x, hilo)} y2={lerp(logo.y, q.y, hilo)} stroke="#FFFFFF" strokeOpacity={0.22} strokeWidth={2.5 * k} strokeDasharray={`${10 * k} ${12 * k}`} strokeDashoffset={-f * 2 * k} />
      ))}
      {saltos.filter((sl) => sl.a <= r.inicio).map((sl, i) => (
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
  const { T } = useGuion();
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
  const { T, logo } = useGuion();
  const t = easeOut(prog(f, T.revela.inicio + 20, T.revela.golpe));
  if (t <= 0) return null;
  const tam = 190;
  return (
    <div style={{ position: 'absolute', left: logo.x - tam / 2, top: logo.y - tam / 2, width: tam, height: tam, transform: `scale(${t})`, filter: `drop-shadow(0 0 ${40 / Math.max(s, 0.5)}px rgba(232,83,74,.55))` }}>
      <LogoMarca tam={tam} />
    </div>
  );
};

import { Logo as LogoMarca } from '../componentes/Marca';
export { LogoMarca };

// ── el mundo completo ────────────────────────────────────────────────────
export const Mundo: React.FC = () => {
  const f = useCurrentFrame();
  const { T, lugares, aterrizajes } = useGuion();
  const { vertical } = useFormato();
  const cam = useCamara();
  const desenfoque = clamp((cam.vel - 40) / 50, 0, 3);
  const giro = clamp(cam.vx * 0.012, -4, 4);
  const revelado = prog(f, T.revela.golpe - 10, T.revela.golpe + 10);
  const brillo = (lista: number[]) => Math.max(0, ...lista.map((en) => clamp(1 - Math.abs(f - en) / 14))) + revelado * 0.5;
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
        {lugares.map((l) => {
          const Pantalla = l.Pantalla;
          return l.tipo === 'tab' ? (
            <Tableta key={l.id} cx={l.x} cy={l.y} brillo={brillo(l.brilla)}><Pantalla /></Tableta>
          ) : (
            <Telefono key={l.id} cx={l.x} cy={l.y} brillo={brillo(l.brilla)}><Pantalla /></Telefono>
          );
        })}
        {lugares.map((l, i) => (
          <Etiqueta key={l.id} p={l} texto={l.etiqueta} s={cam.s} i={i} abajo={(l.tipo === 'tab' ? TAB.h / 2 : TEL.h / 2) + 46} />
        ))}
        {aterrizajes.map((a) => <Aterriza key={a.en} en={a.en} p={a.p} s={cam.s} />)}
        <Chispa s={cam.s} />
      </div>
      {/* sombra detrás de los titulares: lo que quede debajo no estorba la lectura */}
      <AbsoluteFill style={{ pointerEvents: 'none', background: vertical ? `linear-gradient(to bottom, ${marca.noche} 0%, rgba(14,14,16,.92) 17%, rgba(14,14,16,0) 27%)` : `linear-gradient(to right, ${marca.noche} 0%, rgba(14,14,16,.9) 30%, rgba(14,14,16,0) 42%)`, opacity: 1 - prog(f, T.revela.inicio, T.revela.golpe) * 0.6 }} />
      {/* luz ambiente */}
      <AbsoluteFill style={{ pointerEvents: 'none', background: `radial-gradient(ellipse at 50% ${vertical ? 55 : 50}%, transparent 45%, rgba(0,0,0,.55) 100%)` }} />
    </AbsoluteFill>
  );
};
