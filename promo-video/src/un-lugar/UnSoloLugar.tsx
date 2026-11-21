// «Un solo lugar» — qué es Leogin, en menos de un minuto.
//
//  0,0 s  tu restaurante vive en ocho lugares (entra uno por pulso)
//  5,4 s  «¿Y si viviera en uno solo?»: los ocho se meten en un teléfono
//  7,8 s  Leogin: todo tu restaurante, en un solo lugar
// 10,2 s  tres tipos de negocio, con las pantallas reales
// 31,8 s  y todo llega a lo mismo: cocina, caja y tus ventas
// 42,6 s  lo demás que trae
// 47,4 s  cierre
import React from 'react';
import { AbsoluteFill, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Audio } from '@remotion/media';
import { color, degradado, fuente } from '../marca';
import { Leo } from '../componentes/Leo';
import { Nombre } from '../componentes/Marca';
import { av, azar, salto } from '../otra-vez/base';
import { Ademas, Logo } from '../otra-vez/OtraVez';
import { Aparato, seguir } from '../otra-vez/Pasos';
import { BLOQUE, BLOQUES, CENTRO, CENTROS, LUGARES, U, type Bloque, type Lugar } from './guion';

const ENTRA = (i: number) => i * 18;

// ── los dibujos de cada lugar ─────────────────────────────────────────────
const Dibujo: React.FC<{ tipo: Lugar['dibujo']; tam: number }> = ({ tipo, tam }) => {
  const t = color.tinta;
  const linea = { stroke: t, strokeWidth: 4, strokeLinecap: 'round' as const, fill: 'none' };
  return (
    <svg width={tam} height={tam} viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
      {tipo === 'libreta' ? (
        <>
          <rect x="20" y="14" width="60" height="76" rx="6" fill="#F4EBD3" stroke={t} strokeWidth="4" />
          {[24, 34, 44, 54, 64, 74].map((x) => <path key={x} d={`M${x} 8 v12`} {...linea} />)}
          <path d="M30 38 h40 M30 52 h34 M30 66 h38 M30 78 h20" {...linea} strokeWidth={3} />
        </>
      ) : null}
      {tipo === 'chats' ? (
        <>
          <path d="M10 16 h52 a8 8 0 0 1 8 8 v22 a8 8 0 0 1 -8 8 H30 L16 66 V54 h-6 a8 8 0 0 1 -8 -8 V24 a8 8 0 0 1 8 -8 Z" transform="translate(4 0)" fill="#D7F5C6" stroke={t} strokeWidth="4" strokeLinejoin="round" />
          <path d="M46 48 h40 a8 8 0 0 1 8 8 v18 a8 8 0 0 1 -8 8 h-4 v10 L70 82 H46 a8 8 0 0 1 -8 -8 V56 a8 8 0 0 1 8 -8 Z" fill="#fff" stroke={t} strokeWidth="4" strokeLinejoin="round" />
          <circle cx="86" cy="46" r="11" fill={color.brasa} />
          <text x="86" y="51" textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff" fontFamily={fuente.texto}>47</text>
        </>
      ) : null}
      {tipo === 'calculadora' ? (
        <>
          <rect x="22" y="10" width="56" height="80" rx="8" fill="#3A3A40" stroke={t} strokeWidth="4" />
          <rect x="30" y="18" width="40" height="18" rx="3" fill="#CFE3C4" />
          {[0, 1, 2].map((f) => [0, 1, 2].map((c) => <rect key={`${f}${c}`} x={30 + c * 14.5} y={44 + f * 14} width="11" height="10" rx="2" fill={f === 2 && c === 2 ? color.mango : '#E9E4DC'} />))}
        </>
      ) : null}
      {tipo === 'caja' ? (
        <>
          <rect x="14" y="16" width="72" height="70" rx="5" fill="#2E5E86" stroke={t} strokeWidth="4" />
          <rect x="26" y="28" width="48" height="26" rx="3" fill="#fff" />
          <text x="50" y="48" textAnchor="middle" fontSize="18" fontWeight="700" fill={t} fontFamily={fuente.cifras}>CAJA</text>
          <path d="M22 16 v70" stroke="#1E4262" strokeWidth="5" />
        </>
      ) : null}
      {tipo === 'menu' ? (
        <>
          <path d="M14 14 h36 v74 H14 Z" fill="#fff" stroke={t} strokeWidth="4" strokeLinejoin="round" />
          <path d="M50 14 l36 6 v74 l-36 -6 Z" fill="#F4EBD3" stroke={t} strokeWidth="4" strokeLinejoin="round" />
          <text x="32" y="32" textAnchor="middle" fontSize="11" fontWeight="700" fill={color.brasa} fontFamily={fuente.texto}>MENÚ</text>
          <path d="M20 44 h24 M20 54 h24 M20 64 h18 M20 74 h22 M58 40 l20 3 M58 52 l20 3 M58 64 l14 2" {...linea} strokeWidth={3} />
        </>
      ) : null}
      {tipo === 'hoja' ? (
        <>
          <rect x="12" y="16" width="76" height="68" rx="5" fill="#fff" stroke={t} strokeWidth="4" />
          <rect x="12" y="16" width="76" height="16" rx="5" fill={color.albahaca} stroke={t} strokeWidth="4" />
          <path d="M12 46 h76 M12 58 h76 M12 70 h76 M36 32 v52 M62 32 v52" stroke={t} strokeWidth="2.5" />
        </>
      ) : null}
      {tipo === 'agenda' ? (
        <>
          <rect x="14" y="18" width="72" height="70" rx="8" fill="#fff" stroke={t} strokeWidth="4" />
          <path d="M14 38 h72" stroke={t} strokeWidth="4" />
          <rect x="16" y="20" width="68" height="17" rx="6" fill={color.brasa} />
          <path d="M32 10 v16 M68 10 v16" {...linea} strokeWidth={5} />
          {[0, 1, 2].map((f) => [0, 1, 2, 3].map((c) => <rect key={`${f}${c}`} x={23 + c * 15} y={46 + f * 13} width="9" height="8" rx="2" fill={f === 1 && c === 2 ? color.mango : '#D9CFC2'} />))}
        </>
      ) : null}
      {tipo === 'memoria' ? (
        <>
          <path d="M30 70 a22 22 0 0 1 -6 -42 a26 26 0 0 1 48 -4 a20 20 0 0 1 4 40 a18 18 0 0 1 -26 6 a16 16 0 0 1 -20 0 Z" fill="#fff" stroke={t} strokeWidth="4" strokeLinejoin="round" />
          <circle cx="24" cy="84" r="6" fill="#fff" stroke={t} strokeWidth="4" />
          <circle cx="12" cy="94" r="3.5" fill="#fff" stroke={t} strokeWidth="3" />
          <text x="51" y="58" textAnchor="middle" fontSize="38" fontWeight="800" fill={color.brasa} fontFamily={fuente.titular}>?</text>
        </>
      ) : null}
    </svg>
  );
};

