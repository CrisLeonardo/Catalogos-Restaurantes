/**
 * «NO PUDIMOS LEERLO» NO ES «NO HAY NADA»
 * ------------------------------------------------------------
 * Auditoría 2026-11-03, ficha 0.3 (E02, N12, N13, X20). Varias lecturas
 * convertían un error de la base en una lista vacía o en cero: el super
 * admin veía «Todo en orden» y «No hay comprobantes por revisar», el dueño
 * veía «Aún no tienes cupones» o «0 pedidos», cuando en realidad la
 * consulta había fallado.
 *
 * Una `Lectura` lleva los datos junto con lo que se sabe de ellos:
 *   · ok              → los datos son lo que hay;
 *   · parcial         → se cortaron en un tope: hay más de lo que se ve;
 *   · error           → la consulta falló; `datos` trae el vacío solo para
 *                       que la pantalla no se rompa, NUNCA para concluir;
 *   · falta-migracion → la tabla o función todavía no existe aquí (ver
 *                       migracion-ausente.ts); la función no está disponible.
 *
 * Sin dependencias de servidor: se puede importar desde componentes.
 */

import { faltaLaFuncion, faltaLaMigracion } from '@/lib/db/migracion-ausente';

export type EstadoLectura = 'ok' | 'parcial' | 'error' | 'falta-migracion';

export interface Lectura<T> {
  estado: EstadoLectura;
  datos: T;
  /** Cuándo se hizo la consulta (ISO). */
  leidoEn: string;
}

interface ErrorDeSupabase {
  code?: string | null;
  message?: string | null;
}

/**
 * Arma la lectura a partir de lo que devolvió Supabase.
 * `vacio` es lo que se entrega cuando no hay datos confiables.
 * `parcial`: true si se sabe que la respuesta se cortó en un tope.
 * `contexto`: para el registro del servidor cuando hay error (no se le
 * enseña al usuario: ni SQL ni mensajes de Postgres en pantalla).
 */
export function lecturaDe<T>(
  error: ErrorDeSupabase | null | undefined,
  datos: T | null | undefined,
  vacio: T,
  opciones: { parcial?: boolean; contexto?: string; ahora?: Date } = {},
): Lectura<T> {
  const leidoEn = (opciones.ahora ?? new Date()).toISOString();
  if (error) {
    if (faltaLaMigracion(error) || faltaLaFuncion(error)) return { estado: 'falta-migracion', datos: vacio, leidoEn };
    if (opciones.contexto) console.error(`[lectura] ${opciones.contexto}:`, error.code ?? '', error.message ?? '');
    return { estado: 'error', datos: vacio, leidoEn };
  }
  return { estado: opciones.parcial ? 'parcial' : 'ok', datos: datos ?? vacio, leidoEn };
}

/** Lectura fallida sin error de Supabase (una excepción, un timeout). */
export function lecturaFallida<T>(vacio: T, ahora: Date = new Date()): Lectura<T> {
  return { estado: 'error', datos: vacio, leidoEn: ahora.toISOString() };
}

const GRAVEDAD: Record<EstadoLectura, number> = { ok: 0, 'falta-migracion': 1, parcial: 2, error: 3 };

/** El peor estado de varias lecturas: si una falló, la pantalla no está completa. */
export function peorEstado(...estados: EstadoLectura[]): EstadoLectura {
  return estados.reduce<EstadoLectura>((peor, e) => (GRAVEDAD[e] > GRAVEDAD[peor] ? e : peor), 'ok');
}

/** ¿Se puede concluir algo de un vacío o un cero? Solo si la lectura salió completa. */
export function sePuedeConcluir(estado: EstadoLectura): boolean {
  return estado === 'ok';
}
