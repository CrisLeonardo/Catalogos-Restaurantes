import { Card } from '@/components/ui/card';
import { Icon } from '@/components/icons';
import { PageHeader } from '@/components/super/ui';
import AccountsDirectory, { type AccountDirectoryRow } from '@/components/super/accounts-directory';
import { listAccounts } from '@/lib/db/accounts';

export const metadata = { title: 'Cuentas — Super Admin' };
export const dynamic = 'force-dynamic';

export default async function CuentasPage() {
  const { rows, migracionPendiente } = await listAccounts();

  if (migracionPendiente) {
    return (
      <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader
          subtitle="Las personas que entran a Leogin, con restaurante o sin él."
        />
        <Card style={{ padding: 20, display: 'flex', gap: 13, alignItems: 'flex-start' }}>
          <Icon name="alertCircle" size={20} style={{ color: 'var(--c-warn)', flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--u-text-3)' }}>
            <div style={{ fontWeight: 700, color: 'var(--u-text)', marginBottom: 4 }}>
              Falta correr la migración 131 en esta base
            </div>
            Esta pantalla lee la vista <code>admin_accounts</code>, que es lo que junta el
            perfil de cada persona con su correo (que vive en Auth y no en una tabla
            normal). Pega{' '}
            <code>supabase/migrations/131_vista_cuentas.sql</code> en el editor SQL y
            recarga.
          </div>
        </Card>
      </div>
    );
  }

  const directorio: AccountDirectoryRow[] = rows.map((r) => ({
    id: r.id,
    email: r.email,
    fullName: r.fullName,
    role: r.role,
    providers: r.providers,
    esPin: r.esPin,
    verificado: r.verificado,
    suspendida: r.suspendida,
    createdAt: r.createdAt,
    lastSignInAt: r.lastSignInAt,
    locales: r.locales.map((l) => ({
      restaurantId: l.restaurantId,
      name: l.name,
      slug: l.slug,
      role: l.role,
      legacy: l.legacy,
    })),
    sinLocal: r.sinLocal,
    huerfana: r.huerfana,
  }));

  const personas = directorio.filter((r) => !r.esPin).length;

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        subtitle={
          <>
            {personas} {personas === 1 ? 'persona' : 'personas'} con cuenta de Leogin.
            Aquí sí aparece quien todavía no ha creado su restaurante — que es justo a
            quien no se podía ayudar desde la ficha de ningún local.
          </>
        }
      />
      <AccountsDirectory rows={directorio} />
    </div>
  );
}
