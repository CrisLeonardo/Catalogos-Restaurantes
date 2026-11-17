import { normalizar } from './intenciones';

/* Búsquedas de Ayuda sin respuesta (ficha 2.9): se agrupan por la frase
   sin acentos ni mayúsculas, lo más pedido primero. */

export interface BusquedaSinRespuesta {
  frase: string;
  veces: number;
  restaurantes: string[];
  ultima: string;
}

export function agruparBusquedas(
  filas: { frase: string; fecha: string; restaurante: string | null }[],
  max = 50,
): BusquedaSinRespuesta[] {
  const grupos = new Map<string, BusquedaSinRespuesta>();
  for (const f of filas) {
    const clave = normalizar(f.frase).replace(/\s+/g, ' ').trim();
    const g = grupos.get(clave);
    if (!g) {
      grupos.set(clave, { frase: f.frase, veces: 1, restaurantes: f.restaurante ? [f.restaurante] : [], ultima: f.fecha });
      continue;
    }
    g.veces += 1;
    if (f.fecha > g.ultima) { g.ultima = f.fecha; g.frase = f.frase; }
    if (f.restaurante && !g.restaurantes.includes(f.restaurante)) g.restaurantes.push(f.restaurante);
  }
  return [...grupos.values()].sort((a, b) => b.veces - a.veces || b.ultima.localeCompare(a.ultima)).slice(0, max);
}
