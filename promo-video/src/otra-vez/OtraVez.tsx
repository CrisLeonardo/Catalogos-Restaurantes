// «Otra vez» — el mismo domingo, dos veces.
//
//  0,0 s  el domingo sin Leogin: el caos se amontona
//  5,4 s  todo se congela: «¿Y si pudieras repetir este domingo?»
//  7,2 s  la cinta se rebobina hasta la 1:47
//  8,4 s  «El mismo domingo. Ahora con Leogin.»
// 10,8 s  cinco pasos con las pantallas reales
// 34,8 s  lo demás que trae
// 39,6 s  los dos domingos, lado a lado, y el cierre
import React from 'react';
import { AbsoluteFill, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Audio } from '@remotion/media';
import { color, degradado, fuente } from '../marca';
import { Leo } from '../componentes/Leo';
import { av, azar, captura, PULSO, salto, T, type Publico } from './base';
import { Caos, Reloj } from './Caos';
import { ADEMAS, ADEMAS_PANTALLAS, GUIONES, type Guion } from './guiones';
import { Pasos } from './Pasos';

const Logo: React.FC<{ tam: number }> = ({ tam }) => (
  <svg width={tam} height={tam} viewBox="0 0 100 100">
    <defs>
      <linearGradient id="lgOtraVez" x1="27" y1="19" x2="72" y2="81" gradientUnits="userSpaceOnUse">
        <stop stopColor={color.brasa} />
        <stop offset="1" stopColor={color.mango} />
      </linearGradient>
    </defs>
    <rect width="100" height="100" rx="22" fill={color.carbon} />
    <path d="M27 19 h18 v44 h27 v18 H27 Z" fill="url(#lgOtraVez)" />
  </svg>
);

// ── el caos se congela y se rebobina ──────────────────────────────────────
const Antes: React.FC<{ guion: Guion }> = ({ guion }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  const congela = av(f, T.pregunta, T.pregunta + 8);
  const rebobina = f >= T.rebobina;
  // hacia atrás: de 162 a 0, acelerando
  const fCaos = rebobina ? 162 * (1 - av(f, T.rebobina, T.titulo - 2, (n) => n * n * (3 - 2 * n))) : Math.min(f, 162);
  const pregunta = f >= T.pregunta && !rebobina;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ filter: pregunta ? `grayscale(${congela}) brightness(${1 - congela * 0.62}) blur(${congela * 5}px)` : rebobina ? 'saturate(0.6) contrast(1.15)' : undefined }}>
        <Caos f={fCaos} guion={guion} />
      </AbsoluteFill>
      {pregunta ? (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: vertical ? 80 : 200 }}>
          <div style={{ fontFamily: fuente.titular, fontWeight: 800, fontSize: vertical ? 92 : 96, lineHeight: 1.1, color: '#fff', textAlign: 'center', opacity: av(f, T.pregunta + 6, T.pregunta + 16), scale: String(0.94 + 0.06 * av(f, T.pregunta + 6, T.pregunta + 40)) }}>
            ¿Y si pudieras <span style={{ color: color.mango }}>repetir</span> este domingo?
          </div>
        </AbsoluteFill>
      ) : null}
      {rebobina ? (
        <AbsoluteFill>
          {/* rayas de cinta que suben */}
          <AbsoluteFill style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,.07) 0 3px, transparent 3px 9px)', backgroundPositionY: -f * 23 }} />
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ position: 'absolute', left: 0, right: 0, height: 26 + i * 18, top: `${(azar(Math.floor(f / 2), i) * 100) % 100}%`, background: 'rgba(255,255,255,.16)', translate: `${(azar(f, i) - 0.5) * 60}px 0px` }} />
          ))}
          <div style={{ position: 'absolute', right: vertical ? 70 : 90, top: vertical ? 130 : 110, fontFamily: fuente.cifras, fontWeight: 700, fontSize: vertical ? 54 : 50, color: '#fff', display: 'flex', alignItems: 'center', gap: 18, opacity: Math.floor(f / 5) % 2 ? 1 : 0.55 }}>
            <svg width="70" height="46" viewBox="0 0 70 46"><path d="M34 2 L4 23 L34 44 Z M68 2 L38 23 L68 44 Z" fill="#fff" /></svg>
            OTRA VEZ
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

// ── el mismo domingo, ahora con Leogin ────────────────────────────────────
const Titulo: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  const abre = av(f, 0, 14);
  const sale = av(f, 64, 72);
  return (
    <AbsoluteFill style={{ background: color.masa, clipPath: `circle(${abre * 130}% at 50% 50%)` }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 14, background: degradado }} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: vertical ? 44 : 34, opacity: 1 - sale, translate: `0px ${-sale * 60}px` }}>
        <div style={{ scale: String(salto(f, 2, 12)) }}>
          <Reloj minutos={107} claro tam={vertical ? 230 : 210} />
        </div>
        <div style={{ fontFamily: fuente.titular, fontWeight: 800, fontSize: vertical ? 84 : 88, color: color.carbon, textAlign: 'center', lineHeight: 1.1, opacity: av(f, 8, 18) }}>
          El mismo domingo.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 26, opacity: av(f, 30, 40), scale: String(salto(f, 30, 10)) }}>
          <span style={{ fontFamily: fuente.titular, fontWeight: 800, fontSize: vertical ? 70 : 74, color: color.brasa }}>Ahora con</span>
          <Logo tam={vertical ? 96 : 100} />
          <span style={{ fontFamily: fuente.titular, fontWeight: 800, fontSize: vertical ? 70 : 74, color: color.carbon }}>Leogin</span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── lo demás que trae ─────────────────────────────────────────────────────
