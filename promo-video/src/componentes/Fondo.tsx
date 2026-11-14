// Fondos: «antes» (papel, cálido y gastado) y «con Leogin» (carbón con luz de brasa).
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { color } from '../marca';

const GRANO = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .36 0 0 0 0 .27 0 0 0 0 .17 0 0 0 .5 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;

export const FondoLeogin: React.FC<{ brillo?: number }> = ({ brillo = 1 }) => (
  <AbsoluteFill style={{ background: color.carbonHondo }}>
    <AbsoluteFill style={{
      background: `radial-gradient(900px 700px at 85% 8%, rgba(232,83,74,${0.28 * brillo}), transparent 70%),
                   radial-gradient(800px 800px at 0% 100%, rgba(245,160,48,${0.12 * brillo}), transparent 70%)`,
    }} />
    <AbsoluteFill style={{ backgroundImage: GRANO, opacity: 0.25, mixBlendMode: 'overlay' }} />
  </AbsoluteFill>
);

export const FondoPapel: React.FC = () => (
  <AbsoluteFill style={{ background: '#E9DFCF' }}>
    <AbsoluteFill style={{ background: 'radial-gradient(1200px 1100px at 50% 40%, #F4ECDD, #D9CCB6 90%)' }} />
    <AbsoluteFill style={{ backgroundImage: GRANO, opacity: 0.55, mixBlendMode: 'multiply' }} />
  </AbsoluteFill>
);
