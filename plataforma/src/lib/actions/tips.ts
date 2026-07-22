'use server';

/* ============================================================
   PROPINAS — reparto entre personal (Fase 2 auditoría de lanzamiento)
   ------------------------------------------------------------
   · getTipPreview:  propinas del período aún SIN repartir, agrupadas por
     mesero (waiter_id de orders) + el resto sin asignar (pedidos sin
     mesero, ej. pickup/delivery en línea).
   · createTipDistribution: cierra el período — guarda cuánto le tocó a
     cada quien (ajustable a mano por el dueño antes de confirmar) y marca
     esos pedidos como ya repartidos (orders.tip_distribution_id) para que
     el siguiente período no los vuelva a contar.
   · getTipDistributionHistory: repartos ya cerrados, con su desglose.
   No mueve dinero real (el pago del staff es manual, fuera del sistema);
   es la bitácora auditable de "a quién le tocó cuánto".
   ============================================================ */

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveGroupBranchId } from '@/lib/db/admin';
import { can } from '@/lib/permissions';
import { revalidatePath } from 'next/cache';

const UUID_RE = /^[0-9a-f-]{36}$/i;

async function authRestaurant(restaurantId: string): Promise<{
  db: ReturnType<typeof createServiceClient>;
  userId: string;
} | null> {
  if (!UUID_RE.test(restaurantId)) return null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, restaurant_id, permissions')
    .eq('id', user.id)
    .single();

  const belongs =
    profile?.role === 'SUPER_ADMIN' ||
    (['RESTAURANT_OWNER', 'RESTAURANT_STAFF'].includes(profile?.role ?? '') &&
      profile?.restaurant_id === restaurantId) ||
    (profile?.role === 'GROUP_OWNER' && (await resolveGroupBranchId()) === restaurantId);
  if (!belongs) return null;
  if (!can(profile?.role, profile?.permissions as string[] | null, 'finanzas')) return null;

  return { db: createServiceClient(), userId: user.id };
}

export type WaiterTipRow = { waiterId: string; name: string; amount: number; ordersCount: number };
export type StaffOption = { id: string; name: string };

export type TipPreview = {
  from: string;
  to: string;
  total: number;
  byWaiter: WaiterTipRow[];
  unassigned: { amount: number; ordersCount: number };
  staff: StaffOption[];
};

const EMPTY_PREVIEW = (from: string, to: string): TipPreview => ({
  from, to, total: 0, byWaiter: [], unassigned: { amount: 0, ordersCount: 0 }, staff: [],
});

/** Rango [from, to] como fechas de calendario "YYYY-MM-DD" → límites UTC inclusivos del día `to`. */
function rangeBounds(from: string, to: string): { since: string; until: string } {
  return {
    since: `${from}T00:00:00.000Z`,
    until: `${to}T23:59:59.999Z`,
  };
}

export async function getTipPreview(restaurantId: string, from: string, to: string): Promise<TipPreview> {
  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return EMPTY_PREVIEW(from, to);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return EMPTY_PREVIEW(from, to);

  const { since, until } = rangeBounds(from, to);

  const [{ data: orders }, { data: staffRows }] = await Promise.all([
    ctx.db
      .from('orders')
      .select('waiter_id, tip')
      .eq('restaurant_id', restaurantId)
      .neq('status', 'CANCEL')
      .is('tip_distribution_id', null)
      .gt('tip', 0)
      .gte('created_at', since)
      .lte('created_at', until)
      .limit(10000),
    ctx.db
      .from('profiles')
      .select('id, full_name, permissions')
      .eq('restaurant_id', restaurantId)
      .eq('role', 'RESTAURANT_STAFF'),
  ]);

  const staff: StaffOption[] = (staffRows ?? []).map((s) => ({
    id: s.id as string,
    name: (s.full_name as string) || 'Miembro del equipo',
  }));
  const staffNameById = new Map(staff.map((s) => [s.id, s.name]));

  let total = 0;
  let unassignedAmount = 0;
  let unassignedOrders = 0;
  const byWaiterMap = new Map<string, { amount: number; ordersCount: number }>();

  for (const o of orders ?? []) {
    const tip = Number(o.tip) || 0;
    if (tip <= 0) continue;
    total += tip;
    const wid = o.waiter_id as string | null;
    if (!wid) {
      unassignedAmount += tip;
      unassignedOrders += 1;
      continue;
    }
    const entry = byWaiterMap.get(wid) ?? { amount: 0, ordersCount: 0 };
    entry.amount += tip;
    entry.ordersCount += 1;
    byWaiterMap.set(wid, entry);
  }

  const byWaiter: WaiterTipRow[] = Array.from(byWaiterMap.entries())
    .map(([waiterId, v]) => ({ waiterId, name: staffNameById.get(waiterId) ?? 'Ex-miembro del equipo', ...v }))
    .sort((a, b) => b.amount - a.amount);

  return {
    from, to,
    total: Math.round(total * 100) / 100,
    byWaiter,
    unassigned: { amount: Math.round(unassignedAmount * 100) / 100, ordersCount: unassignedOrders },
    staff,
  };
}

