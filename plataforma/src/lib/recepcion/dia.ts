import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';
import { bordesDelDia, diaDeNegocio, minutosDelDia, normalizarCorte } from '@/lib/caja/dia';
import { faltaLaColumna } from '@/lib/db/migracion-ausente';

/* ============================================================
   EL «HOY» DE RECEPCIÓN (auditoría 1.8, X13 y PA-T19)
   ------------------------------------------------------------
   Antes cada pantalla decía «hoy» con la fecha UTC del servidor: después de
   las 18:00 en Guatemala ya era mañana. Ahora es el día de negocio del
   local, con su zona y su hora de corte, igual que Caja.
   ============================================================ */

export type DiaRecepcion = {
  timezone: string;
  corte: number;
  /** Día de negocio, «YYYY-MM-DD». */
  hoy: string;
  desde: Date;
  hasta: Date;
  /** Minutos desde que empezó el día de negocio (0…1439). A las 00:38 con
      corte a las 5:00 son 1178, no 38: la reserva de las 19:30 ya pasó. */
  ahoraNegocio: number;
  /** Duración de una reserva en este local (migración 178). */
  duracion: number;
  /** «domingo 9 de noviembre». */
  etiquetaHoy: string;
  nombre: string;
};

export function etiquetaDeFecha(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString('es-GT', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
}

export async function diaDeRecepcion(restaurantId: string, ahora = new Date()): Promise<DiaRecepcion> {
  const db = createServiceClient();
  let fila = await db.from('restaurants')
    .select('name, timezone, day_cutoff_minutes, duracion_reserva_min').eq('id', restaurantId).maybeSingle();
  if (fila.error && faltaLaColumna(fila.error)) {
    fila = await db.from('restaurants').select('name, timezone, day_cutoff_minutes').eq('id', restaurantId).maybeSingle();
  }
  if (fila.error) throw new Error('No se pudo leer el horario del local.');
  const r = (fila.data ?? {}) as { name?: string; timezone?: string; day_cutoff_minutes?: number; duracion_reserva_min?: number };
  const timezone = r.timezone || 'America/Guatemala';
  const corte = normalizarCorte(r.day_cutoff_minutes);
  const hoy = diaDeNegocio(ahora, timezone, corte);
  const { desde, hasta } = bordesDelDia(hoy, timezone, corte);
  return {
    timezone, corte, hoy, desde, hasta,
    ahoraNegocio: minutosDelDia(ahora, timezone, corte),
    duracion: r.duracion_reserva_min ?? 90,
    etiquetaHoy: etiquetaDeFecha(hoy),
    nombre: r.name ?? '',
  };
}