// ── ocho lugares, y luego uno solo ────────────────────────────────────────
const Lugares: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  const tarjeta = vertical ? { w: 450, h: 270 } : { w: 240, h: 380 };
  const sitio = (i: number) =>
    vertical
      ? { x: 70 + (i % 2) * 490, y: 560 + Math.floor(i / 2) * 300 }
      : { x: 850 + (i % 4) * 258, y: 130 + Math.floor(i / 4) * 430 };
  const centro = vertical ? { x: 540, y: 1150 } : { x: 1370, y: 540 };
  const cuenta = LUGARES.filter((_, i) => f >= ENTRA(i)).length;
  const juntando = f >= U.junta;
  const sale = av(f, U.junta, U.junta + 8);
  const tel = vertical ? 300 : 260;
  // el teléfono late cada vez que traga un lugar
  const tragados = LUGARES.filter((_, i) => f >= U.junta + 26 + i * 3).length;
  const latido = juntando ? 1 + 0.05 * Math.max(0, 1 - ((f - U.junta - 26) % 3) / 3) * (tragados < 8 && tragados > 0 ? 1 : 0) : 1;
  return (
    <AbsoluteFill style={{ background: color.carbonHondo, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, transparent 30%, rgba(232,60,50,${(0.08 + 0.3 * av(f, 0, 150, (n) => n)) * (1 - av(f, U.junta, U.junta + 30))}) 120%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${centro.x}px ${centro.y}px, rgba(245,160,48,${0.34 * av(f, U.junta + 10, U.junta + 50)}), transparent 45%)` }} />

      {/* el gancho */}
      <div style={{ position: 'absolute', left: vertical ? 70 : 100, right: vertical ? 70 : undefined, width: vertical ? undefined : 700, top: vertical ? 130 : 200, opacity: 1 - sale, translate: `0px ${-sale * 40}px` }}>
        <div style={{ fontFamily: fuente.titular, fontWeight: 800, fontSize: vertical ? 62 : 60, lineHeight: 1.1, color: '#fff' }}>Hoy tu restaurante<br />vive en</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 24, marginTop: 6 }}>
          <span key={cuenta} style={{ fontFamily: fuente.titular, fontWeight: 800, fontSize: vertical ? 190 : 210, lineHeight: 1, color: color.mango, scale: String(0.86 + 0.14 * salto(f, ENTRA(cuenta - 1), 7)), transformOrigin: 'left bottom', fontVariantNumeric: 'tabular-nums' }}>{cuenta}</span>
          <span style={{ fontFamily: fuente.titular, fontWeight: 800, fontSize: vertical ? 78 : 80, color: '#fff' }}>{cuenta === 1 ? 'lugar' : 'lugares'}</span>
        </div>
        <div style={{ fontFamily: fuente.texto, fontWeight: 600, fontSize: vertical ? 44 : 44, color: color.brasa, marginTop: vertical ? 14 : 30, opacity: av(f, 136, 146) }}>Y ninguno se habla con otro.</div>
      </div>

      {/* la pregunta */}
      {juntando ? (
        <div style={{ position: 'absolute', left: vertical ? 70 : 100, right: vertical ? 70 : undefined, width: vertical ? undefined : 700, top: vertical ? 200 : 330, fontFamily: fuente.titular, fontWeight: 800, fontSize: vertical ? 88 : 86, lineHeight: 1.1, color: '#fff', opacity: av(f, U.junta + 6, U.junta + 16), translate: `0px ${(1 - av(f, U.junta + 6, U.junta + 20)) * 40}px` }}>
          ¿Y si viviera <span style={{ color: color.mango }}>en uno solo?</span>
        </div>
      ) : null}

      {/* los lugares */}
      {LUGARES.map((l, i) => {
        if (f < ENTRA(i)) return null;
        const s = sitio(i);
        const va = av(f, U.junta + 14 + i * 3, U.junta + 34 + i * 3, (n) => n * n * n);
        const cx = s.x + tarjeta.w / 2;
        const cy = s.y + tarjeta.h / 2;
        const giro = (azar(i, 3) - 0.5) * 9;
        // sin sistema, cada lugar tiembla por su cuenta
        const tiembla = (1 - va) * av(f, 60, 160, (n) => n) * 5;
        const x = cx + (centro.x - cx) * va + Math.sin(f * 1.3 + i * 2) * tiembla;
        const y = cy + (centro.y - cy) * va + Math.cos(f * 1.7 + i) * tiembla;
        return (
          <div key={l.nombre} style={{ position: 'absolute', left: x, top: y, width: tarjeta.w, height: tarjeta.h, margin: `${-tarjeta.h / 2}px 0 0 ${-tarjeta.w / 2}px`, rotate: `${giro * (1 - va) + va * 140}deg`, scale: String((i === 0 && f < 9 ? 1 : salto(f, ENTRA(i), 8)) * (1 - va * 0.92)), opacity: 1 - av(f, U.junta + 30 + i * 3, U.junta + 35 + i * 3), background: color.papel, borderRadius: 26, boxShadow: '0 18px 44px rgba(0,0,0,.5)', display: 'flex', flexDirection: vertical ? 'row' : 'column', alignItems: 'center', justifyContent: vertical ? 'flex-start' : 'center', gap: vertical ? 22 : 26, padding: vertical ? '0 30px' : '0 22px', boxSizing: 'border-box', zIndex: 10 + i }}>
            <Dibujo tipo={l.dibujo} tam={vertical ? 150 : 170} />
            <div style={{ fontFamily: fuente.texto, fontWeight: 700, fontSize: vertical ? 40 : 34, lineHeight: 1.12, color: color.tinta, textAlign: vertical ? 'left' : 'center' }}>{l.nombre}</div>
          </div>
        );
      })}

      {/* el teléfono que se los queda */}
      {juntando ? (
        <div style={{ position: 'absolute', left: centro.x, top: centro.y, width: tel, height: tel * 2, margin: `${-tel}px 0 0 ${-tel / 2}px`, borderRadius: 52, background: '#0B0B0D', boxShadow: `0 0 0 3px #2A2A2E inset, 0 0 ${90 * av(f, U.junta + 20, U.junta + 60)}px rgba(245,160,48,.55), 0 40px 90px rgba(0,0,0,.6)`, display: 'flex', alignItems: 'center', justifyContent: 'center', scale: String(salto(f, U.junta + 4, 12) * latido), zIndex: 5 }}>
          <div style={{ position: 'absolute', inset: 14, borderRadius: 40, background: color.masa }} />
          <div style={{ position: 'relative', scale: String(salto(f, U.junta + 12, 10)) }}>
            <Logo tam={tel * 0.46} />
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ── Leogin ────────────────────────────────────────────────────────────────
const Titulo: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  const centro = vertical ? { x: 540, y: 1150 } : { x: 1370, y: 540 };
  const sale = av(f, 64, 72);
  return (
    <AbsoluteFill style={{ background: color.masa, clipPath: `circle(${av(f, 0, 16) * 150}% at ${centro.x}px ${centro.y}px)` }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 14, background: degradado }} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: vertical ? 50 : 40, padding: vertical ? 70 : 160, opacity: 1 - sale, translate: `0px ${-sale * 60}px` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 34, scale: String(salto(f, 4, 12)) }}>
          <Logo tam={vertical ? 150 : 150} />
          <Nombre letra={vertical ? 150 : 160} color={color.carbon} />
        </div>
        <div style={{ fontFamily: fuente.titular, fontWeight: 800, fontSize: vertical ? 74 : 78, lineHeight: 1.12, color: color.carbon, textAlign: 'center', opacity: av(f, 16, 28), translate: `0px ${(1 - av(f, 16, 30)) * 40}px` }}>
          Todo tu restaurante, <span style={{ color: color.brasa }}>en un solo lugar.</span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── un tramo con pantallas reales ─────────────────────────────────────────
