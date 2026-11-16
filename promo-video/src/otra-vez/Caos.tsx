// El domingo sin Leogin. Es una función pura del cuadro `f` (0–162): así el
// rebobinado solo tiene que recorrerla hacia atrás.
import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { color, fuente } from '../marca';
import { av, azar, hora, salto } from './base';
import type { Guion, Molestia } from './guiones';

// Cuándo aparece cada molestia: cada vez más seguidas.
const ENTRADAS = [0, 0, 0, 0, 22, 42, 60, 76, 90, 102, 113, 124, 134, 146];
// Dónde cae cada una dentro de su zona (0–1).
const SITIOS: [number, number][] = [
  [0.29, 0.12], [0.71, 0.24], [0.3, 0.4], [0.72, 0.52], [0.27, 0.66], [0.7, 0.8], [0.4, 0.9],
  [0.66, 0.08], [0.5, 0.32], [0.26, 0.53], [0.6, 0.67], [0.5, 0.2], [0.42, 0.48], [0.56, 0.78],
];

const Pieza: React.FC<{ m: Molestia; i: number; ancho: number }> = ({ m, i, ancho }) => {
  const giro = (azar(i, 1) - 0.5) * (m.tipo === 'sello' ? 18 : 12);
  const base: React.CSSProperties = { rotate: `${giro}deg`, width: 'max-content', maxWidth: ancho, lineHeight: 1.15 };
  if (m.tipo === 'grito') {
    return (
      <div style={{ ...base, background: '#fff', color: color.carbon, fontFamily: fuente.texto, fontWeight: 700, fontSize: 50, padding: '22px 32px', borderRadius: 30, borderBottomLeftRadius: i % 2 ? 30 : 6, borderBottomRightRadius: i % 2 ? 6 : 30, boxShadow: '0 14px 40px rgba(0,0,0,.45)' }}>
        {m.texto}
      </div>
    );
  }
  if (m.tipo === 'papel') {
    return (
      <div style={{ ...base, background: '#F4EBD3', color: '#3A3128', fontFamily: fuente.cifras, fontWeight: 500, fontSize: 44, padding: '26px 30px 30px', boxShadow: '0 14px 34px rgba(0,0,0,.5)', borderTop: `10px solid ${color.grisPapel}`, fontStyle: 'italic' }}>
        {m.texto}
        <div style={{ height: 3, background: '#3A312855', marginTop: 12, width: '70%' }} />
      </div>
    );
  }
  if (m.tipo === 'chat' || m.tipo === 'chatMio') {
    const mio = m.tipo === 'chatMio';
    return (
      <div style={{ ...base, background: mio ? '#D7F5C6' : '#FFFFFF', color: '#16201A', fontFamily: fuente.texto, fontWeight: 500, fontSize: 48, padding: '18px 26px 14px', borderRadius: 26, borderTopLeftRadius: mio ? 26 : 6, borderTopRightRadius: mio ? 6 : 26, boxShadow: '0 12px 34px rgba(0,0,0,.45)' }}>
        {m.texto}
        <div style={{ fontSize: 22, color: '#6B756E', textAlign: 'right', marginTop: 4, fontFamily: fuente.cifras }}>{hora(107 + i * 3)} p. m.</div>
      </div>
    );
  }
  return (
    <div style={{ ...base, color: '#FF5A4E', border: '8px solid #FF5A4E', fontFamily: fuente.titular, fontWeight: 800, fontSize: 56, padding: '14px 28px', borderRadius: 14, background: 'rgba(18,18,20,.82)', letterSpacing: 1, textAlign: 'center' }}>
      {m.texto}
    </div>
  );
};

export const Reloj: React.FC<{ minutos: number; claro?: boolean; tam: number; dia?: boolean }> = ({ minutos, claro, tam, dia = true }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: tam * 0.12, color: claro ? color.carbon : '#fff', fontFamily: fuente.cifras, fontWeight: 700, lineHeight: 1 }}>
    <span style={{ fontSize: tam, letterSpacing: -tam * 0.04, fontVariantNumeric: 'tabular-nums' }}>{hora(minutos)}</span>
    <span style={{ display: 'flex', flexDirection: 'column', gap: tam * 0.06 }}>
      <span style={{ fontSize: tam * 0.26, opacity: 0.7 }}>{minutos >= 720 ? 'a. m.' : 'p. m.'}</span>
      {dia ? <span style={{ fontSize: tam * 0.2, fontFamily: fuente.texto, fontWeight: 600, letterSpacing: tam * 0.02, opacity: 0.7 }}>DOMINGO</span> : null}
    </span>
  </div>
);

export const Caos: React.FC<{ f: number; guion: Guion; sinReloj?: boolean }> = ({ f, guion, sinReloj }) => {
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  const tension = av(f, 0, 162, (n) => n * n);
  // La cámara tiembla cada vez más.
  const temblor = 2 + tension * 12;
  const dx = Math.sin(f * 1.7) * temblor;
  const dy = Math.cos(f * 2.3) * temblor * 0.7;
  // El reloj corre: de la 1:47 a las 2:31 en cinco segundos.
  const minutos = 107 + (f / 162) * 44;

  const zona = vertical
    ? { left: 40, top: 330, width: width - 80, height: 1100 }
    : { left: 800, top: 40, width: width - 840, height: height - 80 };
  const anchoPieza = vertical ? 660 : 600;

  return (
    <AbsoluteFill style={{ background: color.carbonHondo, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, transparent 30%, rgba(232,60,50,${0.1 + tension * 0.5}) 120%)` }} />
      <AbsoluteFill style={{ translate: `${dx}px ${dy}px` }}>
        {sinReloj ? null : (
          <div style={{ position: 'absolute', left: vertical ? 70 : 90, top: 110 }}>
            <Reloj minutos={minutos} tam={vertical ? 170 : 150} />
          </div>
        )}
        <div style={{ position: 'absolute', ...zona }}>
          {guion.molestias.map((m, i) => {
            const e = ENTRADAS[i];
            if (f < e) return null;
            const [x, y] = SITIOS[i];
            const s = e === 0 ? 1 : salto(f, e);
            return (
              <div key={i} style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, translate: '-50% -50%', scale: String(s), zIndex: i }}>
                <Pieza m={m} i={i} ancho={anchoPieza} />
              </div>
            );
          })}
        </div>
        <div style={{ position: 'absolute', left: vertical ? 70 : 90, right: vertical ? 70 : undefined, width: vertical ? undefined : 660, bottom: vertical ? 190 : 130, fontFamily: fuente.titular, fontWeight: 800, fontSize: vertical ? 84 : 74, lineHeight: 1.08, color: '#fff', textShadow: '0 6px 30px rgba(0,0,0,.8)', zIndex: 50 }}>
          <div>{guion.gancho[0]}</div>
          <div style={{ color: color.brasa, opacity: av(f, 20, 34), translate: `0px ${(1 - av(f, 20, 34)) * 30}px` }}>{guion.gancho[1]}</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
