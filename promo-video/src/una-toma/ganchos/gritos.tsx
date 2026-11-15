// Gancho del video «comedor»: los pedidos a gritos, uno encima del otro.
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { clamp, lerp, pop, prog, useFormato } from '../base';
import { fuente } from '../../marca';

export const GRITOS: { en: number; texto: string; rojo?: boolean }[] = [
  { en: -4, texto: '¡DOS POLLOS!', rojo: true },
  { en: 6, texto: '¿Y la mesa 3?' },
  { en: 15, texto: '¡UNA SIN CEBOLLA!', rojo: true },
  { en: 24, texto: '¿Quién pidió caldo?' },
  { en: 34, texto: '¡Falta una limonada!' },
  { en: 44, texto: '¿Ya pagó la 5?', rojo: true },
  { en: 54, texto: '¡Ese no era!' },
  { en: 64, texto: '¡¿CUÁNTO ES?!', rojo: true },
  { en: 74, texto: '¡La 4 lleva 20 minutos!' },
];

// Posiciones fijas (fracción del cuadro) para que siempre salga igual.
const POS_V = [[0.08, 0.36], [0.46, 0.45], [0.05, 0.53], [0.4, 0.62], [0.1, 0.71], [0.5, 0.78], [0.14, 0.86], [0.42, 0.4], [0.2, 0.93]];
const POS_H = [[0.5, 0.12], [0.62, 0.3], [0.47, 0.46], [0.66, 0.6], [0.5, 0.74], [0.7, 0.86], [0.45, 0.9], [0.72, 0.16], [0.56, 0.6]];

export const EscenaGritos: React.FC = () => {
  const f = useCurrentFrame();
  const { vertical, W, H } = useFormato();
  const pos = vertical ? POS_V : POS_H;
  const tam = vertical ? 58 : 50;
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 45%, #5A3A26 0%, #2A1B13 60%, #140E0B 100%)' }}>
      {/* luces de comedor, desenfocadas */}
      {[[0.2, 0.2], [0.75, 0.3], [0.5, 0.75], [0.9, 0.85]].map(([x, y], i) => (
        <div key={i} style={{ position: 'absolute', left: x * W - 160, top: y * H - 160, width: 320, height: 320, borderRadius: 999, background: 'radial-gradient(circle, rgba(255,190,110,.25), transparent 70%)' }} />
      ))}
      {GRITOS.map((g, i) => {
        const t = pop(prog(f, g.en, g.en + 8));
        if (t <= 0) return null;
        const temblor = Math.sin((f + i * 7) * 1.9) * 3 * (1 - prog(f, g.en, g.en + 20) * 0.6);
        const [x, y] = pos[i % pos.length];
        const giro = (i % 2 ? 1 : -1) * (3 + (i % 3) * 2);
        return (
          <div key={i} style={{ position: 'absolute', left: x * W, top: y * H, transform: `translate(${temblor}px, ${-temblor}px) rotate(${giro}deg) scale(${lerp(0.3, 1, t)})`, transformOrigin: i % 2 ? 'right bottom' : 'left bottom', opacity: clamp(t * 2) }}>
            <div style={{ position: 'relative', background: g.rojo ? '#E8423A' : '#FFFDF6', color: g.rojo ? '#fff' : '#1C1C1E', padding: vertical ? '22px 30px' : '18px 26px', borderRadius: 30, fontFamily: fuente.titular, fontWeight: 800, fontSize: tam, letterSpacing: -1.5, whiteSpace: 'nowrap', boxShadow: '0 18px 40px rgba(0,0,0,.45)' }}>
              {g.texto}
              <svg style={{ position: 'absolute', [i % 2 ? 'right' : 'left']: 40, bottom: -26 }} width="40" height="30" viewBox="0 0 40 30">
                <path d={i % 2 ? 'M0 0 H34 L40 30 Z' : 'M6 0 H40 L0 30 Z'} fill={g.rojo ? '#E8423A' : '#FFFDF6'} />
              </svg>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
