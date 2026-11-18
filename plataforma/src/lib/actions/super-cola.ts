'use server';

/* ============================================================
   COLA DEL SUPERADMIN — posponer, resolver, anotar (ficha 4.9)
   ------------------------------------------------------------
   Cada acción guarda el estado vigente del asunto (super_asuntos, con
   la firma de la evidencia de ese momento) y deja un evento con autor
   (super_eventos). Solo un SUPER_ADMIN; la sesión ya trae el segundo
   factor (layout de /super y migración 137).
   ============================================================ */

import { revalidatePath } from 'next/cache';
import { currentSuperAdmin } from '@/lib/auth/super-admin-guard';
import { faltaLaTabla } from '@/lib/db/migracion-ausente';
import { eventosDelAsunto, type EventoSuper } from '@/lib/db/super-cola';

export type ResultadoCola = { ok: true } | { error: string };

const NO_AUTORIZADO: ResultadoCola = { error: 'No autorizado.' };
const SIN_187 = 'Falta aplicar la migración 187 en esta base: todavía no se pueden guardar estados ni notas.';
const UUID = /^[0-9a-f-]{36}$/i;

function limpiar(v: unknown, max: number): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function claveValida(clave: string): boolean {
  return /^(servicio|cobranza|activacion|seguimiento):[0-9a-z:-]{3,110}$/i.test(clave);
}

function refrescar(restaurantId: string | null) {
  revalidatePath('/super');
  if (restaurantId) revalidatePath(`/super/restaurantes/${restaurantId}`);
}

async function guardar(
  sesion: NonNullable<Awaited<ReturnType<typeof currentSuperAdmin>>>,
  fila: { clave: string; restaurantId: string | null; estado: 'pospuesto' | 'resuelto'; hasta: string | null; motivo: string | null; firma: string },
  evento: { tipo: 'pospuso' | 'resolvio'; texto: string | null },
): Promise<ResultadoCola> {
  const { db, actorId, actorEmail } = sesion;
  const { error } = await db.from('super_asuntos').upsert({
    clave: fila.clave,
    restaurant_id: fila.restaurantId,
    estado: fila.estado,
    hasta: fila.hasta,
    motivo: fila.motivo,
    evidencia: fila.firma.slice(0, 200),
    actualizado_por: actorId,
    actualizado_en: new Date().toISOString(),
  });
  if (error) return { error: faltaLaTabla(error) ? SIN_187 : 'No se pudo guardar. Inténtalo de nuevo.' };

  await db.from('super_eventos').insert({
    clave: fila.clave, restaurant_id: fila.restaurantId, tipo: evento.tipo, texto: evento.texto,
    autor: actorId, autor_nombre: actorEmail,
  });
  refrescar(fila.restaurantId);
  return { ok: true };
}

/** Aparta un asunto hasta una fecha, con su motivo. */
export async function posponerAsunto(input: {
  clave: string; restaurantId: string | null; firma: string; motivo: string; hasta: string;
}): Promise<ResultadoCola> {
  const sesion = await currentSuperAdmin();
  if (!sesion) return NO_AUTORIZADO;
  const clave = limpiar(input.clave, 120);
  if (!claveValida(clave)) return { error: 'Asunto inválido.' };
  const restaurantId = input.restaurantId && UUID.test(input.restaurantId) ? input.restaurantId : null;
  const motivo = limpiar(input.motivo, 200);
  if (!motivo) return { error: 'Di por qué lo pospones.' };
  const hasta = new Date(input.hasta);
  const ahora = Date.now();
  if (Number.isNaN(hasta.getTime()) || hasta.getTime() <= ahora) return { error: 'Elige una fecha que todavía no pasó.' };
  if (hasta.getTime() > ahora + 180 * 86_400_000) return { error: 'Pospón como mucho seis meses.' };

  const cuando = hasta.toLocaleDateString('es-GT', { day: 'numeric', month: 'short', timeZone: 'America/Guatemala' });
  return guardar(sesion,
    { clave, restaurantId, estado: 'pospuesto', hasta: hasta.toISOString(), motivo, firma: limpiar(input.firma, 200) },
    { tipo: 'pospuso', texto: `${motivo} · hasta el ${cuando}` });
}

/** Lo da por resuelto; vuelve solo si cambia la evidencia. */
export async function resolverAsunto(input: {
  clave: string; restaurantId: string | null; firma: string; nota?: string;
}): Promise<ResultadoCola> {
  const sesion = await currentSuperAdmin();
  if (!sesion) return NO_AUTORIZADO;
  const clave = limpiar(input.clave, 120);
  if (!claveValida(clave)) return { error: 'Asunto inválido.' };
  const restaurantId = input.restaurantId && UUID.test(input.restaurantId) ? input.restaurantId : null;
  const nota = limpiar(input.nota, 600) || null;
  return guardar(sesion,
    { clave, restaurantId, estado: 'resuelto', hasta: null, motivo: nota, firma: limpiar(input.firma, 200) },
    { tipo: 'resolvio', texto: nota });
}

/** Lo devuelve a la cola antes de tiempo (desde «pospuestos»). */
export async function reabrirAsunto(input: { clave: string; restaurantId: string | null }): Promise<ResultadoCola> {
  const sesion = await currentSuperAdmin();
  if (!sesion) return NO_AUTORIZADO;
  const clave = limpiar(input.clave, 120);
  if (!claveValida(clave)) return { error: 'Asunto inválido.' };
  const restaurantId = input.restaurantId && UUID.test(input.restaurantId) ? input.restaurantId : null;
  const { error } = await sesion.db.from('super_asuntos').delete().eq('clave', clave);
  if (error) return { error: faltaLaTabla(error) ? SIN_187 : 'No se pudo reabrir. Inténtalo de nuevo.' };
  await sesion.db.from('super_eventos').insert({
    clave, restaurant_id: restaurantId, tipo: 'reabrio', texto: null,
    autor: sesion.actorId, autor_nombre: sesion.actorEmail,
  });
  refrescar(restaurantId);
  return { ok: true };
}

/** Nota de soporte, de un asunto o solo del restaurante. */
export async function anotarSoporte(input: {
  restaurantId: string | null; clave?: string | null; texto: string;
}): Promise<ResultadoCola> {
  const sesion = await currentSuperAdmin();
  if (!sesion) return NO_AUTORIZADO;
  const texto = limpiar(input.texto, 600);
  if (texto.length < 3) return { error: 'Escribe qué hiciste o qué quedó pendiente.' };
  const restaurantId = input.restaurantId && UUID.test(input.restaurantId) ? input.restaurantId : null;
  const clave = input.clave ? limpiar(input.clave, 120) : null;
  if (clave && !claveValida(clave)) return { error: 'Asunto inválido.' };
  if (!restaurantId && !clave) return { error: 'Falta a qué restaurante va la nota.' };

  const { error } = await sesion.db.from('super_eventos').insert({
    clave, restaurant_id: restaurantId, tipo: 'nota', texto,
    autor: sesion.actorId, autor_nombre: sesion.actorEmail,
  });
  if (error) return { error: faltaLaTabla(error) ? SIN_187 : 'No se pudo guardar la nota. Inténtalo de nuevo.' };
  refrescar(restaurantId);
  return { ok: true };
}

/** La historia de un asunto, para su hoja. */
export async function historiaDelAsunto(clave: string): Promise<EventoSuper[]> {
  const sesion = await currentSuperAdmin();
  if (!sesion || !claveValida(limpiar(clave, 120))) return [];
  return eventosDelAsunto(clave);
}
