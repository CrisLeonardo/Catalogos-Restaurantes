/* Fechas de un periodo dichas en palabras («del 1 al 15 nov»). Sirve al
   servidor y al cliente: Finanzas, Analítica y su selector de periodo. */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

/** «1 nov» o, con el año, «28 dic 2025». */
function fechaCorta(ymd: string, conAnio: boolean): string {
  const [a, m, d] = ymd.split('-').map(Number);
  return conAnio ? `${d} ${MESES[m - 1]} ${a}` : `${d} ${MESES[m - 1]}`;
}

/** «del 1 al 15 nov» · «del 28 oct al 3 nov» · «el 15 nov». El año se
 *  dice cuando no es el de `hoy` («del 1 al 5 ene 2025») y en la primera
 *  fecha cuando el rango cruza de año («del 28 dic 2025 al 3 ene»). */
export function rangoEnPalabras(desde: string, hasta: string, hoy: string = hasta): string {
  const anioDeHasta = hasta.slice(0, 4) !== hoy.slice(0, 4);
  if (desde === hasta) return `el ${fechaCorta(hasta, anioDeHasta)}`;
  const fin = fechaCorta(hasta, anioDeHasta);
  if (desde.slice(0, 7) === hasta.slice(0, 7)) return `del ${Number(desde.slice(8))} al ${fin}`;
  const cruzaAnio = desde.slice(0, 4) !== hasta.slice(0, 4);
  return `del ${fechaCorta(desde, cruzaAnio)} al ${fin}`;
}
