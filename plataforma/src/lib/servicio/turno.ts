import { coincide, normalizar } from './comanda';
import type { Product } from '@/types';

export const PUESTOS_FAVORITOS = 9;
export const ROLES_SERVICIO = { dueno: 'Dueño', equipo: 'Equipo', mesero: 'Mesero' } as const;
export type RolServicio = keyof typeof ROLES_SERVICIO;
export type PuestosServicio = (string | null)[];
export interface PreferenciasServicio {
  favoritos: Partial<Record<RolServicio, PuestosServicio>>;
  alias: Record<string, string>;
}

export function rolDeServicio(rol: string | null | undefined): RolServicio {
  if (rol === 'RESTAURANT_OWNER' || rol === 'SUPER_ADMIN') return 'dueno';
  return rol === 'RESTAURANT_WAITER' ? 'mesero' : 'equipo';
}

export function leerPuestos(valor: unknown): PuestosServicio | null {
  if (!Array.isArray(valor) || valor.length > PUESTOS_FAVORITOS
      || valor.some((id) => id !== null && (typeof id !== 'string' || !id))) return null;
  const ocupados = valor.filter((id) => id !== null);
  return new Set(ocupados).size === ocupados.length ? valor : null;
}

export function prepararPuestos(preferidos: PuestosServicio | undefined, populares: string[], productos: Product[]): PuestosServicio {
  if (preferidos) return preferidos;
  const activos = productos.filter((p) => p.is_active).map((p) => p.id);
  const validos = new Set(activos);
  return [...new Set([...populares.filter((id) => validos.has(id)), ...activos])].slice(0, PUESTOS_FAVORITOS);
}

export function buscarPlato(productos: Product[], term: string, alias: Record<string, string>): Product | null {
  if (!term) return null;
  const disponibles = productos.filter((p) => p.is_active && p.is_available);
  const clave = normalizar(term);
  return disponibles.find((p) => [p.name, alias[p.id] ?? ''].some((texto) => normalizar(texto) === clave))
    ?? disponibles.find((p) => normalizar(p.name).startsWith(clave) || normalizar(alias[p.id] ?? '').startsWith(clave))
    ?? disponibles.find((p) => coincide(`${p.name} ${alias[p.id] ?? ''}`, term))
    ?? null;
}
