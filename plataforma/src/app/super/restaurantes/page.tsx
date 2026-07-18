import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icons';
import { PageHeader } from '@/components/super/ui';
import RestaurantsDirectory, { type DirectoryRow } from '@/components/super/restaurants-directory';
import { getBillingDashboard, isOnTrial, trialDaysLeft } from '@/lib/db/billing';
import { getAllRestaurants } from '@/lib/db/super-admin';
import { subdomainUrl } from '@/lib/tenant';
import { PLAN_ORDER } from '@/lib/plans';

export const metadata = { title: 'Restaurantes — Super Admin' };
export const dynamic = 'force-dynamic';

export default async function RestaurantesPage() {
  const [restaurants, { rows: billing }] = await Promise.all([
    getAllRestaurants(),
    getBillingDashboard(),
  ]);
  const billingById = new Map(billing.map((b) => [b.restaurantId, b]));

  const rows: DirectoryRow[] = restaurants.map((r) => {
    const b = billingById.get(r.id);
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      plan: (r.plan_actual as string) || 'BASICO',
      status: r.status,
      color: r.restaurant_themes[0]?.color_primary ?? null,
      createdAt: r.created_at,
      visits30: b?.visits30 ?? 0,
      orders30: b?.orders30 ?? 0,
      monthlyFee: b?.config?.monthly_fee ?? 0,
      currency: b?.config?.currency ?? 'GTQ',
      hasOverdue: b?.hasOverdue ?? false,
      onTrial: b ? isOnTrial(b.config) : false,
      trialDays: b ? trialDaysLeft(b.config) : 0,
      menuUrl: subdomainUrl(r.slug),
    };
  });

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Restaurantes"
        subtitle={`${rows.length} ${rows.length === 1 ? 'restaurante' : 'restaurantes'} en la plataforma. Busca, filtra y entra a la ficha para gestionar plan, cobro y usuarios.`}
        actions={
          <Button render={<Link href="/super/restaurantes/new" />}>
            <Icon name="plus" size={15} /> Nuevo restaurante
          </Button>
        }
      />
      <RestaurantsDirectory rows={rows} planOrder={[...PLAN_ORDER]} />
    </div>
  );
}
