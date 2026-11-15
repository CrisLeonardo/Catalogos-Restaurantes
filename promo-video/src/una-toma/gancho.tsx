// Segundos 0–4: la comanda escrita a mano que nadie entiende, se rompe y de
// ella nace la chispa. Desde el cuadro 0 ya hay texto, movimiento y sonido.
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { clamp, degradado, easeIn, easeOut, lerp, mano, marca, pop, prog, T, useFormato } from './base';
import { fuente } from '../marca';

const Linea: React.FC<{ y: number; children: React.ReactNode; tam: number; giro?: number }> = ({ y, children, tam, giro = 0 }) => (
  <div style={{ position: 'absolute', left: '11%', top: y, fontFamily: mano, fontWeight: 700, fontSize: tam, color: '#1E2A55', lineHeight: 1, whiteSpace: 'nowrap', transform: `rotate(${giro}deg)` }}>{children}</div>
);

/** Trazo rojo de marcador alrededor de algo (se dibuja solo). */
const Circulo: React.FC<{ x: number; y: number; w: number; h: number; desde: number }> = ({ x, y, w, h, desde }) => {
  const f = useCurrentFrame();
  const t = easeOut(prog(f, desde, desde + 12));
  if (t <= 0) return null;
  return (
    <svg style={{ position: 'absolute', left: x - 20, top: y - 20, overflow: 'visible' }} width={w + 40} height={h + 40}>
      <path
        d={`M ${w * 0.55 + 20} ${22} C ${w + 40} ${10}, ${w + 50} ${h + 30}, ${w * 0.5 + 20} ${h + 34} C ${-10} ${h + 40}, ${-6} ${8}, ${w * 0.62 + 20} ${14}`}
        pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - t}
        fill="none" stroke="#D7262E" strokeWidth={9} strokeLinecap="round" opacity={0.92}
      />
    </svg>
  );
};

const Papel: React.FC<{ ancho: number }> = ({ ancho }) => {
  const f = useCurrentFrame();
  const { vertical } = useFormato();
  const tam = vertical ? 108 : 86;
  const paso = vertical ? 160 : 118;
  const y0 = vertical ? 300 : 150;
  // «4» tachado y corregido a «7» en vivo
  const tacha = easeOut(prog(f, 8, 18));
  const siete = clamp((f - 16) / 6);
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#FBF7EA', backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${paso - 3}px, rgba(70,110,190,.35) ${paso - 3}px, rgba(70,110,190,.35) ${paso}px)`, backgroundPosition: `0 ${y0 + tam * 0.95 - paso}px`, boxShadow: '0 40px 90px rgba(0,0,0,.6)' }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '8%', width: 3, background: 'rgba(215,38,46,.45)' }} />
      <div style={{ position: 'absolute', top: vertical ? 120 : 50, left: '11%', right: '6%', display: 'flex', justifyContent: 'space-between', fontFamily: fuente.texto, fontWeight: 700, letterSpacing: 4, fontSize: vertical ? 34 : 28, color: 'rgba(30,42,85,.55)' }}>
        <span>COMANDA</span><span style={{ color: 'rgba(215,38,46,.75)' }}>Nº 0487</span>
      </div>
      <Linea y={y0} tam={tam * 1.05} giro={-1.5}>
        Mesa{' '}
        <span style={{ position: 'relative', display: 'inline-block' }}>
          4
          <svg style={{ position: 'absolute', left: -14, top: tam * 0.15, overflow: 'visible' }} width={tam * 0.7} height={tam * 0.7}>
            <path d={`M0 ${tam * 0.5} L${tam * 0.65} ${tam * 0.05} M4 ${tam * 0.2} L${tam * 0.6} ${tam * 0.55} M2 ${tam * 0.38} L${tam * 0.62} ${tam * 0.3}`} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - tacha} stroke="#1E2A55" strokeWidth={7} strokeLinecap="round" fill="none" />
          </svg>
        </span>
        <span style={{ opacity: siete, display: 'inline-block', transform: 'rotate(-8deg) translateY(-14px)', marginLeft: 6 }}>7 ??</span>
      </Linea>
      <Linea y={y0 + paso} tam={tam} giro={-0.6}>2 polo sin sebolla</Linea>
      <Linea y={y0 + paso * 2} tam={tam} giro={0.8}>1 caldo d res <span style={{ fontSize: tam * 0.75 }}>(o pollo?)</span></Linea>
      <Linea y={y0 + paso * 3} tam={tam} giro={-1}>
        <span style={{ textDecoration: 'line-through', textDecorationThickness: 6 }}>1 papas</span> 2 limo...
      </Linea>
      <Linea y={y0 + paso * 4} tam={tam * 0.9} giro={2}>sin asucar ??</Linea>
      <Linea y={y0 + paso * 5.3} tam={tam} giro={-2}>
        Total <span style={{ textDecoration: 'line-through', textDecorationThickness: 6 }}>Q145</span> Q154 ?
      </Linea>
      {/* mancha de café */}
      <div style={{ position: 'absolute', right: vertical ? '-6%' : '8%', top: vertical ? y0 + paso * 4.6 : y0 + paso * 1.2, width: 330, height: 330, borderRadius: 999, background: 'radial-gradient(circle, transparent 58%, rgba(120,70,30,.28) 62%, rgba(120,70,30,.12) 70%, transparent 74%)' }} />
      <Circulo x={ancho * 0.11 + 154 * (tam / 108)} y={y0 - 18} w={tam * 2.4} h={tam * 1.1} desde={T.gancho.circulo} />
      <Circulo x={ancho * 0.11 + 404 * (tam / 108)} y={y0 + paso * 2 - 6} w={tam * 2.3} h={tam * 0.95} desde={T.gancho.circulo + 18} />
    </div>
  );
};

