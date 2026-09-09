import 'server-only';

import { cache } from 'react';
import { createServiceClient } from '@/lib/supabase/service';
import { faltaLaTabla } from '@/lib/db/migracion-ausente';
import type { AccionSuper } from '@/lib/super-admin-log';

/* ============================================================
   LEER LA BITÁCORA DEL SUPER ADMIN (migración 132)
   ------------------------------------------------------------
   Dos vistas y las dos con la misma consulta: «lo último de todo»
   (/super/configuracion/bitacora) y «lo de esta persona», que sale
   dentro de su ficha, junto a los botones que la escriben. Ahí es
   donde de verdad hace falta: cuando alguien llama preguntando qué
   pasó con su cuenta, la respuesta tiene que estar en la pantalla que
   ya estás mirando.
   ============================================================ */

export type LogRow = {
  id: number;
  actorEmail: string | null;
  action: AccionSuper | string;
  targetUserId: string | null;
  targetRestaurantId: string | null;
  targetLabel: string | null;
  meta: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  /**
   * ¿Sigue existiendo aquello sobre lo que se actuó?
   *
   * La fila se lee igual sin él —el nombre está congelado— pero el enlace
   * «ver el restaurante» sobre algo que ya se borró lleva a un 404, y un
   * enlace roto en una bitácora hace dudar de la bitácora entera.
   */
  targetExists: boolean;
};

export type LogResult = {
  rows: LogRow[];
  /** La migración 132 todavía no ha corrido en esta base. */
  migracionPendiente: boolean;
};

export const listSuperAdminLog = cache(
  async (opts: { targetUserId?: string; limit?: number } = {}): Promise<LogResult> => {
    const db = createServiceClient();

    let q = db
      .from('super_admin_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(opts.limit ?? 100);

    if (opts.targetUserId) q = q.eq('target_user_id', opts.targetUserId);

    const { data, error } = await q;

    if (error) {
      if (faltaLaTabla(error)) return { rows: [], migracionPendiente: true };
      throw new Error(error.message);
    }

    const crudas = data ?? [];

    // Qué objetivos siguen vivos: DOS consultas para toda la página, no una
    // por fila. Sin esto habría que elegir entre enlazar a un 404 o no
    // enlazar nunca.
    const idsRest = [...new Set(crudas.map((r) => r.target_restaurant_id as string | null).filter(Boolean))] as string[];
    const idsUser = [...new Set(crudas.map((r) => r.target_user_id as string | null).filter(Boolean))] as string[];

    const [restVivos, userVivos] = await Promise.all([
      idsExistentes(db, 'restaurants', idsRest),
      idsExistentes(db, 'profiles', idsUser),
    ]);

    const rows = crudas.map((r) => {
      const restId = (r.target_restaurant_id as string | null) ?? null;
      const userId = (r.target_user_id as string | null) ?? null;
      return {
        id: r.id as number,
        actorEmail: (r.actor_email as string | null) ?? null,
        action: r.action as string,
        targetUserId: userId,
        targetRestaurantId: restId,
        targetLabel: (r.target_label as string | null) ?? null,
        meta: (r.meta as Record<string, unknown> | null) ?? null,
        ip: (r.ip as string | null) ?? null,
        createdAt: r.created_at as string,
        // Sin objetivo no hay nada que enlazar, y eso no es «no existe».
        targetExists:
          (!restId || restVivos.has(restId)) && (!userId || userVivos.has(userId)),
      };
    });

    return { rows, migracionPendiente: false };
  },
);

/** Cuáles de estos ids siguen en la tabla. Una consulta, o ninguna. */
async function idsExistentes(
  db: ReturnType<typeof createServiceClient>,
  tabla: 'restaurants' | 'profiles',
  ids: string[],
): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data } = await db.from(tabla).select('id').in('id', ids);
  return new Set((data ?? []).map((r) => r.id as string));
}
