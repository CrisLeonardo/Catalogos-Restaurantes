import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';
import { faltaLaTabla } from '@/lib/db/migracion-ausente';
import type { EstadoLectura } from '@/lib/db/lectura';
import type { CuentaSinRestaurante, SaludRestaurante } from '@/lib/client-health';
import type { HourExceptions, WeeklyHours } from '@/lib/hours';

/**
 * Lo que necesita `alertasDeSalud` (lib/client-health.ts), en dos consultas
 * para toda la plataforma (migración 138). Sin la 138 aplicada devuelve
 * listas vacías y `estado: 'falta-migracion'`: el panel sigue funcionando y
 * solo deja de avisar de esto.
 *
 * Un error de otro tipo devuelve `estado: 'error'`. Antes devolvía las listas
 * vacías como si todo estuviera sano y el inicio del super decía «Todo en
 * orden» (auditoría 2026-11-03, N12).
 */
export async function getClientHealth(): Promise<{
  restaurantes: SaludRestaurante[];
  cuentas: CuentaSinRestaurante[];
  estado: Exclude<EstadoLectura, 'parcial'>;
}> {
  const db = createServiceClient();
  const [r, c] = await Promise.all([
    db.rpc('leogin_salud_restaurantes'),
    db.rpc('leogin_cuentas_sin_restaurante', { p_horas: 48 }),
  ]);

  if (r.error || c.error) {
    const falta = faltaLaTabla(r.error) || faltaLaTabla(c.error)
      || /function .* does not exist|Could not find the function/i.test(`${r.error?.message} ${c.error?.message}`);
    if (!falta) console.error('[client-health]', r.error?.message, c.error?.message);
    return { restaurantes: [], cuentas: [], estado: falta ? 'falta-migracion' : 'error' };
  }

  type FilaR = {
    restaurant_id: string; nombre: string; creado_en: string; pedidos_activos: boolean;
    ultimo_pedido_en: string | null; platillos: number; pc_activa: boolean | null;
    pc_visto_en: string | null; impresiones_fallidas_24h: number; horario: WeeklyHours | null;
    excepciones: HourExceptions | null; zona_horaria: string | null;
  };
  type FilaC = { user_id: string; email: string; nombre: string | null; creada_en: string };

  return {
    restaurantes: ((r.data ?? []) as FilaR[]).map((x) => ({
      restaurantId: x.restaurant_id,
      nombre: x.nombre,
      creadoEn: x.creado_en,
      pedidosActivos: x.pedidos_activos,
      ultimoPedidoEn: x.ultimo_pedido_en,
      platillos: x.platillos,
      pcActiva: x.pc_activa,
      pcVistoEn: x.pc_visto_en,
      impresionesFallidas24h: x.impresiones_fallidas_24h,
      horario: x.horario,
      excepciones: x.excepciones,
      zonaHoraria: x.zona_horaria,
    })),
    cuentas: ((c.data ?? []) as FilaC[]).map((x) => ({
      userId: x.user_id, email: x.email, nombre: x.nombre, creadaEn: x.creada_en,
    })),
    estado: 'ok',
  };
}
