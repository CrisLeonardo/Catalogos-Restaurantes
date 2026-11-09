'use server';

import { authRestaurant } from '@/lib/caja/acceso';
import { identidadCobroValida } from '@/lib/cobro-intento';
import { faltaLaFuncion, faltaLaTabla } from '@/lib/db/migracion-ausente';
import type { CajaReceipt } from './finanzas';

export interface TraspasoCaja {
  corte_id: string;
  entrega_nombre: string;
  recibe_id: string;
  recibe_nombre: string;
  observacion: string;
  confirmado_at: string | null;
}

type Receptor = { id: string; nombre: string };
type Cuadre = Pick<CajaReceipt, 'counted' | 'expectedDrawer' | 'difference' | 'closedAt'>;
export type RecepcionCaja = TraspasoCaja & { recibo: Cuadre };

const CAMPOS = 'corte_id, entrega_nombre, recibe_id, recibe_nombre, observacion, confirmado_at';
const SIN_MIGRACION = 'Falta la migración 172 para registrar traspasos de Caja.';

export async function getTraspasoDeCorte(restaurantId: string, corteId: string): Promise<{
  registro?: TraspasoCaja;
  receptores?: Receptor[];
  puedeRecibir?: boolean;
  vigente?: boolean;
  error?: string;
}> {
  if (!identidadCobroValida(corteId)) return { error: 'Corte inválido.' };
  const ctx = await authRestaurant(restaurantId, 'caja.cerrar', 'caja.abrir');
  if (!ctx) return { error: 'No autorizado.' };
  const [corte, entrega] = await Promise.all([
    ctx.db.from('caja_recibos').select('actor_id, cash_counts!inner(status)')
      .eq('restaurant_id', restaurantId).eq('corte_id', corteId).maybeSingle(),
    ctx.db.from('caja_traspasos').select(CAMPOS)
      .eq('restaurant_id', restaurantId).eq('corte_id', corteId).maybeSingle(),
  ]);
  if (faltaLaTabla(entrega.error)) return { error: SIN_MIGRACION };
  if (corte.error || entrega.error) return { error: 'No se pudo leer el traspaso.' };
  if (!corte.data) return { error: 'No se encontró el recibo de ese corte.' };
  const vigente = (corte.data.cash_counts as unknown as { status: string }).status === 'CLOSED';
  if (entrega.data) {
    return { registro: entrega.data, vigente, puedeRecibir: vigente && entrega.data.recibe_id === ctx.userId };
  }
  if (!vigente || corte.data.actor_id !== ctx.userId) return { vigente };
  const { data, error } = await ctx.db.rpc('leogin_receptores_caja', { p_restaurant: restaurantId });
  if (error) return { error: faltaLaFuncion(error) ? SIN_MIGRACION : 'No se pudo consultar quién puede recibir.' };
  return { vigente, receptores: (data as Receptor[]).filter((p) => p.id !== ctx.userId)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) };
}

export async function getRecepcionesCaja(restaurantId: string): Promise<{ pendientes: RecepcionCaja[]; error?: string }> {
  const ctx = await authRestaurant(restaurantId, 'caja.abrir');
  if (!ctx) return { pendientes: [], error: 'No autorizado.' };
  const { data, error } = await ctx.db.from('caja_traspasos')
    .select(`${CAMPOS}, caja_recibos!inner(recibo, cash_counts!inner(status))`)
    .eq('restaurant_id', restaurantId).eq('recibe_id', ctx.userId).is('confirmado_at', null)
    .eq('caja_recibos.cash_counts.status', 'CLOSED').order('solicitado_at');
  if (error) return { pendientes: [], error: faltaLaTabla(error) ? SIN_MIGRACION : 'No se pudieron leer las recepciones de Caja.' };
  const rows = data as unknown as (TraspasoCaja & { caja_recibos: { recibo: Cuadre } })[];
  return { pendientes: rows.map(({ caja_recibos, ...registro }) => {
    const { counted, expectedDrawer, difference, closedAt } = caja_recibos.recibo;
    return { ...registro, recibo: { counted, expectedDrawer, difference, closedAt } };
  }) };
}

export async function solicitarTraspasoCaja(restaurantId: string, corteId: string, receptor: string, nota: string):
  Promise<{ registro?: TraspasoCaja; error?: string }> {
  if (!identidadCobroValida(corteId) || !identidadCobroValida(receptor) || typeof nota !== 'string') {
    return { error: 'Datos de entrega inválidos.' };
  }
  const ctx = await authRestaurant(restaurantId, 'caja.cerrar');
  if (!ctx) return { error: 'No autorizado.' };
  const { data, error } = await ctx.db.rpc('leogin_solicitar_traspaso_caja', {
    p_restaurant: restaurantId, p_corte: corteId, p_entrega: ctx.userId, p_recibe: receptor, p_nota: nota.trim(),
  });
  if (error) return { error: faltaLaFuncion(error) ? SIN_MIGRACION : error.message };
  return { registro: data as TraspasoCaja };
}

export async function confirmarTraspasoCaja(restaurantId: string, corteId: string):
  Promise<{ registro?: TraspasoCaja; error?: string }> {
  if (!identidadCobroValida(corteId)) return { error: 'Corte inválido.' };
  const ctx = await authRestaurant(restaurantId, 'caja.abrir');
  if (!ctx) return { error: 'No autorizado.' };
  const { data, error } = await ctx.db.rpc('leogin_confirmar_traspaso_caja', {
    p_restaurant: restaurantId, p_corte: corteId, p_recibe: ctx.userId,
  });
  if (error) return { error: faltaLaFuncion(error) ? SIN_MIGRACION : error.message };
  return { registro: data as TraspasoCaja };
}
