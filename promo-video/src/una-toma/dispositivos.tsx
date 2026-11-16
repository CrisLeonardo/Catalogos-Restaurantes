// Teléfono, tableta y el «toque» del dedo. Todo en coordenadas del mundo.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { app, clamp, easeOut, prog } from './base';
import { fuente } from '../marca';

export const TEL = { w: 390, h: 844, bisel: 14 };
export const TAB = { w: 1180, h: 800, bisel: 22 };

type Marco = { cx: number; cy: number; brillo?: number; children: React.ReactNode; etiqueta?: string };

const Halo: React.FC<{ brillo: number; radio: number }> = ({ brillo, radio }) =>
  brillo > 0 ? (
    <div
      style={{
        position: 'absolute', inset: -3, borderRadius: radio + 3, pointerEvents: 'none',
        boxShadow: `0 0 0 3px rgba(245,160,48,${0.9 * brillo}), 0 0 ${60 * brillo}px ${12 * brillo}px rgba(232,83,74,${0.45 * brillo})`,
      }}
    />
  ) : null;

export const Telefono: React.FC<Marco> = ({ cx, cy, brillo = 0, children }) => {
  const W = TEL.w + TEL.bisel * 2, H = TEL.h + TEL.bisel * 2;
  return (
    <div style={{ position: 'absolute', left: cx - W / 2, top: cy - H / 2, width: W, height: H }}>
      <div
        style={{
          position: 'absolute', inset: 0, borderRadius: 62, background: '#0A0A0B',
          boxShadow: '0 0 0 1.5px #3A3A3E inset, 0 0 0 1px #000, 0 50px 120px rgba(0,0,0,.55), 0 12px 30px rgba(0,0,0,.4)',
        }}
      />
      <div
        style={{
          position: 'absolute', left: TEL.bisel, top: TEL.bisel, width: TEL.w, height: TEL.h,
          borderRadius: 50, overflow: 'hidden', background: app.fondo, fontFamily: fuente.texto, color: app.tinta,
        }}
      >
        {children}
        <BarraEstado />
        <div style={{ position: 'absolute', left: '50%', top: 11, width: 112, height: 32, marginLeft: -56, borderRadius: 20, background: '#000' }} />
      </div>
      <Halo brillo={brillo} radio={62} />
    </div>
  );
};

export const Tableta: React.FC<Marco> = ({ cx, cy, brillo = 0, children }) => {
  const W = TAB.w + TAB.bisel * 2, H = TAB.h + TAB.bisel * 2;
  return (
    <div style={{ position: 'absolute', left: cx - W / 2, top: cy - H / 2, width: W, height: H }}>
      <div
        style={{
          position: 'absolute', inset: 0, borderRadius: 44, background: '#0A0A0B',
          boxShadow: '0 0 0 1.5px #3A3A3E inset, 0 60px 140px rgba(0,0,0,.55), 0 14px 34px rgba(0,0,0,.4)',
        }}
      />
      <div
        style={{
          position: 'absolute', left: TAB.bisel, top: TAB.bisel, width: TAB.w, height: TAB.h,
          borderRadius: 24, overflow: 'hidden', background: app.fondo, fontFamily: fuente.texto, color: app.tinta,
        }}
      >
        {children}
      </div>
      <Halo brillo={brillo} radio={44} />
    </div>
  );
};

const BarraEstado: React.FC = () => (
  <div
    style={{
      position: 'absolute', left: 0, right: 0, top: 0, height: 52, display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', padding: '6px 34px 0 40px', fontSize: 16, fontWeight: 600, color: app.tinta,
      pointerEvents: 'none',
    }}
  >
    <span>8:15</span>
    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <svg width="18" height="12" viewBox="0 0 18 12"><g fill={app.tinta}><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></g></svg>
      <svg width="26" height="12" viewBox="0 0 26 12"><rect x=".5" y=".5" width="22" height="11" rx="3.5" fill="none" stroke={app.tinta} opacity=".4" /><rect x="2" y="2" width="17" height="8" rx="2" fill={app.tinta} /><rect x="24" y="4" width="1.6" height="4" rx=".8" fill={app.tinta} opacity=".4" /></svg>
    </span>
  </div>
);

/** El dedo: círculo que aparece, presiona y deja una onda. Coordenadas de la pantalla. */
export const Toque: React.FC<{ en: number; x: number; y: number; antes?: number }> = ({ en, x, y, antes = 8 }) => {
  const f = useCurrentFrame();
  if (f < en - antes || f > en + 16) return null;
  const llega = easeOut(prog(f, en - antes, en - 1));
  const presion = f >= en && f < en + 4 ? 0.82 : 1;
  const onda = prog(f, en, en + 14);
  const sale = 1 - prog(f, en + 6, en + 16);
  return (
    <div style={{ position: 'absolute', left: x, top: y, pointerEvents: 'none', zIndex: 50 }}>
      <div
        style={{
          position: 'absolute', width: 54, height: 54, left: -27, top: -27, borderRadius: 99,
          background: 'rgba(23,22,26,.28)', border: '2px solid rgba(255,255,255,.85)',
          boxShadow: '0 4px 14px rgba(0,0,0,.25)',
          opacity: llega * sale, transform: `scale(${(1.25 - 0.25 * llega) * presion})`,
        }}
      />
      {f >= en && (
        <div
          style={{
            position: 'absolute', width: 54, height: 54, left: -27, top: -27, borderRadius: 99,
            border: `3px solid rgba(255,255,255,${0.9 * (1 - onda)})`, transform: `scale(${1 + onda * 1.6})`,
          }}
        />
      )}
    </div>
  );
};

/** Pequeño ícono de check. */
export const Check: React.FC<{ size?: number; color?: string; grosor?: number }> = ({ size = 18, color = 'currentColor', grosor = 2.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={grosor} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const aparecer = (f: number, en: number, dur = 10) => clamp((f - en) / dur);