const Ademas: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  const anchoTel = vertical ? 360 : 270;
  const paso = anchoTel + 36;
  const corre = f * (vertical ? 4.6 : 3.2);
  return (
    <AbsoluteFill style={{ background: color.carbon, opacity: av(f, 0, 6) }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 20% 0%, rgba(232,83,74,.3), transparent 60%)' }} />
      <div style={{ position: 'absolute', left: vertical ? 70 : 100, right: vertical ? 70 : undefined, width: vertical ? undefined : 1000, top: vertical ? 150 : 110 }}>
        <div style={{ fontFamily: fuente.titular, fontWeight: 800, fontSize: vertical ? 76 : 70, lineHeight: 1.1, color: '#fff', opacity: av(f, 2, 12) }}>
          Y en el mismo sistema, <span style={{ color: color.mango }}>todo esto:</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: vertical ? 20 : 18, marginTop: vertical ? 56 : 44 }}>
          {ADEMAS.map((t, i) => {
            const e = PULSO + i * 9;
            const fuerte = i % 4 === 0;
            return (
              <div key={t} style={{ fontFamily: fuente.texto, fontWeight: 700, fontSize: vertical ? 42 : 38, padding: vertical ? '20px 32px' : '16px 28px', borderRadius: 999, background: fuerte ? degradado : color.masa, color: fuerte ? '#fff' : color.carbon, scale: String(f < e ? 0 : salto(f, e, 8)) }}>
                {t}
              </div>
            );
          })}
        </div>
      </div>
      {/* una fila de pantallas reales que pasa */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: vertical ? 20 : -190, height: vertical ? 780 : 600, opacity: av(f, 8, 22) }}>
        {ADEMAS_PANTALLAS.map((id, i) => {
          const c = captura(id);
          const x = (vertical ? 120 : 760) - corre + i * paso;
          return (
            <div key={id} style={{ position: 'absolute', left: x, top: i % 2 ? 40 : 0, width: anchoTel, borderRadius: 34, overflow: 'hidden', border: '8px solid #0B0B0D', boxShadow: '0 30px 60px rgba(0,0,0,.5)', rotate: `${i % 2 ? 2 : -2}deg` }}>
              <Img src={staticFile(`otra-vez/capturas/${c.archivo}`)} style={{ width: '100%', display: 'block' }} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ── los dos domingos y el cierre ──────────────────────────────────────────
const Cierre: React.FC<{ guion: Guion; publico: Publico }> = ({ guion }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  const CORTE = 3 * PULSO + 6;
  const firma = av(f, CORTE, CORTE + 14);
  const hoy = captura('h1-hoy');
  const mitad: React.CSSProperties = vertical ? { left: 0, right: 0, height: '50%' } : { top: 0, bottom: 0, width: '50%' };
  const rotulo: React.CSSProperties = { position: 'absolute', left: vertical ? 60 : 70, top: vertical ? 60 : 70, fontFamily: fuente.titular, fontWeight: 800, fontSize: vertical ? 54 : 50, lineHeight: 1.1, zIndex: 5 };
  return (
    <AbsoluteFill style={{ background: color.carbon }}>
      {/* lado a lado */}
      <AbsoluteFill style={{ opacity: 1 - firma }}>
        <div style={{ position: 'absolute', ...mitad, ...(vertical ? { top: 0 } : { left: 0 }), overflow: 'hidden', translate: vertical ? `0px ${(av(f, 0, 10) - 1) * 100}%` : `${(av(f, 0, 10) - 1) * 100}% 0px` }}>
          <div style={{ position: 'absolute', left: '50%', top: '50%', width, height, translate: '-50% -50%', scale: '0.56', filter: 'saturate(.7)' }}>
            <Caos f={150 + Math.sin(f / 3) * 4} guion={{ ...guion, gancho: ['', ''] }} sinReloj />
          </div>
          <div style={{ ...rotulo, color: '#fff', textShadow: '0 4px 20px #000' }}>Domingo<br /><span style={{ color: color.brasa }}>sin Leogin</span></div>
        </div>
        <div style={{ position: 'absolute', ...mitad, ...(vertical ? { bottom: 0 } : { right: 0 }), background: color.masa, overflow: 'hidden', translate: vertical ? `0px ${(1 - av(f, 6, 16)) * 100}%` : `${(1 - av(f, 6, 16)) * 100}% 0px` }}>
          <div style={{ ...rotulo, color: color.carbon }}>Domingo<br /><span style={{ color: color.albahacaOscura }}>con Leogin</span></div>
          <div style={{ position: 'absolute', right: vertical ? 90 : 120, top: vertical ? 70 : 130, width: vertical ? 400 : 420, borderRadius: 44, overflow: 'hidden', border: '10px solid #0B0B0D', boxShadow: '0 30px 70px rgba(60,30,10,.35)', rotate: '3deg' }}>
            <Img src={staticFile(`otra-vez/capturas/${hoy.archivo}`)} style={{ width: '100%', display: 'block' }} />
          </div>
          <div style={{ position: 'absolute', left: vertical ? 60 : 70, bottom: vertical ? 90 : 110, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
            {['Pedidos completos', 'Caja cuadrada', 'Ventas a la vista'].map((t, i) => (
              <div key={t} style={{ fontFamily: fuente.texto, fontWeight: 700, fontSize: vertical ? 40 : 38, background: color.albahaca, color: '#fff', padding: '14px 26px', borderRadius: 999, scale: String(f < 14 + i * 7 ? 0 : salto(f, 14 + i * 7, 8)) }}>
                ✓ {t}
              </div>
            ))}
          </div>
        </div>
      </AbsoluteFill>
      {/* la firma */}
      <AbsoluteFill style={{ opacity: firma, alignItems: 'center', justifyContent: 'center', flexDirection: vertical ? 'column' : 'row', gap: vertical ? 70 : 120, padding: vertical ? 70 : 120 }}>
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 110%, rgba(245,160,48,.28), transparent 60%)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: vertical ? 'center' : 'flex-start', gap: vertical ? 46 : 38, zIndex: 1, maxWidth: vertical ? undefined : 1000 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 30, scale: String(salto(f, CORTE + 4, 12)), transformOrigin: vertical ? 'center' : 'left center' }}>
            <Leo tam={vertical ? 190 : 170} ojos="felices" brazo={90 * av(f, CORTE + 16, CORTE + 30) + Math.sin(f / 4) * 8} />
            <span style={{ fontFamily: fuente.titular, fontWeight: 800, fontSize: vertical ? 150 : 140, color: '#fff', letterSpacing: -3 }}>Leogin</span>
          </div>
          <div style={{ fontFamily: fuente.titular, fontWeight: 800, fontSize: vertical ? 74 : 70, lineHeight: 1.12, color: '#fff', textAlign: vertical ? 'center' : 'left', opacity: av(f, CORTE + 14, CORTE + 26), translate: `0px ${(1 - av(f, CORTE + 14, CORTE + 28)) * 40}px` }}>
            Tu próximo domingo <span style={{ color: color.mango }}>puede ser este.</span>
          </div>
          <div style={{ fontFamily: fuente.texto, fontWeight: 500, fontSize: vertical ? 40 : 38, color: '#D8D2C8', textAlign: vertical ? 'center' : 'left', opacity: av(f, CORTE + 30, CORTE + 42) }}>
            Empieza con lo que necesitas hoy. Crece cuando quieras.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26, zIndex: 1, opacity: av(f, CORTE + 36, CORTE + 48), scale: String(f < CORTE + 36 ? 0 : salto(f, CORTE + 36, 10)) }}>
          <div style={{ background: color.masa, padding: 26, borderRadius: 36 }}>
            <Img src={staticFile('otra-vez/qr.svg')} style={{ width: vertical ? 300 : 320, height: vertical ? 300 : 320, display: 'block' }} />
          </div>
          <div style={{ fontFamily: fuente.titular, fontWeight: 700, fontSize: vertical ? 50 : 46, color: '#fff', background: degradado, padding: '16px 40px', borderRadius: 999 }}>
            distleogin.com
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export type PropsOtraVez = { publico: Publico };

export const OtraVez: React.FC<PropsOtraVez> = ({ publico }) => {
  const guion = GUIONES[publico];
  return (
    <AbsoluteFill style={{ background: color.carbonHondo }}>
      <Audio src={staticFile('otra-vez/banda.wav')} />
      <Sequence durationInFrames={T.titulo + 14} name="Domingo sin Leogin">
        <Antes guion={guion} />
      </Sequence>
      <Sequence from={T.titulo} durationInFrames={T.pasos - T.titulo} name="El mismo domingo">
        <Titulo />
      </Sequence>
      <Sequence from={T.pasos} durationInFrames={T.ademas - T.pasos} name="Con Leogin">
        <Pasos guion={guion} />
      </Sequence>
      <Sequence from={T.ademas} durationInFrames={T.cierre - T.ademas} name="Además">
        <Ademas />
      </Sequence>
      <Sequence from={T.cierre} durationInFrames={T.fin - T.cierre} name="Cierre">
        <Cierre guion={guion} publico={publico} />
      </Sequence>
    </AbsoluteFill>
  );
};
