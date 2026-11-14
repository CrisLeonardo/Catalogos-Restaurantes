// 8–25 s: el flujo estrella con las pantallas reales de la app.
import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Dispositivo } from '../componentes/Dispositivo';
import { FondoLeogin } from '../componentes/Fondo';
import { Titular } from '../componentes/Titular';
import { color, fuente } from '../marca';

export const Pide: React.FC = () => (
  <AbsoluteFill>
    <FondoLeogin />
    <Dispositivo pasos={[
      { en: 0, captura: 'c1-menu', foco: 'plato', zoom: 1.12, toque: 'plato', toqueEn: 17 },
      { en: 23, captura: 'c3-ficha-lista', foco: 'agregar', zoom: 1.15, toque: 'agregar', toqueEn: 40 },
      { en: 46, captura: 'c6-confirmar', foco: 'confirmar', zoom: 1.2, resalte: 'nota', resalteEn: 50, toque: 'confirmar', toqueEn: 66 },
      { en: 72, captura: 'c7-enviado', foco: 'titulo', zoom: 1.1 },
    ]} />
    <Titular kicker="Con Leogin" texto="Tu cliente pide *desde la mesa.*" tam={90} top={170} />
  </AbsoluteFill>
);

// Ondas de «ding»: el pedido suena.
const Ding: React.FC<{ en: number }> = ({ en }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < en) return null;
  const s = spring({ frame: frame - en, fps, config: { damping: 8, mass: 0.5 } });
  return (
    <div style={{ position: 'absolute', left: 820, top: 560, width: 0, height: 0 }}>
      {[0, 6, 12].map((d) => {
        const o = interpolate(frame - en - d, [0, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return <div key={d} style={{ position: 'absolute', left: -110, top: -110, width: 220, height: 220, borderRadius: '50%', border: `8px solid ${color.mango}`, opacity: (1 - o) * (o > 0 ? 1 : 0), transform: `scale(${0.4 + o * 1.4})` }} />;
      })}
      <div style={{
        position: 'absolute', left: -78, top: -78, width: 156, height: 156, borderRadius: '50%', background: `linear-gradient(135deg, ${color.brasa}, ${color.mango})`,
        display: 'grid', placeItems: 'center', boxShadow: '0 20px 50px rgba(232,83,74,.5)', transform: `scale(${s}) rotate(${Math.sin((frame - en) * 0.9) * 14 * Math.max(0, 1 - (frame - en) / 20)}deg)`,
      }}>
        <svg width="84" height="84" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      </div>
    </div>
  );
};

export const Suena: React.FC = () => (
  <AbsoluteFill>
    <FondoLeogin />
    <Dispositivo pasos={[
      { en: 0, captura: 'p0-vivo-antes', zoom: 1 },
      { en: 10, captura: 'p1-vivo', foco: 'nota', zoom: 1.4, resalte: 'nota', resalteEn: 30 },
    ]} />
    <Ding en={10} />
    <Titular kicker="Al instante" texto="Suena en *tu panel.*" tam={104} top={170} />
  </AbsoluteFill>
);

export const Cocina: React.FC = () => (
  <AbsoluteFill>
    <FondoLeogin />
    <Dispositivo tipo="tableta" centroY={1230} pasos={[
      { en: 0, captura: 'k1-cocina', zoom: 1.02 },
      { en: 22, captura: 'k1-cocina', foco: 'nota', zoom: 1.85, resalte: 'nota', resalteEn: 34 },
    ]} />
    <Titular kicker="En cocina" texto="Lo leen claro. *Sin gritos.*" tam={96} top={170} />
  </AbsoluteFill>
);

export const Seguimiento: React.FC = () => (
  <AbsoluteFill>
    <FondoLeogin />
    <Dispositivo pasos={[
      { en: 0, captura: 't1-en-cocina', foco: 'estado', zoom: 1.25 },
      { en: 40, captura: 't2-listo', foco: 'estado', zoom: 1.45, resalte: 'estado', resalteEn: 46 },
    ]} />
    <Titular kicker="Para tu cliente" texto="Ve su pedido *en vivo.*" tam={100} top={170} />
  </AbsoluteFill>
);

export const Caja: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sello = spring({ frame: frame - 75, fps, config: { damping: 9, mass: 0.6 } });
  return (
    <AbsoluteFill>
      <FondoLeogin />
      <Dispositivo pasos={[
        { en: 0, captura: 'q0-caja', zoom: 1 },
        { en: 40, captura: 'q1-cuadra', foco: 'esperado', zoom: 1.3, resalte: 'cuadra', resalteEn: 58 },
      ]} />
      <Titular kicker="Al cerrar" texto="La caja cuadra *al centavo.*" tam={98} top={170} />
      <div style={{
        position: 'absolute', left: 290, top: 680, padding: '22px 46px', borderRadius: 26,
        border: `10px solid ${color.albahaca}`, color: color.albahaca, background: 'rgba(255,255,255,.94)',
        fontFamily: fuente.titular, fontWeight: 800, fontSize: 92, letterSpacing: '0.02em',
        transform: `rotate(-8deg) scale(${interpolate(sello, [0, 1], [2.4, 1])})`, opacity: frame < 75 ? 0 : Math.min(1, sello * 2),
      }}>CUADRA ✓</div>
    </AbsoluteFill>
  );
};

export const Hoy: React.FC = () => (
  <AbsoluteFill>
    <FondoLeogin />
    <Dispositivo pasos={[{ en: 0, captura: 'h1-hoy', foco: 'ventas', zoom: 1.32 }]} />
    <Titular kicker="Tú, desde tu celular" texto="Sabes cuánto vendiste, *aunque no estés.*" tam={84} top={170} />
    <div style={{ position: 'absolute', right: 70, top: 176, padding: '10px 22px', borderRadius: 999, background: 'rgba(0,0,0,.55)', color: 'rgba(255,255,255,.85)', fontFamily: fuente.texto, fontSize: 30 }}>
      Datos de ejemplo
    </div>
  </AbsoluteFill>
);
