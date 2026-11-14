// 25–30 s: antes vs. con Leogin (ilustrativo) · 35–40 s: promesa, oferta y un solo CTA.
import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { FondoLeogin, FondoPapel } from '../componentes/Fondo';
import { Leo, Logo } from '../componentes/Leo';
import { Titular } from '../componentes/Titular';
import { mano, temblor, useCuadro, Tachon } from '../componentes/Antes';
import { color, fuente } from '../marca';
import type { PropsVideo } from '../datos';

const FILAS = [
  { antes: 'Pedidos en 3 chats y un cuaderno', despues: 'Todos en una lista que suena' },
  { antes: 'La caja: «¿por qué faltan Q120?»', despues: 'La caja cuadra, al centavo' },
  { antes: 'Comandas a gritos', despues: 'En pantalla, con su nota' },
];

export const AntesDespues: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = useCuadro(3);
  return (
    <AbsoluteFill>
      {/* arriba: antes */}
      <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: 900, overflow: 'hidden' }}>
        <FondoPapel />
        <div style={{ position: 'absolute', left: 80, top: 180, fontFamily: fuente.titular, fontWeight: 800, fontSize: 84, color: color.tinta }}>Antes</div>
        {FILAS.map((f, n) => {
          const t = temblor(`a${n}`, c, 1);
          const tachar = 52 + n * 22;
          return (
            <div key={f.antes} style={{
              position: 'absolute', left: 80, top: 330 + n * 165, fontFamily: mano, fontWeight: 700, fontSize: 70, color: '#3B342E',
              opacity: c >= n * 8 ? 1 : 0, transform: `translate(${t.x}px, ${t.y}px) rotate(${t.r - 1}deg)`,
            }}>
              {f.antes}
              <Tachon desde={tachar} ancho={Math.min(900, f.antes.length * 30)} style={{ left: 0, top: 30 }} />
            </div>
          );
        })}
      </div>
      {/* abajo: con Leogin */}
      <div style={{ position: 'absolute', left: 0, top: 900, right: 0, bottom: 0, overflow: 'hidden' }}>
        <FondoLeogin />
        <div style={{ position: 'absolute', left: 80, top: 70, fontFamily: fuente.titular, fontWeight: 800, fontSize: 84, color: '#fff' }}>
          Con <span style={{ background: `linear-gradient(120deg, ${color.brasa}, ${color.mango})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Leogin</span>
        </div>
        {FILAS.map((f, n) => {
          const s = spring({ frame: frame - (52 + n * 22), fps, config: { damping: 16 } });
          return (
            <div key={f.despues} style={{
              position: 'absolute', left: 80, right: 80, top: 230 + n * 150, display: 'flex', alignItems: 'center', gap: 28,
              opacity: s, transform: `translateX(${(1 - s) * 120}px)`,
            }}>
              <svg width="70" height="70" viewBox="0 0 24 24" style={{ flex: 'none' }}>
                <circle cx="12" cy="12" r="11" fill={color.albahaca} />
                <path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div style={{ fontFamily: fuente.texto, fontWeight: 700, fontSize: 56, color: '#fff', lineHeight: 1.1 }}>{f.despues}</div>
            </div>
          );
        })}
        <div style={{ position: 'absolute', left: 80, bottom: 380, fontFamily: fuente.texto, fontSize: 30, color: 'rgba(255,255,255,.55)' }}>
          Ejemplo ilustrativo
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Cierre: React.FC<Pick<PropsVideo, 'promesa' | 'oferta' | 'cta' | 'ctaAntes'>> = ({ promesa, oferta, cta, ctaAntes }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const leo = spring({ frame, fps, config: { damping: 10, mass: 0.7 } });
  const saludo = Math.sin(frame * 0.35) * 22 + 100;
  const oferta1 = spring({ frame: frame - 40, fps, config: { damping: 14 } });
  const cta1 = spring({ frame: frame - 58, fps, config: { damping: 12 } });
  const subrayado = interpolate(frame, [70, 92], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const flota = Math.sin(frame / 9) * 8;
  return (
    <AbsoluteFill>
      <FondoLeogin brillo={1.5} />
      <div style={{ position: 'absolute', left: 540 - 170, top: 210 + flota, transform: `scale(${leo})`, transformOrigin: '50% 100%' }}>
        <Leo tam={340} brazo={frame < 70 ? saludo : 0} ojos={frame >= 96 && frame < 106 ? 'guino' : 'abiertos'} mirada={{ x: 0.6, y: 0.4 }} />
      </div>
      <Titular texto={promesa.replace(/bajo control\.?/, '*bajo control.*')} desde={6} tam={90} top={640} />
      <div style={{
        position: 'absolute', left: 80, top: 890, padding: '18px 34px', borderRadius: 999, background: color.albahacaOscura,
        fontFamily: fuente.texto, fontWeight: 700, fontSize: 46, color: '#fff', opacity: oferta1, transform: `scale(${0.8 + 0.2 * oferta1})`, transformOrigin: 'left center',
      }}>{oferta}</div>
      <div style={{ position: 'absolute', left: 80, right: 80, top: 1040, opacity: cta1, transform: `translateY(${(1 - cta1) * 50}px)` }}>
        <div style={{ fontFamily: fuente.texto, fontWeight: 600, fontSize: 48, color: 'rgba(255,255,255,.8)' }}>{ctaAntes}</div>
        <div style={{ fontFamily: fuente.titular, fontWeight: 800, fontSize: 94, color: '#fff', letterSpacing: '-0.02em', marginTop: 6 }}>{cta}</div>
        <div style={{ height: 14, width: `${subrayado * 100}%`, borderRadius: 7, marginTop: 10, background: `linear-gradient(90deg, ${color.brasa}, ${color.mango})` }} />
      </div>
      <div style={{ position: 'absolute', left: 80, top: 1340, display: 'flex', alignItems: 'center', gap: 22, opacity: cta1 }}>
        <Logo tam={76} />
        <div style={{ fontFamily: fuente.titular, fontWeight: 800, fontSize: 52, color: '#fff' }}>Leogin</div>
      </div>
    </AbsoluteFill>
  );
};
