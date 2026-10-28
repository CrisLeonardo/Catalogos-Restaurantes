import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';
import { encargosDelPanel } from '@/lib/db/encargos';
import { resolveTheme, type ThemeRow } from '@/lib/theme/resolve';
import { aceptaTransferencia } from '@/lib/pago-transferencia';
import { can } from '@/lib/permissions';
import { panelLink } from '@/lib/panel-links-server';
import { Card } from '@/components/ui/card';
import EncargosPanel from '@/components/admin/encargos-panel';

export const metadata = { title: 'Encargos – Panel admin' };
export const dynamic = 'force-dynamic';

/* Encargos con cupo (plan 2026-10-28, N6; migración 149). Vive en Pedidos
   porque es eso: pedidos, solo que para otro día. */
export default async function EncargosPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (!can(ctx.profile.role, ctx.profile.permissions, 'pedidos')) redirect(await panelLink('/admin'));

  let restaurantId: string | null = ctx.profile.restaurant_id;
  if (ctx.profile.role === 'SUPER_ADMIN') {
    const slug = (await headers()).get('x-tenant-slug');
    restaurantId = slug ? ((await getRestaurantBySlug(slug))?.restaurant.id ?? null) : null;
  }
  if (!restaurantId) redirect(await panelLink('/admin'));

  const db = createServiceClient();
  const [{ data: rest }, { data: themeRow }, encargos] = await Promise.all([
    db.from('restaurants').select('timezone, modules').eq('id', restaurantId).single(),
    db.from('restaurant_themes').select('*').eq('restaurant_id', restaurantId).single(),
    encargosDelPanel(restaurantId),
  ]);
  if (!(rest?.modules as { orders?: boolean } | null)?.orders) redirect(await panelLink('/admin'));

  const config = resolveTheme((themeRow as ThemeRow) ?? null).config;

  if (!encargos.disponible) {
    return (
      <Card className="anim-fade-up p-5" style={{ fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
        Los encargos estarán disponibles en cuanto terminemos de actualizar tu panel.
      </Card>
    );
  }

  return (
    <div className="anim-fade-up adm-w-read">
      <EncargosPanel
        restaurantId={restaurantId}
        timezone={(rest?.timezone as string) || 'America/Guatemala'}
        currency={{ symbol: config.currencySymbol, position: config.currencyPosition, locale: config.locale }}
        items={encargos.items}
        aceptaTransferencia={aceptaTransferencia(config)}
      />
    </div>
  );
}
