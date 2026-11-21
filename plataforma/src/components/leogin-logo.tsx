import {
  ALTO_MINIMO_NORMAL,
  COMANDA_ALTO,
  COMANDA_ANCHO,
  COMANDA_CHICA,
  COMANDA_NORMAL,
  COMANDA_VIEWBOX,
  LEOGIN_CORAL,
  NOMBRE_ALTO_POR_EM,
  NOMBRE_D,
  NOMBRE_PROPORCION,
  NOMBRE_VIEWBOX,
} from '@/lib/marca/trazos.mjs';

/* Marca de Leogin: «La Comanda». Una comanda coral con la L y el plato
   recortados (los huecos dejan ver el fondo). Trazos en lib/marca/trazos.mjs;
   maqueta aprobada en docs/diseno/marca/logo-la-comanda-corregida.html.
   Por debajo de 24 px se dibuja la versión chica (tres dientes, sin plato). */

/** Solo la marca. `size` es el alto en px; el ancho sale de la proporción 100 × 110. */
export function LeoginMark({
  size = 28,
  color = LEOGIN_CORAL,
  decorativa = false,
}: {
  size?: number;
  color?: string;
  /** Dentro de un logo con nombre, la marca no se anuncia aparte. */
  decorativa?: boolean;
}) {
  const chica = size < ALTO_MINIMO_NORMAL;
  return (
    <svg
      width={(size * COMANDA_ANCHO) / COMANDA_ALTO}
      height={size}
      viewBox={COMANDA_VIEWBOX}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flex: '0 0 auto' }}
      {...(decorativa ? { 'aria-hidden': true } : { role: 'img', 'aria-label': 'Leogin' })}
    >
      <path fillRule="evenodd" clipRule="evenodd" d={chica ? COMANDA_CHICA : COMANDA_NORMAL} fill={color} />
    </svg>
  );
}

/** Solo «leogin», en trazos. `letra` es el tamaño de letra equivalente en px;
    toma el color del texto de la superficie. */
export function LeoginNombre({ letra, decorativa = false }: { letra: number; decorativa?: boolean }) {
  const alto = letra * NOMBRE_ALTO_POR_EM;
  return (
    <svg
      width={alto * NOMBRE_PROPORCION}
      height={alto}
      viewBox={NOMBRE_VIEWBOX}
      style={{ display: 'block', flex: '0 0 auto', color: 'var(--u-text)' }}
      {...(decorativa ? { 'aria-hidden': true } : { role: 'img', 'aria-label': 'Leogin' })}
    >
      <path d={NOMBRE_D} fill="currentColor" />
    </svg>
  );
}

/** Marca + «leogin» en trazos. */
export default function LeoginLogo({
  size = 28,
  wordmark = true,
}: {
  size?: number;
  wordmark?: boolean;
}) {
  if (!wordmark) return <LeoginMark size={size} />;
  // Proporciones de la maqueta: marca de 72 px con el nombre a 60 px de letra.
  const letra = size * 0.83;
  return (
    <span role="img" aria-label="Leogin" style={{ display: 'inline-flex', alignItems: 'center', gap: letra * 0.3 }}>
      <LeoginMark size={size} decorativa />
      <LeoginNombre letra={letra} decorativa />
    </span>
  );
}
