// La marca de Leogin para los videos: «La Comanda». Los trazos salen de la
// plataforma (plataforma/src/lib/marca/trazos.mjs), así el video y la web
// llevan siempre el mismo logo.
import React from 'react';
import {
  COMANDA_NORMAL,
  LEOGIN_CORAL,
  LEOGIN_CREMA,
  NOMBRE_ALTO_POR_EM,
  NOMBRE_D,
  NOMBRE_PROPORCION,
  NOMBRE_VIEWBOX,
} from '../../../plataforma/src/lib/marca/trazos.mjs';

/** El ícono de la app: loseta coral con la comanda crema al 74 % del alto. */
export const Logo: React.FC<{ tam: number }> = ({ tam }) => (
  <svg width={tam} height={tam} viewBox="0 0 100 100" aria-hidden="true">
    <rect width="100" height="100" rx="23" fill={LEOGIN_CORAL} />
    <svg x="16.36" y="13" width="67.27" height="74" viewBox="0 0 100 110" overflow="visible">
      <path fillRule="evenodd" d={COMANDA_NORMAL} fill={LEOGIN_CREMA} />
    </svg>
  </svg>
);

/** «leogin» en trazos. `letra` es el tamaño de letra equivalente en px. */
export const Nombre: React.FC<{ letra: number; color: string }> = ({ letra, color }) => {
  const alto = letra * NOMBRE_ALTO_POR_EM;
  return (
    <svg width={alto * NOMBRE_PROPORCION} height={alto} viewBox={NOMBRE_VIEWBOX} aria-hidden="true" style={{ display: 'block', flex: 'none' }}>
      <path d={NOMBRE_D} fill={color} />
    </svg>
  );
};
