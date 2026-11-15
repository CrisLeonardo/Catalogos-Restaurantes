// 3–8 s: el problema. Chats que se amontonan y comandas a mano.
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { FondoPapel } from '../componentes/Fondo';
import { Titular } from '../componentes/Titular';
import { Hoja, Tachon, mano, temblor, useCuadro } from '../componentes/Antes';
import { color, fuente } from '../marca';

export const MENSAJES = [
  '¿Ya viene mi pedido?',
  'Llevo 40 min esperando',
  '¿Lo tienen sin cebolla?',
  'Hola??',
  'La mesa 4 dice que no pidió eso',
  '¿Cuánto es el total?',
  '¿Siguen abiertos?',
];
export const CADA = 9; // un mensaje cada 9 cuadros

// Chat genérico (no imita ninguna app en particular).
export const Chats: React.FC = () => {
  const c = useCuadro(2);
  const visibles = MENSAJES.filter((_, n) => c >= n * CADA).length;
  const sinLeer = Math.min(14, 3 + Math.floor(c / 6));
  const t = temblor('chat', useCuadro(3), 1.2);
  return (
    <AbsoluteFill>
      <FondoPapel />
      <Titular texto="Pedidos perdidos *en el chat.*" inmediato claro tam={94} top={190} />
      <div style={{
        position: 'absolute', left: 120, top: 560, width: 840, height: 1180, borderRadius: 56, background: '#ECE6DC',
        boxShadow: '0 40px 80px rgba(60,40,20,.3)', overflow: 'hidden', transform: `translate(${t.x}px, ${t.y}px) rotate(${-2 + t.r}deg)`,
      }}>
        <div style={{ height: 150, background: '#3B3631', display: 'flex', alignItems: 'center', padding: '0 46px', gap: 26 }}>
          <div style={{ width: 84, height: 84, borderRadius: '50%', background: '#7B7064' }} />
          <div style={{ fontFamily: fuente.texto, fontWeight: 700, fontSize: 46, color: '#fff', flex: 1 }}>Pedidos</div>
          <div style={{ minWidth: 84, height: 84, borderRadius: 42, background: '#D2342B', color: '#fff', fontFamily: fuente.texto, fontWeight: 700, fontSize: 46, display: 'grid', placeItems: 'center', padding: '0 18px' }}>{sinLeer}</div>
        </div>
        <div style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {MENSAJES.slice(0, visibles).map((m, n) => {
            const tt = temblor(`m${n}`, c, 0.6);
            return (
              <div key={m} style={{
                alignSelf: 'flex-start', maxWidth: 680, background: '#FFFFFF', borderRadius: '8px 34px 34px 34px', padding: '22px 32px',
                fontFamily: fuente.texto, fontSize: 46, color: color.tinta, boxShadow: '0 4px 10px rgba(0,0,0,.08)',
                transform: `translate(${tt.x}px, ${tt.y}px) rotate(${tt.r}deg)`,
              }}>
                {m}
                <div style={{ fontSize: 28, color: '#8A8178', marginTop: 6, textAlign: 'right' }}>{`8:${String(31 + n * 3).padStart(2, '0')} p. m.`}</div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Comandas: React.FC = () => {
  const frame = useCurrentFrame();
  const c = useCuadro(3);
  const barrido = interpolate(frame, [60, 75], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const notas = [
    { t: ['2 clásicas', 's/ ceb.', '¿mesa 4 o 6?'], x: 70, y: 600, g: -7, s: 'n1' },
    { t: ['1 pepperoni', 'p/ llevar', '¿ya pagó?'], x: 540, y: 820, g: 6, s: 'n2' },
    { t: ['¡se acabó', 'el queso!'], x: 170, y: 1230, g: 3, s: 'n3' },
  ];
  return (
    <AbsoluteFill>
      <FondoPapel />
      <Titular texto="Comandas *a gritos.*" inmediato claro tam={110} top={190} />
      {notas.map((n, i) => (
        <Hoja key={n.s} semilla={n.s} giro={n.g} fuerza={1.6} style={{ left: n.x, top: n.y, width: 480, padding: '44px 48px 60px', opacity: c >= i * 9 ? 1 : 0 }}>
          <div style={{ fontFamily: mano, fontWeight: 700, fontSize: 78, color: '#2C2C2C', lineHeight: 1.05 }}>
            {n.t.map((l) => <div key={l} style={{ color: l.startsWith('¿') || l.startsWith('¡') ? '#D2342B' : undefined }}>{l}</div>)}
          </div>
          {i === 0 ? <Tachon desde={30} ancho={300} style={{ left: 40, top: 150 }} /> : null}
        </Hoja>
      ))}
      {/* barrido de brasa: se acaba el «antes» */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: `${barrido * 100}%`,
        background: `linear-gradient(0deg, ${color.carbonHondo} 75%, ${color.brasa})`,
      }} />
    </AbsoluteFill>
  );
};
