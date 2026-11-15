// «Otra vez»: el mismo domingo, dos veces. Tiempos, capturas y utilidades.
//
// Todo va a 30 fps y a 100 pulsos por minuto: un pulso = 18 cuadros. La banda
// sonora (scripts/otra-vez/sonido.mjs) sigue este mismo mapa.
import { Easing, interpolate } from 'remotion';
import indice from '../../public/otra-vez/capturas/capturas.json';

export const PULSO = 18;
export const T = {
  caos: 0, // el domingo sin Leogin
  pregunta: 162, // todo se congela
  rebobina: 216, // la cinta vuelve atrás
  titulo: 252, // el mismo domingo, ahora con Leogin
  pasos: 324, // cinco pasos de 8 pulsos
  ademas: 1044, // lo demás que trae
  cierre: 1188,
  fin: 1368,
} as const;
export const PASO = 144;

export type Publico = 'meseros' | 'comedor' | 'domicilio';

export type Caja = { x: number; y: number; w: number; h: number };
export type Captura = { id: string; archivo: string; ancho: number; alto: number; cajas: Record<string, Caja> };
const capturas = indice.capturas as Captura[];

export function captura(id: string): Captura {
  const c = capturas.find((x) => x.id === id);
  if (!c) throw new Error(`Falta la captura «${id}»: corre npm run otra-vez:grabar`);
  return c;
}

const SUAVE = Easing.bezier(0.16, 1, 0.3, 1);

/** Avance de 0 a 1 entre dos cuadros, con frenada suave. */
export function av(f: number, desde: number, hasta: number, easing: (n: number) => number = SUAVE): number {
  return interpolate(f, [desde, hasta], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing });
}

/** Entrada con rebote corto (para lo que «salta» a la pantalla). */
export function salto(f: number, desde: number, dur = 9): number {
  return interpolate(f, [desde, desde + dur * 0.6, desde + dur], [0, 1.08, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
}

/** Azar estable por índice: el mismo video en cada render. */
export function azar(i: number, sal = 0): number {
  const x = Math.sin(i * 127.1 + sal * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** «1:47» a partir de minutos desde el mediodía. */
export function hora(minutos: number): string {
  const h = Math.floor(minutos / 60) % 12 || 12;
  return `${h}:${String(Math.floor(minutos % 60)).padStart(2, '0')}`;
}
