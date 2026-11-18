import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { faltaLaTabla } from '@/lib/db/migracion-ausente';
import type { EstadoGuardado } from '@/lib/super/cola';

/* ============================================================
   COLA DEL SUPERADMIN — lo guardado (migración 187)
   ------------------------------------------------------------
   El estado vigente de cada asunto y la historia (pospuso, resolvió,
   reabrió, nota). Sin la 187, la cola se arma igual pero sin estados:
   `estado: 'falta-migracion'` y la pantalla lo dice.
   El llamador ya comprobó que es un SUPER_ADMIN (layout de /super).
   ============================================================ */

export type EstadoCola = 'ok' | 'falta-migracion' | 'error';

export type EventoSuper = {
  id: string;
  clave: string | null;
  tipo: 'pospuso' | 'resolvio' | 'reabrio' | 'nota';
  texto: string | null;
  autorNombre: string | null;
  creadoEn: string;
};

export async function estadosDeLaCola(): Promise<{ guardados: Map<string, EstadoGuardado>; estado: EstadoCola }> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('super_asuntos')
    .select('clave, estado, hasta, motivo, evidencia')
    .limit(5000);
  if (error) {
    if (faltaLaTabla(error)) return { guardados: new Map(), estado: 'falta-migracion' };
    console.error('[super-cola] estados:', error.message);
    return { guardados: new Map(), estado: 'error' };
  }
  const guardados = new Map<string, EstadoGuardado>();
  for (const f of data ?? []) {
    guardados.set(f.clave as string, {
      estado: f.estado as EstadoGuardado['estado'],
      hasta: (f.hasta as string | null) ?? null,
      motivo: (f.motivo as string | null) ?? null,
      evidencia: (f.evidencia as string) ?? '',
    });
  }
  return { guardados, estado: 'ok' };
}

/** La historia y las notas de un restaurante, lo más nuevo primero. */
export async function eventosDelRestaurante(
  restaurantId: string,
  limite = 40,
): Promise<{ eventos: EventoSuper[]; estado: EstadoCola }> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('super_eventos')
    .select('id, clave, tipo, texto, autor_nombre, creado_en')
    .eq('restaurant_id', restaurantId)
    .order('creado_en', { ascending: false })
    .limit(limite);
  if (error) {
    if (faltaLaTabla(error)) return { eventos: [], estado: 'falta-migracion' };
    console.error('[super-cola] eventos:', error.message);
    return { eventos: [], estado: 'error' };
  }
  return {
    estado: 'ok',
    eventos: (data ?? []).map((e) => ({
      id: e.id as string,
      clave: (e.clave as string | null) ?? null,
      tipo: e.tipo as EventoSuper['tipo'],
      texto: (e.texto as string | null) ?? null,
      autorNombre: (e.autor_nombre as string | null) ?? null,
      creadoEn: e.creado_en as string,
    })),
  };
}

/** La historia de un asunto, para su hoja. */
export async function eventosDelAsunto(clave: string, limite = 10): Promise<EventoSuper[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('super_eventos')
    .select('id, clave, tipo, texto, autor_nombre, creado_en')
    .eq('clave', clave)
    .order('creado_en', { ascending: false })
    .limit(limite);
  if (error) return [];
  return (data ?? []).map((e) => ({
    id: e.id as string,
    clave: (e.clave as string | null) ?? null,
    tipo: e.tipo as EventoSuper['tipo'],
    texto: (e.texto as string | null) ?? null,
    autorNombre: (e.autor_nombre as string | null) ?? null,
    creadoEn: e.creado_en as string,
  }));
}
