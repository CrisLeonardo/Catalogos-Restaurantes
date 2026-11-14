// El mundo de «antes»: papel, letra a mano y movimiento cuadro por cuadro
// (como stop-motion), igual que en la intro animada de la web. El «después»
// (con Leogin) es fluido: el contraste cuenta la historia sin palabras.
import React from 'react';
import { random, useCurrentFrame } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Caveat';
import { color } from '../marca';

export const mano = loadFont('normal', { weights: ['500', '700'], subsets: ['latin'] }).fontFamily;

/** Cuadro «congelado» cada `paso` cuadros: da el tirón del stop-motion. */
export function useCuadro(paso = 3) {
  const f = useCurrentFrame();
  return Math.floor(f / paso) * paso;
}

/** Temblor de papel recortado, distinto para cada pieza (semilla). */
export function temblor(semilla: string, cuadro: number, fuerza = 1) {
  return {
    x: (random(`${semilla}x${cuadro}`) - 0.5) * 6 * fuerza,
    y: (random(`${semilla}y${cuadro}`) - 0.5) * 6 * fuerza,
    r: (random(`${semilla}r${cuadro}`) - 0.5) * 1.6 * fuerza,
  };
}

export const Hoja: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; semilla: string; giro?: number; fuerza?: number }> = ({ children, style, semilla, giro = 0, fuerza = 1 }) => {
  const c = useCuadro(3);
  const t = temblor(semilla, c, fuerza);
  return (
    <div style={{
      position: 'absolute', background: color.papel, borderRadius: 6,
      boxShadow: '0 18px 40px rgba(60,40,20,.28), 0 2px 0 rgba(0,0,0,.05)',
      transform: `translate(${t.x}px, ${t.y}px) rotate(${giro + t.r}deg)`,
      ...style,
    }}>{children}</div>
  );
};

/** Raya de pluma roja que tacha o encierra, dibujada en cuadros. */
export const Tachon: React.FC<{ desde: number; ancho: number; style?: React.CSSProperties }> = ({ desde, ancho, style }) => {
  const c = useCuadro(2);
  const avance = Math.max(0, Math.min(1, (c - desde) / 8));
  return (
    <svg width={ancho} height={40} style={{ position: 'absolute', overflow: 'visible', ...style }}>
      <path d={`M4 24 Q ${ancho * 0.3} 8 ${ancho * 0.55} 22 T ${ancho - 4} 14`} stroke="#D2342B" strokeWidth={7} fill="none" strokeLinecap="round"
        strokeDasharray={ancho * 1.3} strokeDashoffset={ancho * 1.3 * (1 - avance)} />
    </svg>
  );
};
