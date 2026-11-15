// «Una sola toma»: un pedido cruza todo el restaurante sin un solo corte.
// Mismo video en vertical (TikTok, Reels, Shorts) y horizontal (PC, visita).
import React from 'react';
import { AbsoluteFill, staticFile, useCurrentFrame } from 'remotion';
import { Audio } from '@remotion/media';
import { marca, T } from './base';
import { Gancho } from './gancho';
import { Mundo } from './mundo';
import { Textos } from './textos';
import { Cierre, type PropsCierre } from './cierre';

export type PropsUnaToma = PropsCierre & { musica: string | null; volumen: number };

export const PROPS_UNA_TOMA: PropsUnaToma = {
  oferta: 'Pruébalo',
  ofertaAcento: '30 días gratis',
  detalle: 'Sin tarjeta. Tu restaurante listo en minutos.',
  url: 'distleogin.com',
  qr: 'https://distleogin.com/registro',
  musica: 'una-toma/banda.wav',
  volumen: 1,
};

// Grano de película muy leve: une las capas en una sola imagen.
const Grano: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: 0.07, mixBlendMode: 'overlay' }}>
      <svg width="100%" height="100%">
        <filter id="grano"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={f % 24} /></filter>
        <rect width="100%" height="100%" filter="url(#grano)" />
      </svg>
    </AbsoluteFill>
  );
};

export const UnaToma: React.FC<PropsUnaToma> = (props) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, #1F1B19 0%, ${marca.noche} 70%)` }}>
      {f >= T.gancho.iris - 1 && f < T.cierre.inicio && <Mundo />}
      {f >= T.drop && f < T.cierre.inicio && <Textos />}
      {f < T.drop + 3 && <Gancho />}
      {f >= T.cierre.inicio && <Cierre {...props} />}
      <Grano />
      {props.musica && <Audio src={staticFile(props.musica)} volume={props.volumen} />}
    </AbsoluteFill>
  );
};
