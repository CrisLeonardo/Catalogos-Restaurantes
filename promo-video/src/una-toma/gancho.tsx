// Segundos 0–4 de cualquier video de la serie: la «forma vieja» (comanda,
// gritos, chats) llena el cuadro con una pregunta pegada encima; luego se
// rompe en dos, aparece la frase y de ella nace la chispa.
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { clamp, degradado, easeIn, easeOut, lerp, marca, pop, prog, useFormato } from './base';
import { useGuion } from './guion';
import { fuente } from '../marca';

const Palabra: React.FC<{ en: number; children: React.ReactNode; acento?: boolean; tam: number }> = ({ en, children, acento, tam }) => {
  const f = useCurrentFrame();
  const t = pop(prog(f, en, en + 8));
  return (
    <span style={{ display: 'inline-block', transform: `scale(${lerp(1.6, 1, t)})`, opacity: clamp(t * 2), filter: `blur(${(1 - clamp(t)) * 10}px)`, fontSize: tam, ...(acento ? { background: degradado, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : {}) }}>{children}</span>
  );
};

export const Gancho: React.FC = () => {
  const f = useCurrentFrame();
  const { T, Escena, pregunta, frase } = useGuion();
  const { vertical, W, H } = useFormato();
  const g = T.gancho;
  // Golpe de entrada: ya en movimiento en el cuadro 0
  const entrada = easeOut(prog(f, 0, 12));
  const zoom = lerp(1.22, 1, entrada) * (1 + 0.05 * easeOut(prog(f, 36, g.rasga)));
  const tiembla = (1 - entrada) * 14;
  const mx = Math.sin(f * 0.21) * 5 + Math.sin(f * 1.7) * tiembla;
  const my = Math.cos(f * 0.17) * 4 + Math.cos(f * 1.3) * tiembla;
  const rot = Math.sin(f * 0.11) * 0.4;
  // Rasgado
  const r = easeIn(prog(f, g.rasga, g.rasga + 14));
  const zig = Array.from({ length: 15 }, (_, i) => {
    const y = (i / 14) * 100;
    const x = 50 + (i % 2 ? 2.4 : -2.1) + Math.sin(i * 1.7) * 1.4;
    return [x, y] as const;
  });
  const izq = `polygon(0% 0%, ${zig.map(([x, y]) => `${x}% ${y}%`).join(', ')}, 0% 100%)`;
  const der = `polygon(100% 0%, ${zig.map(([x, y]) => `${x}% ${y}%`).join(', ')}, 100% 100%)`;
  const mitad = (clip: string, lado: -1 | 1) => (
    <AbsoluteFill style={{ transform: `translate(${mx + lado * r * W * 0.75}px, ${my + r * 60}px) rotate(${rot + lado * r * 14}deg) scale(${zoom})`, clipPath: clip, boxShadow: '0 0 80px rgba(0,0,0,.6)' }}>
      <Escena />
    </AbsoluteFill>
  );

  const tam = vertical ? 82 : 95;
  const lineas = vertical ? pregunta.vertical : pregunta.horizontal;
  // Iris: la escena se cierra sobre la chispa y deja ver el mundo
  const iris = prog(f, g.iris, T.drop + 2);
  const radio = lerp(Math.hypot(W, H), 0, easeIn(iris));
  const cx = W / 2, cy = vertical ? H * 0.62 : H * 0.68;
  const chispa = easeOut(prog(f, g.chispa, g.chispa + 8));

  return (
    <AbsoluteFill style={{ clipPath: f >= g.iris ? `circle(${radio}px at ${cx}px ${cy}px)` : undefined }}>
      {/* lo que hay detrás */}
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 60%, ${marca.mango} 0%, ${marca.brasa} 55%, #B23A33 100%)` }} />
      {f >= g.rasga && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: vertical ? 260 : 120 }}>
          <div style={{ fontFamily: fuente.titular, fontWeight: 800, color: '#fff', textAlign: 'center', lineHeight: 1.02, letterSpacing: -2, padding: '0 40px' }}>
            <div><Palabra en={g.rasga + 4} tam={vertical ? 64 : 64}>{frase[0]}</Palabra></div>
            <div><Palabra en={g.rasga + 10} tam={vertical ? 112 : 124}>{frase[1]}</Palabra></div>
          </div>
        </AbsoluteFill>
      )}
      {chispa > 0 && (
        <div style={{ position: 'absolute', left: cx, top: cy, width: 0, height: 0 }}>
          <div style={{ position: 'absolute', width: 260, height: 260, left: -130, top: -130, borderRadius: 999, transform: `scale(${chispa * (1 + 0.15 * Math.sin(f))})`, background: 'radial-gradient(circle, #FFFDF6 0%, #FFF1C9 14%, rgba(245,160,48,.85) 30%, rgba(232,83,74,0) 68%)' }} />
        </div>
      )}
      {r < 1 && (
        <>
          {f < g.rasga ? mitad('none', 1) : (<>{mitad(izq, -1)}{mitad(der, 1)}</>)}
          {/* Pregunta del gancho, como etiqueta pegada */}
          <div style={{ position: 'absolute', left: vertical ? 56 : 70, top: vertical ? 96 : 250, transform: `rotate(-3deg) translateX(${-r * W}px)`, transformOrigin: 'left top' }}>
            <div style={{ background: marca.carbon, padding: vertical ? '26px 34px 30px' : '30px 40px 34px', borderRadius: 18, fontFamily: fuente.titular, fontWeight: 800, color: '#fff', lineHeight: 1.04, letterSpacing: -2, boxShadow: '0 24px 60px rgba(0,0,0,.45)', maxWidth: vertical ? 968 : 760 }}>
              {lineas.map((l) => (
                <div key={l} style={{ display: 'flex', gap: '0.28em', fontSize: tam, whiteSpace: 'nowrap' }}>
                  {l.split(' ').map((p) => (
                    <Palabra key={p} en={p.startsWith('*') ? 3 : -8} acento={p.startsWith('*')} tam={tam}>{p.replace('*', '')}</Palabra>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};
