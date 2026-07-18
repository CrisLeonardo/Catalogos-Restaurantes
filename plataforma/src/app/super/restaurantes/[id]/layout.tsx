import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icons';
import { PageHeader, StatusChip, PlanChip } from '@/components/super/ui';
import FichaTabs from '@/components/super/ficha-tabs';
import { subdomainUrl } from '@/lib/tenant';
import { getRestaurantFullById } from '@/lib/db/super-admin';
import { getBillingConfig, isOnTrial, trialDaysLeft } from '@/lib/db/billing';
import { Badge } from '@/components/ui/badge';

/* Cabecera + pestañas persistentes de la ficha. Cada pestaña es una
   sub-ruta que carga solo sus datos (getRestaurantFullById está
   cacheado por request: layout y página comparten la misma query). */

export default async function FichaLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const row = await getRestaurantFullById(id);
  if (!row) notFound();

  const billing = await getBillingConfig(id);
  const theme = row.restaurant_themes[0] ?? null;
  const onTrial = isOnTrial(billing);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader
        backHref="/super/restaurantes"
        backLabel="Restaurantes"
        title={row.name}
        subtitle={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            {theme && (
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: theme.color_primary, flexShrink: 0 }} />
            )}
            <span style={{ fontFamily: 'var(--ui-font-mono)' }}>{row.slug}</span>
            <StatusChip status={row.status} />
            <PlanChip plan={row.plan_actual} />
            {onTrial && <Badge variant="info" style={{ fontSize: 10 }}>Prueba · {trialDaysLeft(billing)}d</Badge>}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" size="sm" render={<a href={subdomainUrl(row.slug)} target="_blank" rel="noopener noreferrer" />}>
              <Icon name="eye" size={14} /> Ver menú
            </Button>
            <Button variant="secondary" size="sm" render={<Link href={`/super/metricas/${row.id}`} />}>
              <Icon name="chart" size={14} /> Métricas
            </Button>
          </>
        }
      />

      <FichaTabs restaurantId={row.id} />

      <div style={{ minHeight: 200 }}>{children}</div>
    </div>
  );
}