export type TipDistributionState = { error: string } | { ok: true } | null;

export async function createTipDistribution(
  prevState: TipDistributionState,
  formData: FormData,
): Promise<TipDistributionState> {
  const restaurantId = (formData.get('restaurantId') as string)?.trim();
  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return { error: 'No autorizado.' };

  const from = (formData.get('from') as string)?.trim();
  const to = (formData.get('to') as string)?.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { error: 'Rango de fechas inválido.' };
  }

  let shares: { staffId: string | null; staffName: string; amount: number; ordersCount: number }[];
  try {
    shares = JSON.parse((formData.get('shares') as string) || '[]');
    if (!Array.isArray(shares)) throw new Error();
  } catch {
    return { error: 'Reparto inválido.' };
  }
  shares = shares
    .map((s) => ({
      staffId: typeof s.staffId === 'string' && UUID_RE.test(s.staffId) ? s.staffId : null,
      staffName: String(s.staffName ?? '').trim().slice(0, 120) || 'Miembro del equipo',
      amount: Math.round((Number(s.amount) || 0) * 100) / 100,
      ordersCount: Math.max(0, Math.trunc(Number(s.ordersCount) || 0)),
    }))
    .filter((s) => s.amount > 0);

  if (shares.length === 0) return { error: 'Agrega al menos una persona con un monto mayor a 0.' };

  // Recalcula el total server-side (nunca confía en lo que mandó el cliente)
  // para asegurarse de que el reparto cuadra con las propinas reales aún sin repartir.
  const fresh = await getTipPreview(restaurantId, from, to);
  const sharesTotal = Math.round(shares.reduce((sum, s) => sum + s.amount, 0) * 100) / 100;
  if (Math.abs(sharesTotal - fresh.total) > 0.01) {
    return {
      error: `El total del reparto (Q${sharesTotal.toFixed(2)}) no coincide con las propinas del período (Q${fresh.total.toFixed(2)}). Actualiza la vista previa e intenta de nuevo.`,
    };
  }

  const notes = (formData.get('notes') as string)?.trim() || null;
  const { since, until } = rangeBounds(from, to);

  const { data: distribution, error: distError } = await ctx.db
    .from('tip_distributions')
    .insert({
      restaurant_id: restaurantId,
      period_start: since,
      period_end: until,
      total_tip: fresh.total,
      notes,
      created_by: ctx.userId,
    })
    .select('id')
    .single();
  if (distError || !distribution) return { error: distError?.message ?? 'No se pudo crear el reparto.' };

  const distributionId = distribution.id as string;

  const { error: sharesError } = await ctx.db.from('tip_distribution_shares').insert(
    shares.map((s) => ({
      distribution_id: distributionId,
      staff_id: s.staffId,
      staff_name: s.staffName,
      amount: s.amount,
      orders_count: s.ordersCount,
    })),
  );
  if (sharesError) return { error: sharesError.message };

  // Marca como repartidos los mismos pedidos que se usaron para el total.
  const { error: markError } = await ctx.db
    .from('orders')
    .update({ tip_distribution_id: distributionId })
    .eq('restaurant_id', restaurantId)
    .neq('status', 'CANCEL')
    .is('tip_distribution_id', null)
    .gt('tip', 0)
    .gte('created_at', since)
    .lte('created_at', until);
  if (markError) return { error: markError.message };

  revalidatePath('/admin/personal/propinas');
  return { ok: true };
}

export type TipDistributionHistoryRow = {
  id: string;
  period_start: string;
  period_end: string;
  total_tip: number;
  notes: string | null;
  created_at: string;
  shares: { staff_name: string; amount: number; orders_count: number }[];
};

export async function getTipDistributionHistory(restaurantId: string, limit = 20): Promise<TipDistributionHistoryRow[]> {
  const ctx = await authRestaurant(restaurantId);
  if (!ctx) return [];

  const { data: distributions } = await ctx.db
    .from('tip_distributions')
    .select('id, period_start, period_end, total_tip, notes, created_at')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (!distributions || distributions.length === 0) return [];

  const ids = distributions.map((d) => d.id as string);
  const { data: shares } = await ctx.db
    .from('tip_distribution_shares')
    .select('distribution_id, staff_name, amount, orders_count')
    .in('distribution_id', ids);

  const sharesByDist = new Map<string, { staff_name: string; amount: number; orders_count: number }[]>();
  for (const s of shares ?? []) {
    const key = s.distribution_id as string;
    const list = sharesByDist.get(key) ?? [];
    list.push({ staff_name: s.staff_name as string, amount: Number(s.amount), orders_count: Number(s.orders_count) });
    sharesByDist.set(key, list);
  }

  return distributions.map((d) => ({
    id: d.id as string,
    period_start: d.period_start as string,
    period_end: d.period_end as string,
    total_tip: Number(d.total_tip),
    notes: d.notes as string | null,
    created_at: d.created_at as string,
    shares: sharesByDist.get(d.id as string) ?? [],
  }));
}
