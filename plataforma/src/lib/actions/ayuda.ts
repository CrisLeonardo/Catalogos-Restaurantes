'use server';

import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { can } from '@/lib/permissions';
import { diagnosticarPedidos, type PuntoDiagnostico } from '@/lib/ayuda/diagnostico';
import { faltaLaTabla } from '@/lib/db/migracion-ausente';

/* Ayuda por lo que necesitas (ficha 2.9). */

/**
 * «No me entran pedidos»: junta los datos de ESTE momento y los revisa.
 * Lo puede pedir cualquiera del panel; los arreglos que no puede hacer se
 * quitan (la respuesta dice el problema, no le abre una puerta cerrada).
 */
export async function diagnosticoDePedidos(): Promise<{ puntos: PuntoDiagnostico[] } | { error: string }> {
  const ctx = await getAdminContext();
  if (!ctx?.restaurant) return { error: 'No encontramos tu restaurante.' };
  const r = ctx.restaurant;
  const [tema, { data: pc }] = await Promise.all([
    getRestaurantBySlug(r.slug),
    createServiceClient().from('print_agents').select('is_active, last_seen_at').eq('restaurant_id', r.id).maybeSingle(),
  ]);
  const modules = (r.modules ?? {}) as Record<string, boolean>;
  const puntos = diagnosticarPedidos({
    pausa: { orders_paused: r.orders_paused === true, orders_paused_until: r.orders_paused_until ?? null },
    hours: r.hours ?? null,
    exceptions: r.hour_exceptions ?? null,
    zona: r.timezone || 'America/Guatemala',
    pedidosEncendidos: modules.orders === true,
    orderTypes: tema?.resolved.config.orderTypes ?? [],
    pc: pc ? { activa: (pc.is_active as boolean | null) ?? null, ultimaSenal: (pc.last_seen_at as string | null) ?? null } : null,
  });
  const { role, permissions } = ctx.profile;
  const puede = (s: string) => role === 'SUPER_ADMIN' || can(role, permissions, s);
  return {
    puntos: puntos.map((p) => {
      if (!p.accion) return p;
      if (p.accion.tipo === 'reanudar' && !puede('ajustes')) return { ...p, accion: undefined, detalle: `${p.detalle ?? ''} · Pídele al dueño o al encargado que los reanude.` };
      if (p.accion.tipo === 'ir' && p.accion.seccion && !puede(p.accion.seccion)) return { ...p, accion: undefined };
      return p;
    }),
  };
}

/**
 * Lo que se buscó en Ayuda y no tuvo respuesta (migración 186). Solo la
 * frase, recortada, sin quién la escribió: sirve para agregar respuestas,
 * no para vigilar a nadie. Nunca rompe la búsqueda.
 */
export async function anotarBusquedaSinRespuesta(frase: string): Promise<void> {
  const limpia = frase.trim().replace(/\s+/g, ' ').slice(0, 120);
  if (limpia.length < 3) return;
  try {
    const ctx = await getAdminContext();
    if (!ctx) return;
    const { error } = await createServiceClient().from('ayuda_sin_respuesta').insert({
      restaurant_id: ctx.restaurant?.id ?? null,
      frase: limpia,
    });
    if (error && !faltaLaTabla(error)) console.warn('[ayuda] no se anotó la búsqueda:', error.message);
  } catch {
    // La búsqueda no depende de esto.
  }
}
