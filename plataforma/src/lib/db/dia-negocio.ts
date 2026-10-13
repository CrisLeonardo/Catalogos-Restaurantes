/**
 * La hora de corte de un restaurante (migración 145), leída una vez por
 * petición.
 *
 * Las funciones de Hoy, Pedidos, Mesas, reportes y analítica reciben la
 * zona horaria desde siempre; en vez de cambiarle la firma a cada una y a
 * cada llamador, preguntan aquí. `cache` de React hace que una pantalla que
 * pinta cinco tarjetas haga una sola consulta.
 *
 * Si la 145 todavía no corrió en esta base, el corte es la medianoche: el
 * día de calendario de siempre, que es exactamente lo que había antes.
 */

import { cache } from 'react';
import { createServiceClient } from '@/lib/supabase/service';
import { faltaLaColumna } from '@/lib/db/migracion-ausente';
import { normalizarCorte } from '@/lib/caja/dia';

export const corteDelRestaurante = cache(async (restaurantId: string): Promise<number> => {
  if (!/^[0-9a-f-]{36}$/i.test(restaurantId)) return 0;
  const { data, error } = await createServiceClient()
    .from('restaurants')
    .select('day_cutoff_minutes')
    .eq('id', restaurantId)
    .maybeSingle();
  if (error) return faltaLaColumna(error) ? 0 : normalizarCorte(null);
  return normalizarCorte((data as { day_cutoff_minutes?: number } | null)?.day_cutoff_minutes);
});
