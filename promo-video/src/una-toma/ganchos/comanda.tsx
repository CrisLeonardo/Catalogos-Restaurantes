// Gancho del video «con meseros»: la comanda escrita a mano que nadie entiende.
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { clamp, easeOut, mano, prog, useFormato } from '../base';
import { fuente } from '../../marca';
import TM from '../tiempos-meseros.json';

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
      <Circulo x={ancho * 0.11 + 154 * (tam / 108)} y={y0 - 18} w={tam * 2.4} h={tam * 1.1} desde={TM.gancho.circulo} />
      <Circulo x={ancho * 0.11 + 404 * (tam / 108)} y={y0 + paso * 2 - 6} w={tam * 2.3} h={tam * 0.95} desde={TM.gancho.circulo + 18} />
    </div>
  );
};


export const EscenaComanda: React.FC = () => {
  const { vertical, W, H } = useFormato();
  const pw = vertical ? W * 0.98 : W * 0.6;
  const ph = vertical ? H * 0.9 : H * 1.02;
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 40%, #4A3A30 0%, #1C1714 80%)' }}>
      <div style={{ position: 'absolute', left: vertical ? (W - pw) / 2 : W - pw - 60, top: (H - ph) / 2 + (vertical ? 60 : 0), width: pw, height: ph, transform: 'rotate(-2.5deg)' }}>
        <Papel ancho={pw} />
      </div>
    </AbsoluteFill>
  );
};
