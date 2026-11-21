// Segundos 29–34: la chispa se vuelve el logo y llega la oferta, con un QR
// que lleva al registro (sirve en la visita al restaurante y al pausar).
import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import QRCode from 'qrcode';
import { clamp, degradado, easeOut, lerp, marca, pop, prog, useFormato } from './base';
import { LogoMarca } from './mundo';
import { Nombre } from '../componentes/Marca';
import { useGuion } from './guion';
import { fuente } from '../marca';


const Qr: React.FC<{ texto: string; tam: number }> = ({ texto, tam }) => {
  const m = useMemo(() => QRCode.create(texto, { errorCorrectionLevel: 'M' }).modules, [texto]);
  const n = m.size;
  const rects: React.ReactNode[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m.data[y * n + x]) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.04} height={1.04} />);
  return (
    <svg width={tam} height={tam} viewBox={`-2 -2 ${n + 4} ${n + 4}`} shapeRendering="crispEdges">
      <rect x={-2} y={-2} width={n + 4} height={n + 4} fill="#fff" />
      <g fill={marca.carbon}>{rects}</g>
    </svg>
  );
};

const sube = (f: number, en: number) => {
  const t = easeOut(prog(f, en, en + 12));
  return { opacity: t, transform: `translateY(${(1 - t) * 40}px)`, filter: `blur(${(1 - t) * 8}px)` } as React.CSSProperties;
};

export const Cierre: React.FC = () => {
  const f = useCurrentFrame();
  const { T, cierre } = useGuion();
  const { oferta, ofertaAcento, detalle, url, qr } = cierre;
  const { vertical } = useFormato();
  const c = T.cierre;
  // El logo entra gigante (viene del zoom de la toma) y se asienta
  const asienta = easeOut(prog(f, c.inicio, c.inicio + 20));
  const logoTam = vertical ? 180 : 150;
  const escala = lerp(9, 1, asienta);
  const brillo = 1 - prog(f, c.inicio, c.inicio + 30);
  const qrIn = pop(prog(f, c.qr, c.qr + 14));
  const latido = 1 + 0.025 * Math.sin((f - c.qr) / 5) * clamp((f - c.qr - 14) / 10);
  const acento: React.CSSProperties = { background: degradado, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' };
  // En vertical el precio va en los renglones que diga el guion.
  const partes = vertical ? ofertaAcento : [ofertaAcento.join(' ')];

  const marcaBloque = (
    <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center', gap: vertical ? 22 : 30 }}>
      <div style={{ width: logoTam, height: logoTam, transform: `scale(${escala})`, filter: 'drop-shadow(0 20px 50px rgba(232,83,74,.45))', position: 'relative', zIndex: 2 }}>
        <LogoMarca tam={logoTam} />
      </div>
      <div style={{ ...sube(f, c.inicio + 8) }}><Nombre letra={vertical ? 88 : 96} color="#fff" /></div>
    </div>
  );
  const ofertaBloque = (
    <div style={{ fontFamily: fuente.titular, fontWeight: 800, color: '#fff', lineHeight: 1.02, letterSpacing: -3, textAlign: vertical ? 'center' : 'left' }}>
      <div style={{ whiteSpace: 'nowrap', fontSize: vertical ? (oferta.length > 16 ? 66 : 84) : 72, ...sube(f, c.oferta) }}>{oferta}</div>
      {partes.map((p, i) => (
        <div key={p} style={{ whiteSpace: 'nowrap', fontSize: vertical ? 124 : Math.min(92, 1650 / p.length), ...sube(f, c.oferta + 5 + i * 4) }}><span style={acento}>{p}</span></div>
      ))}
      <div style={{ fontFamily: fuente.texto, fontWeight: 500, fontSize: vertical ? 40 : 38, color: 'rgba(255,255,255,.75)', letterSpacing: -0.3, marginTop: 20, ...sube(f, c.oferta + 14) }}>{detalle}</div>
    </div>
  );
  const urlBloque = (
    <div style={{ ...sube(f, c.url) }}>
      <div style={{ height: vertical ? 100 : 92, padding: '0 46px', borderRadius: 99, background: degradado, color: '#fff', display: 'inline-flex', alignItems: 'center', fontFamily: fuente.titular, fontWeight: 800, fontSize: vertical ? 48 : 44, letterSpacing: -1, boxShadow: '0 18px 50px rgba(232,83,74,.45)', transform: `scale(${latido})` }}>{url}</div>
    </div>
  );
  const qrBloque = (
    <div style={{ transform: `scale(${qrIn}) rotate(${lerp(-8, vertical ? 0 : 2, qrIn)}deg)`, opacity: qrIn > 0 ? 1 : 0 }}>
      <div style={{ background: '#fff', borderRadius: 30, padding: vertical ? 20 : 28, boxShadow: '0 30px 80px rgba(0,0,0,.5)', textAlign: 'center' }}>
        <Qr texto={qr} tam={vertical ? 270 : 360} />
        <div style={{ fontFamily: fuente.texto, fontWeight: 700, fontSize: vertical ? 26 : 30, color: marca.carbon, marginTop: 8 }}>Escanea y empieza</div>
      </div>
    </div>
  );

  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at ${vertical ? '50% 30%' : '30% 40%'}, #2A1A16 0%, ${marca.noche} 65%)` }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${vertical ? '50% 18%' : '18% 22%'}, rgba(245,160,48,${0.55 * brillo}) 0%, transparent ${30 + 40 * brillo}%)` }} />
      {vertical ? (
        <AbsoluteFill style={{ flexDirection: 'column', alignItems: 'center', paddingTop: 190, gap: 64 }}>
          {marcaBloque}
          {ofertaBloque}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 44 }}>{urlBloque}{qrBloque}</div>
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '0 150px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 52 }}>{marcaBloque}{ofertaBloque}{urlBloque}</div>
          {qrBloque}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
