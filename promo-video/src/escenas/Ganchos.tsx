// Los tres ganchos (0–3 s). Se entienden en el primer segundo, sin marca.
import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Dispositivo } from '../componentes/Dispositivo';
import { FondoLeogin, FondoPapel } from '../componentes/Fondo';
import { Titular } from '../componentes/Titular';
import { Hoja, Tachon, mano, temblor, useCuadro } from '../componentes/Antes';
import { grabacion } from '../capturas';
import { color, fuente } from '../marca';

// A · Dolor: el cuaderno de la caja que no cuadra.
export const GanchoDolor: React.FC = () => {
  const c = useCuadro(3);
  const sacudida = c < 60 ? temblor('cam', c, 2.2) : { x: 0, y: 0, r: 0 };
  const filas = [
    ['Mesa 4', 'Q85'],
    ['Para llevar', 'Q120'],
    ['¿Tarjeta?', 'Q90'],
  ];
  return (
    <AbsoluteFill>
      <FondoPapel />
      <AbsoluteFill style={{ transform: `translate(${sacudida.x}px, ${sacudida.y}px) rotate(${sacudida.r * 0.3}deg)` }}>
        <Titular texto="Cierras la caja… ¿y *no cuadra?*" inmediatas={3} desde={16} claro tam={108} top={180} />
        <Hoja semilla="libreta" giro={-4} style={{ left: 150, top: 640, width: 780, height: 900, padding: '70px 70px 0 90px',
          backgroundImage: 'repeating-linear-gradient(#FFFDF6 0 76px, #C9DDF0 76px 78px)', backgroundPositionY: 40 }}>
          <div style={{ position: 'absolute', left: 64, top: 0, bottom: 0, width: 3, background: '#E59A9A' }} />
          <div style={{ fontFamily: mano, fontSize: 64, fontWeight: 700, color: '#26408B', lineHeight: '78px' }}>
            <div style={{ marginBottom: 6 }}>Cuenta de hoy</div>
            {filas.map(([a, b]) => (
              <div key={a} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{a}</span><span>{b}</span></div>
            ))}
            <div style={{ borderTop: '4px solid #26408B', marginTop: 14, paddingTop: 6, display: 'flex', justifyContent: 'space-between' }}>
              <span>Total</span>
              <span style={{ color: '#D2342B', fontSize: 90 }}>{c >= 30 ? '¿?' : ''}</span>
            </div>
            <div style={{ color: '#D2342B', fontSize: 58, marginTop: 30, transform: 'rotate(-5deg)', opacity: c >= 45 ? 1 : 0 }}>faltan… ¿cuánto?</div>
          </div>
          <Tachon desde={34} ancho={300} style={{ left: 380, top: 380 }} />
          <Tachon desde={42} ancho={260} style={{ left: 420, top: 300 }} />
        </Hoja>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// B · Resultado: empieza por el final, la caja que cuadra.
export const GanchoResultado: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sello = spring({ frame: frame - 20, fps, config: { damping: 9, mass: 0.6 } });
  return (
    <AbsoluteFill>
      <FondoLeogin />
      <Dispositivo recorte={600} centroY={1200} pasos={[{ en: 0, captura: 'q1-cuadra', foco: 'esperado', zoom: 1.3, resalte: 'cuadra', resalteEn: 6 }]} />
      <Titular texto="Cerrar el día *al centavo.*" inmediato tam={104} top={190} />
      <Titular texto="¿Cómo? Mira." desde={52} tam={60} top={470} />
      <div style={{
        position: 'absolute', left: 300, top: 760, padding: '22px 46px', borderRadius: 26,
        border: `10px solid ${color.albahaca}`, color: color.albahaca, background: 'rgba(255,255,255,.92)',
        fontFamily: fuente.titular, fontWeight: 800, fontSize: 92, letterSpacing: '0.02em',
        transform: `rotate(-8deg) scale(${interpolate(sello, [0, 1], [2.4, 1])})`, opacity: Math.min(1, sello * 2),
      }}>CUADRA ✓</div>
    </AbsoluteFill>
  );
};

// C · Medible: cronómetro del celular del cliente a la pantalla del panel.
export const GanchoCronometro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const toque = 16;
  const llega = Math.min(86, toque + Math.round(grabacion.latencia * fps));
  const seg = interpolate(frame, [toque, llega], [0, grabacion.latencia], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const listo = frame >= llega;
  return (
    <AbsoluteFill>
      <FondoLeogin />
      <Dispositivo escala={0.6} recorte={740} centroX={285} centroY={1290} pasos={[{ en: 0, captura: 'c6-confirmar', foco: 'confirmar', zoom: 1.05, toque: 'confirmar', toqueEn: toque }]} />
      <Dispositivo escala={0.6} recorte={740} centroX={795} centroY={1290} pasos={[
        { en: 0, captura: 'p0-vivo-antes', zoom: 1.05 },
        { en: llega, captura: 'p1-vivo', foco: 'nota', zoom: 1.25, resalte: 'nota', resalteEn: llega + 2 },
      ]} />
      <Titular texto="Del celular del cliente *a tu panel:*" inmediato tam={78} top={190} />
      <div style={{
        position: 'absolute', left: 80, top: 410, fontFamily: fuente.titular, fontWeight: 800, fontSize: 180,
        color: listo ? color.mango : '#FFFFFF', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums',
        transform: `scale(${listo ? interpolate(frame - llega, [0, 4, 10], [1.18, 0.96, 1], { extrapolateRight: 'clamp' }) : 1})`, transformOrigin: 'left center',
      }}>{seg.toFixed(1)} s</div>
      <div style={{ position: 'absolute', left: 82, top: 660, fontFamily: fuente.texto, fontSize: 32, color: 'rgba(255,255,255,.6)' }}>
        Tiempo medido en la grabación de esta demo
      </div>
      {[['Cliente', 60], ['Tu panel', 570]].map(([t, x]) => (
        <div key={t} style={{
          position: 'absolute', left: x as number, top: 1760, padding: '12px 26px', borderRadius: 999, background: color.carbon,
          border: '2px solid rgba(255,255,255,.18)', fontFamily: fuente.texto, fontWeight: 700, fontSize: 36, color: '#fff',
        }}>{t}</div>
      ))}
    </AbsoluteFill>
  );
};
