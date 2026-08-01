import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icons';
import { PageHeader, EmptyState } from '@/components/super/ui';
import { getAllOrganizations } from '@/lib/db/super-admin';

export const metadata = { title: 'Grupos — Super Admin' };

export default async function SuperGruposPage() {
  const orgs = await getAllOrganizations();

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Grupos"
        subtitle={
          <>
            Un grupo reúne varias sucursales bajo un jefe que las monitorea desde{' '}
            <strong>slug-central.tudominio.com</strong>, con CRM financiero consolidado.
          </>
        }
        actions={
          <Button render={<Link href="/super/grupos/new" />}>
            <Icon name="plus" size={15} /> Nuevo grupo
          </Button>
        }
      />

      {orgs.length === 0 ? (
        <EmptyState
          icon="users"
          title="No hay grupos todavía"
          body="Crea un grupo cuando un cliente tenga 2 o más sucursales y quiera verlas consolidadas."
          action={<Button size="sm" render={<Link href="/super/grupos/new" />}>Crear el primero</Button>}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {orgs.map((o) => (
            <Card key={o.id} variant="interactive" style={{ padding: 0 }}>
              <Link
                href={`/super/grupos/${o.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', textDecoration: 'none' }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: 'grid', placeItems: 'center',
                    background: 'color-mix(in srgb, var(--brand-accent) 14%, transparent)', color: 'var(--brand-accent-ink)',
                  }}
                >
                  <Icon name="dashboard" size={18} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--u-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--u-text-4)', fontFamily: 'var(--ui-font-mono)', marginTop: 2 }}>
                    {o.slug}-central
                  </div>
                </div>
                <span style={{ fontSize: 12.5, color: 'var(--u-text-3)', whiteSpace: 'nowrap' }}>
                  {o.branchCount} sucursal{o.branchCount === 1 ? '' : 'es'}
                </span>
                <Icon name="chevronRight" size={16} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
