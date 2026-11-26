import 'server-only';

import { isModuleActive, type ModuleSettings } from '@/lib/modules';
import { hasPlanFeature, withPlanFloor, validPlanCode } from '@/lib/plans';
import { createServiceClient } from '@/lib/supabase/service';

export async function estadoInventarioDelLocal(restaurantId: string, db = createServiceClient()) {
  const { data: local } = await db.from('restaurants')
    .select('plan_actual, modules, module_settings, timezone')
    .eq('id', restaurantId)
    .maybeSingle();
  if (!local) return null;

  const plan = validPlanCode(local.plan_actual);
  const modules = withPlanFloor(plan, local.modules as Record<string, boolean> | null ?? {});
  return {
    productos: hasPlanFeature(plan, modules, 'inventario'),
    ingredientes: isModuleActive(modules, local.module_settings as ModuleSettings | null, 'recetas'),
    timezone: local.timezone as string | null,
  };
}