const Tramo: React.FC<{ bloque: Bloque; numero: number; dur: number }> = ({ bloque, numero, dur }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  const { paso } = bloque;
  const tel = paso.aparato === 'telefono';
  const llega = av(f, 0, 16);
  const sale = av(f, dur - 6, dur);
  const ancho = vertical ? (tel ? 610 : 980) : tel ? 540 : 1000;
  const arriba = vertical ? (tel ? 600 : 780) : tel ? 56 : 180;
  const sube = tel ? seguir(paso, ancho, height - arriba - 30, f, dur) : 0;
  const sitio: React.CSSProperties = vertical
    ? { left: '50%', top: arriba, translate: `-50% ${(1 - llega) * 260 - sale * 80 - sube}px` }
    : { right: tel ? 200 : 70, top: arriba, translate: `${(1 - llega) * 260 + sale * 80}px ${-sube}px` };
  const total = BLOQUES.length + CENTROS.length;
  return (
    <AbsoluteFill style={{ opacity: 1 - sale }}>
      <div style={{ position: 'absolute', left: vertical ? 70 : 100, top: vertical ? 120 : 130, fontFamily: fuente.texto, fontWeight: 700, fontSize: vertical ? 42 : 40, color: '#fff', background: numero < BLOQUES.length ? degradado : color.albahacaOscura, padding: vertical ? '16px 34px' : '14px 30px', borderRadius: 999, scale: String(salto(f, 0, 9)), transformOrigin: 'left center' }}>
        {bloque.etiqueta}
      </div>
      <div style={{ position: 'absolute', right: vertical ? 70 : undefined, left: vertical ? undefined : 100, top: vertical ? 152 : undefined, bottom: vertical ? undefined : 110, display: 'flex', gap: 10 }}>
        {Array.from({ length: total }, (_, i) => (
          <div key={i} style={{ width: i === numero ? 52 : 18, height: 12, borderRadius: 6, background: i <= numero ? color.brasa : '#D9CFC2' }} />
        ))}
      </div>
      <div style={{ position: 'absolute', ...(vertical ? { left: 70, right: 70, top: 250 } : { left: 100, width: tel ? 960 : 670, top: tel ? 300 : 280 }) }}>
        <div style={{ fontFamily: fuente.titular, fontWeight: 800, fontSize: vertical ? 70 : tel ? 78 : 64, lineHeight: 1.08, color: color.carbon, opacity: av(f, 2, 12), translate: `0px ${(1 - av(f, 2, 14)) * 40}px` }}>{paso.titulo}</div>
        <div style={{ fontFamily: fuente.texto, fontWeight: 500, fontSize: 40, lineHeight: 1.25, color: '#5B524A', marginTop: 22, opacity: av(f, 12, 24), translate: `0px ${(1 - av(f, 12, 26)) * 30}px` }}>{paso.detalle}</div>
      </div>
      <div style={{ position: 'absolute', ...sitio, opacity: llega, scale: String(0.94 + 0.06 * salto(f, 0, 16)) }}>
        <Aparato paso={paso} ancho={ancho} dur={dur} />
      </div>
    </AbsoluteFill>
  );
};

