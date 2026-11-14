// Índice de lo que grabó scripts/grabar.mjs (npm run grabar).
import indice from '../public/capturas/capturas.json';

export type Caja = { x: number; y: number; w: number; h: number };
export type Captura = { id: string; archivo: string; ancho: number; alto: number; cajas: Record<string, Caja> };

export const capturas = indice.capturas as Captura[];
export const grabacion = {
  pedido: indice.pedido as string,
  latencia: indice.latenciaSegundos as number,
  esperadoCaja: indice.esperadoCaja as number,
};

export function captura(id: string): Captura {
  const c = capturas.find((x) => x.id === id);
  if (!c) throw new Error(`Falta la captura «${id}»: corre npm run grabar`);
  return c;
}

export function caja(id: string, nombre: string): Caja {
  const c = captura(id).cajas[nombre];
  if (!c) throw new Error(`La captura «${id}» no tiene la caja «${nombre}»`);
  return c;
}
