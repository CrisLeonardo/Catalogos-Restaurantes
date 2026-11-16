import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';
import type { LecturaImpresora, LecturaPc } from '@/lib/estado-pc';

/* ============================================================
   LA SALUD DEL LOCAL, LEÍDA UNA VEZ (ficha 2.6)
   ------------------------------------------------------------
   Hoy, Ajustes y «La PC del local» leen aquí la PC principal y lo que
   pasó con los papeles de las últimas horas. La decisión (qué estado,
   qué palabras) vive en `lib/estado-pc.ts`, sin red, con sus pruebas.
   ============================================================ */

/** Ventana de «lo de hoy»: un servicio largo cabe de sobra. */
export const HORAS_DE_FALLOS = 12;

export interface SaludDelLocal {
  pc: LecturaPc & {
    nombre: string | null;
    hubListo: boolean;
  };
  cocina: LecturaImpresora;
  caja: LecturaImpresora;
}

type Trabajo = {
  id: string; role: string; order_id: string | null; station_id: string | null;
  status: string; created_at: string; updated_at: string;
};

/**
 * Los trabajos que fallaron y nadie ha vuelto a mandar.
 *
 * Un papel se identifica por (papel, pedido, estación): si el mismo pedido
 * se volvió a imprimir y salió, su fallo anterior ya no cuenta. Las pruebas
 * no tienen pedido y cuentan solas.
 */
export function fallosPendientes(trabajos: Trabajo[]): Trabajo[] {
  const ultimo = new Map<string, Trabajo>();
  for (const t of [...trabajos].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    ultimo.set(`${t.role}|${t.order_id ?? t.id}|${t.station_id ?? ''}`, t);
  }
  return [...ultimo.values()].filter((t) => t.status === 'failed');
}

export function resumenDeImpresora(trabajos: Trabajo[], role: 'kitchen' | 'receipt', destino: string | null): LecturaImpresora {
  const suyos = trabajos.filter((t) => t.role === role);
  const fallidos = fallosPendientes(suyos);
  const bien = suyos.filter((t) => t.status === 'done').map((t) => t.updated_at).sort();
  return {
    destino,
    fallidos: fallidos.length,
    primerFallo: fallidos.map((t) => t.created_at).sort()[0] ?? null,
    ultimoBien: bien[bien.length - 1] ?? null,
  };
}

export async function leerTrabajosRecientes(restaurantId: string): Promise<Trabajo[]> {
  const desde = new Date(Date.now() - HORAS_DE_FALLOS * 3_600_000).toISOString();
  const { data } = await createServiceClient()
    .from('print_jobs')
    .select('id, role, order_id, station_id, status, created_at, updated_at')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(1000);
  return (data ?? []) as Trabajo[];
}

export async function leerSaludDelLocal(restaurantId: string): Promise<SaludDelLocal> {
  const db = createServiceClient();
  const [{ data: agent }, trabajos, { data: estaciones }] = await Promise.all([
    db.from('print_agents')
      .select('last_seen_at, is_active, device_name, kitchen_target, receipt_target, hub_url, hub_order_token')
      .eq('restaurant_id', restaurantId)
      .maybeSingle(),
    leerTrabajosRecientes(restaurantId),
    // Con una impresora por estación (M-07), la cocina imprime aunque el
    // destino general esté vacío: basta una estación con impresora.
    db.from('print_stations').select('target').eq('restaurant_id', restaurantId).not('target', 'is', null).limit(1),
  ]);
  const destinoCocina = (agent?.kitchen_target as string | null)
    ?? ((estaciones?.[0]?.target as string | undefined) ?? null);
  return {
    pc: {
      existe: !!agent,
      activa: (agent?.is_active as boolean | null) ?? null,
      ultimaSenal: (agent?.last_seen_at as string | null) ?? null,
      nombre: (agent?.device_name as string | null) ?? null,
      hubListo: !!agent?.hub_url && !!agent?.hub_order_token,
    },
    cocina: resumenDeImpresora(trabajos, 'kitchen', destinoCocina),
    caja: resumenDeImpresora(trabajos, 'receipt', (agent?.receipt_target as string | null) ?? null),
  };
}