const Tramos: React.FC = () => (
  <AbsoluteFill style={{ background: color.masa }}>
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 80% 100%, rgba(245,160,48,.22), transparent 60%)' }} />
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 14, background: degradado }} />
    {BLOQUES.map((b, i) => (
      <Sequence key={b.etiqueta} from={i * BLOQUE} durationInFrames={BLOQUE} name={b.etiqueta}>
        <Tramo bloque={b} numero={i} dur={BLOQUE} />
      </Sequence>
    ))}
    {CENTROS.map((b, i) => (
      <Sequence key={b.etiqueta} from={U.centro - U.bloques + i * CENTRO} durationInFrames={CENTRO} name={b.etiqueta}>
        <Tramo bloque={b} numero={BLOQUES.length + i} dur={CENTRO} />
      </Sequence>
    ))}
  </AbsoluteFill>
);

// ── cierre ────────────────────────────────────────────────────────────────
const Cierre: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  const tacha = av(f, 16, 28);
  return (
    <AbsoluteFill style={{ background: color.carbon, opacity: av(f, 0, 8), alignItems: 'center', justifyContent: 'center', flexDirection: vertical ? 'column' : 'row', gap: vertical ? 70 : 120, padding: vertical ? 70 : 120 }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 110%, rgba(245,160,48,.28), transparent 60%)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: vertical ? 'center' : 'flex-start', gap: vertical ? 44 : 36, zIndex: 1, maxWidth: vertical ? undefined : 1000 }}>
        {/* de ocho lugares a uno */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, fontFamily: fuente.texto, fontWeight: 700, fontSize: vertical ? 44 : 40, opacity: av(f, 6, 16) }}>
          <span style={{ position: 'relative', color: '#8E877E' }}>
            8 lugares
            <span style={{ position: 'absolute', left: -6, top: '52%', height: 5, borderRadius: 3, background: color.brasa, width: `calc(${tacha * 100}% + ${tacha * 12}px)` }} />
          </span>
          <span style={{ color: '#fff', background: color.albahacaOscura, padding: '8px 24px', borderRadius: 999, scale: String(f < 28 ? 0 : salto(f, 28, 9)) }}>1 solo</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 30, scale: String(salto(f, 6, 12)), transformOrigin: vertical ? 'center' : 'left center' }}>
          <Leo tam={vertical ? 190 : 170} ojos="felices" brazo={90 * av(f, 30, 44) + Math.sin(f / 4) * 8} />
          <Nombre letra={vertical ? 150 : 140} color="#fff" />
        </div>
        <div style={{ fontFamily: fuente.titular, fontWeight: 800, fontSize: vertical ? 74 : 70, lineHeight: 1.12, color: '#fff', textAlign: vertical ? 'center' : 'left', opacity: av(f, 20, 32), translate: `0px ${(1 - av(f, 20, 34)) * 40}px` }}>
          Todo tu restaurante, <span style={{ color: color.mango }}>en un solo lugar.</span>
        </div>
        <div style={{ fontFamily: fuente.texto, fontWeight: 500, fontSize: vertical ? 40 : 38, color: '#D8D2C8', textAlign: vertical ? 'center' : 'left', opacity: av(f, 36, 48) }}>
          Empieza con lo que necesitas hoy. Crece cuando quieras.
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26, zIndex: 1, opacity: av(f, 42, 54), scale: String(f < 42 ? 0 : salto(f, 42, 10)) }}>
        <div style={{ background: color.masa, padding: 26, borderRadius: 36 }}>
          <Img src={staticFile('otra-vez/qr.svg')} style={{ width: vertical ? 300 : 320, height: vertical ? 300 : 320, display: 'block' }} />
        </div>
        <div style={{ fontFamily: fuente.titular, fontWeight: 700, fontSize: vertical ? 50 : 46, color: '#fff', background: degradado, padding: '16px 40px', borderRadius: 999 }}>distleogin.com</div>
      </div>
    </AbsoluteFill>
  );
};

export const UnSoloLugar: React.FC = () => (
  <AbsoluteFill style={{ background: color.carbonHondo }}>
    <Audio src={staticFile('otra-vez/banda-un-lugar.wav')} />
    <Sequence durationInFrames={U.titulo + 16} name="Ocho lugares">
      <Lugares />
    </Sequence>
    <Sequence from={U.titulo} durationInFrames={U.bloques - U.titulo} name="Leogin">
      <Titulo />
    </Sequence>
    <Sequence from={U.bloques} durationInFrames={U.ademas - U.bloques} name="Pantallas reales">
      <Tramos />
    </Sequence>
    <Sequence from={U.ademas} durationInFrames={U.cierre - U.ademas} name="Además">
      <Ademas />
    </Sequence>
    <Sequence from={U.cierre} durationInFrames={U.fin - U.cierre} name="Cierre">
      <Cierre />
    </Sequence>
  </AbsoluteFill>
);
