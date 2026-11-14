// Texto grande y corto que entra palabra por palabra. Hace de subtítulo:
// el video no tiene voz, así que todo lo que «se dice» está escrito aquí.
// Las palabras entre *asteriscos* salen con el degradado de la marca.
import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { color, fuente } from '../marca';

type Props = {
  texto: string;
  kicker?: string;
  /** Cuadro (dentro de la escena) en que empieza a entrar. */
  desde?: number;
  /** El gancho: el texto ya está en pantalla desde el cuadro 0. */
  inmediato?: boolean;
  /** Cuántas palabras ya están en pantalla en el cuadro 0; el resto entra en `desde`. */
  inmediatas?: number;
  tam?: number;
  top?: number;
  claro?: boolean;
};

export const Titular: React.FC<Props> = ({ texto, kicker, desde = 0, inmediato = false, inmediatas = 0, tam = 92, top = 170, claro = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const palabras: { t: string; acento: boolean }[] = [];
  for (const [n, trozo] of texto.split('*').entries()) {
    for (const t of trozo.split(/\s+/).filter(Boolean)) palabras.push({ t, acento: n % 2 === 1 });
  }
  const tinta = claro ? color.tinta : '#FFFFFF';
  const entrada = (n: number) =>
    inmediato || n < inmediatas ? 1 : spring({ frame: frame - desde + 5 - (n - inmediatas) * 2, fps, config: { damping: 14, mass: 0.6 }, durationInFrames: 14 });

  return (
    <div style={{ position: 'absolute', left: 80, right: 80, top, textAlign: 'left' }}>
      {kicker ? (
        <div style={{
          fontFamily: fuente.texto, fontWeight: 700, fontSize: 40, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: claro ? color.terracota : color.mango, marginBottom: 22, opacity: entrada(0),
        }}>{kicker}</div>
      ) : null}
      <div style={{ fontFamily: fuente.titular, fontWeight: 800, fontSize: tam, lineHeight: 1.04, letterSpacing: '-0.02em', color: tinta }}>
        {palabras.map((p, n) => {
          const s = entrada(n + (kicker ? 1 : 0));
          return (
            <span key={n} style={{ display: 'inline-block', marginRight: '0.24em', transform: `translateY(${(1 - s) * 60}px) scale(${0.9 + 0.1 * s})`, opacity: Math.min(1, s * 1.4) }}>
              {p.acento ? (
                <span style={{ background: `linear-gradient(120deg, ${color.brasa}, ${color.mango})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{p.t}</span>
              ) : p.t}
            </span>
          );
        })}
      </div>
    </div>
  );
};
