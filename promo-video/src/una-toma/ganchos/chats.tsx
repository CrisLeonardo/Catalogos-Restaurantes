// Gancho del video «a domicilio»: el teléfono no para de sonar con
// mensajes de clientes. App de chat genérica (sin marca de nadie).
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { clamp, easeOut, prog, useFormato } from '../base';
import { fuente } from '../../marca';

export const MENSAJES: { en: number; quien: string; texto: string }[] = [
  { en: -30, quien: 'Andrea', texto: '¿Hay pollo hoy?' },
  { en: -18, quien: '+502 5512 3344', texto: '¿Cuánto es el envío a zona 10?' },
  { en: -6, quien: 'Carlos', texto: 'Me pasás el menú porfa' },
  { en: 8, quien: 'Sofía', texto: '¿Ya viene mi pedido?' },
  { en: 31, quien: '+502 4021 8870', texto: 'Hola???' },
  { en: 40, quien: 'Don Julio', texto: '¿A qué hora cierran?' },
  { en: 49, quien: 'Andrea', texto: '¿Hola? ¿Sí hay pollo?' },
  { en: 58, quien: 'Mariela', texto: 'Quiero 2 pizzas pero una sin…' },
  { en: 67, quien: 'Sofía', texto: 'Ya pasó una hora…' },
  { en: 76, quien: '+502 3307 1192', texto: '¿Aceptan transferencia?' },
];

const ALTO = 132;

export const EscenaChats: React.FC = () => {
  const f = useCurrentFrame();
  const { vertical, W } = useFormato();
  const llegados = MENSAJES.filter((m) => f >= m.en);
  const sinLeer = 12 + llegados.length * 4 + Math.floor(clamp((f - 70) / 20) * 3);
  const ancho = vertical ? W - 80 : 860;
  const x0 = vertical ? 40 : W - ancho - 120;
  const y0 = vertical ? 470 : 120;
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(160deg, #20313A 0%, #121A20 55%, #0B0F12 100%)' }}>
      {/* contador de no leídos */}
      <div style={{ position: 'absolute', left: x0, top: vertical ? 1700 : 880, display: 'flex', alignItems: 'center', gap: 16, fontFamily: fuente.texto, color: '#fff' }}>
        <div style={{ height: 64, minWidth: 64, padding: '0 18px', borderRadius: 99, background: '#E8423A', fontSize: 36, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${1 + 0.12 * Math.max(0, 1 - ((f - (llegados[llegados.length - 1]?.en ?? 0)) / 6))})` }}>{sinLeer}</div>
        <div style={{ fontSize: 34, fontWeight: 600, opacity: 0.8 }}>mensajes sin leer</div>
      </div>
      {/* notificaciones apiladas, la más nueva arriba */}
      {llegados.map((m) => {
        const idx = llegados.length - 1 - llegados.indexOf(m);
        const entra = easeOut(prog(f, m.en, m.en + 7));
        const y = y0 + idx * (ALTO + 14) - (1 - entra) * 60;
        if (idx > (vertical ? 7 : 4)) return null;
        return (
          <div key={m.en} style={{ position: 'absolute', left: x0, top: y, width: ancho, height: ALTO, borderRadius: 30, background: '#2B3237', border: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', gap: 22, padding: '0 28px', opacity: entra * (1 - idx * 0.06), boxShadow: '0 14px 30px rgba(0,0,0,.35)', fontFamily: fuente.texto, color: '#fff' }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: '#5B6770', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round"><path d="M4 5h16v11H9l-5 4z" /></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 28, fontWeight: 700 }}><span>{m.quien}</span><span style={{ fontSize: 22, fontWeight: 500, opacity: 0.6 }}>ahora</span></div>
              <div style={{ fontSize: 30, opacity: 0.9, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.texto}</div>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