const Palabra: React.FC<{ en: number; children: React.ReactNode; acento?: boolean; tam: number }> = ({ en, children, acento, tam }) => {
  const f = useCurrentFrame();
  const t = pop(prog(f, en, en + 8));
  return (
    <span style={{ display: 'inline-block', transform: `scale(${lerp(1.6, 1, t)})`, opacity: clamp(t * 2), filter: `blur(${(1 - clamp(t)) * 10}px)`, fontSize: tam, ...(acento ? { background: degradado, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : {}) }}>{children}</span>
  );
};

export const Gancho: React.FC = () => {
  const f = useCurrentFrame();
  const { vertical, W, H } = useFormato();
  const g = T.gancho;
  // Golpe de entrada: ya en movimiento en el cuadro 0
  const entrada = easeOut(prog(f, 0, 12));
  const zoom = lerp(1.22, 1, entrada) * (1 + 0.05 * easeOut(prog(f, g.circulo, g.rasga)));
  const tiembla = (1 - entrada) * 14;
  const mx = Math.sin(f * 0.21) * 5 + Math.sin(f * 1.7) * tiembla;
  const my = Math.cos(f * 0.17) * 4 + Math.cos(f * 1.3) * tiembla;
  const rot = -2.5 + Math.sin(f * 0.11) * 0.4;
  // Rasgado
  const r = easeIn(prog(f, g.rasga, g.rasga + 14));
  const pw = vertical ? W * 0.98 : W * 0.6;
  const ph = vertical ? H * 0.9 : H * 1.02;
  const zig = Array.from({ length: 15 }, (_, i) => {
    const y = (i / 14) * 100;
    const x = 50 + (i % 2 ? 2.4 : -2.1) + Math.sin(i * 1.7) * 1.4;
    return [x, y] as const;
  });
  const izq = `polygon(0% 0%, ${zig.map(([x, y]) => `${x}% ${y}%`).join(', ')}, 0% 100%)`;
  const der = `polygon(100% 0%, ${zig.map(([x, y]) => `${x}% ${y}%`).join(', ')}, 100% 100%)`;

  const papel = (clip: string, lado: -1 | 1) => (
    <div style={{ position: 'absolute', left: vertical ? (W - pw) / 2 : W - pw - 60, top: (H - ph) / 2 + (vertical ? 60 : 0), width: pw, height: ph, transform: `translate(${mx + lado * r * W * 0.75}px, ${my + r * 60}px) rotate(${rot + lado * r * 14}deg) scale(${zoom})`, clipPath: clip }}>
      <Papel ancho={pw} />
    </div>
  );

  const tamGrande = vertical ? 100 : 116;
  const tamChico = vertical ? 64 : 64;
  // Iris: la escena se cierra sobre la chispa y deja ver el mundo
  const iris = prog(f, g.iris, T.drop + 2);
  const radio = lerp(Math.hypot(W, H), 0, easeIn(iris));
  const cx = W / 2, cy = vertical ? H * 0.62 : H * 0.68;
  const chispa = easeOut(prog(f, g.chispa, g.chispa + 8));

  return (
    <AbsoluteFill style={{ clipPath: f >= g.iris ? `circle(${radio}px at ${cx}px ${cy}px)` : undefined }}>
      {/* lo que hay detrás del papel */}
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 60%, ${marca.mango} 0%, ${marca.brasa} 55%, #B23A33 100%)` }} />
      {f >= g.rasga && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: vertical ? 260 : 120 }}>
          <div style={{ fontFamily: fuente.titular, fontWeight: 800, color: '#fff', textAlign: 'center', lineHeight: 1.02, letterSpacing: -2 }}>
            <div><Palabra en={g.rasga + 4} tam={tamChico}>Se acabaron</Palabra></div>
            <div><Palabra en={g.rasga + 10} tam={vertical ? 118 : 130}>los papelitos.</Palabra></div>
          </div>
        </AbsoluteFill>
      )}
      {chispa > 0 && (
        <div style={{ position: 'absolute', left: cx, top: cy, width: 0, height: 0 }}>
          <div style={{ position: 'absolute', width: 260, height: 260, left: -130, top: -130, borderRadius: 999, transform: `scale(${chispa * (1 + 0.15 * Math.sin(f))})`, background: 'radial-gradient(circle, #FFFDF6 0%, #FFF1C9 14%, rgba(245,160,48,.85) 30%, rgba(232,83,74,0) 68%)' }} />
        </div>
      )}
      {r < 1 && (
        <AbsoluteFill style={{ background: '#2A211C' }}>
          <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 40%, #4A3A30 0%, #1C1714 80%)', opacity: 1 - r }} />
          {f < g.rasga ? papel('none', 1) : (<>{papel(izq, -1)}{papel(der, 1)}</>)}
          {/* Pregunta del gancho, como etiqueta pegada */}
          <div style={{ position: 'absolute', left: vertical ? 56 : 70, top: vertical ? 96 : 250, transform: `rotate(-3deg) translateX(${-r * W}px)`, transformOrigin: 'left top' }}>
            <div style={{ background: marca.carbon, padding: vertical ? '26px 34px 30px' : '30px 40px 34px', borderRadius: 18, fontFamily: fuente.titular, fontWeight: 800, color: '#fff', lineHeight: 1.04, letterSpacing: -2, boxShadow: '0 24px 60px rgba(0,0,0,.45)', maxWidth: vertical ? 960 : 760 }}>
              <div><Palabra en={-8} tam={tamGrande * 0.82}>¿Tu cocina</Palabra></div>
              <div style={{ display: 'flex', flexDirection: vertical ? 'row' : 'column', gap: vertical ? '0.28em' : 0, fontSize: tamGrande * 0.82 }}><Palabra en={-8} tam={tamGrande * 0.82}>también</Palabra><Palabra en={3} acento tam={tamGrande * 0.82}>adivina?</Palabra></div>
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
