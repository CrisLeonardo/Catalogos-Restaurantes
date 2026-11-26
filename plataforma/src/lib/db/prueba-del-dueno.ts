import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';
import type { MotivoSinPrueba } from '@/lib/prueba-del-dueno';

/* ============================================================
   ¿PUEDE ESTE DUEÑO EMPEZAR UNA PRUEBA? (migración 205)
   ------------------------------------------------------------
   Una prueba por establecimiento, una en curso por dueño, y ninguna en
   locales nuevos si una prueba anterior suya terminó sin contratar. La
   base lo hace cumplir con un disparador; esto solo sirve para no ofrecer
   en pantalla una prueba que se va a rechazar.
   ============================================================ */

export type { MotivoSinPrueba };

export async function motivoSinPrueba(dueno: string, restaurante?: string): Promise<MotivoSinPrueba> {
  const { data, error } = await createServiceClient().rpc('leogin_motivo_sin_prueba', {
    p_dueno: dueno,
    p_restaurante: restaurante ?? null,
  });
  // Sin la 205 o con la lectura caída se ofrece como antes: el disparador
  // de la base sigue siendo quien decide.
  if (error) return null;
  return data === 'en_curso' || data === 'usada' ? data : null;
}
