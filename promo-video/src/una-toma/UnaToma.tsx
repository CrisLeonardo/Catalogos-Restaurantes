// Serie «Una sola toma»: un pedido cruza el restaurante sin un solo corte.
// Tres videos (con meseros, comedor, a domicilio) en vertical (TikTok,
// Reels) y horizontal (PC, visita al restaurante), con el mismo motor.
import React from 'react';
import { AbsoluteFill, staticFile, useCurrentFrame } from 'remotion';
import { Audio } from '@remotion/media';
import { marca } from './base';
import { GuionCtx, type Guion } from './guion';
import { Gancho } from './gancho';
import { Mundo } from './mundo';
import { Textos } from './textos';
import { Cierre } from './cierre';
import { MESEROS } from './guiones/meseros';
import { COMEDOR } from './guiones/comedor';
import { DOMICILIO } from './guiones/domicilio';

export const GUIONES: Record<Guion['id'], Guion> = { meseros: MESEROS, comedor: COMEDOR, domicilio: DOMICILIO };

export type PropsUnaToma = { video: Guion['id']; conMusica: boolean };

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

export const UnaToma: React.FC<PropsUnaToma> = ({ video, conMusica }) => {
  const f = useCurrentFrame();
  const g = GUIONES[video];
  const T = g.T;
  return (
    <GuionCtx.Provider value={g}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, #1F1B19 0%, ${marca.noche} 70%)` }}>
        {f >= T.gancho.iris - 1 && f < T.cierre.inicio && <Mundo />}
        {f >= T.drop && f < T.cierre.inicio && <Textos />}
        {f < T.drop + 3 && <Gancho />}
        {f >= T.cierre.inicio && <Cierre />}
        <Grano />
        {conMusica && <Audio src={staticFile(`una-toma/banda-${video}.wav`)} />}
      </AbsoluteFill>
    </GuionCtx.Provider>
  );
};
