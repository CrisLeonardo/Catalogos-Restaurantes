import { Card } from '@/components/ui/card';
import { Icon } from '@/components/icons';
import LogList from '@/components/super/log-list';
import { listSuperAdminLog } from '@/lib/db/super-admin-log';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bitácora — Super Admin' };

export default async function BitacoraPage() {
  const { rows, migracionPendiente } = await listSuperAdminLog({ limit: 100 });

  if (migracionPendiente) {
    return (
      <Card style={{ padding: 20, display: 'flex', gap: 13, alignItems: 'flex-start' }}>
        <Icon name="alertCircle" size={20} style={{ color: 'var(--c-warn)', flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--u-text-3)' }}>
          <div style={{ fontWeight: 700, color: 'var(--u-text)', marginBottom: 4 }}>
            Falta correr la migración 132 en esta base
          </div>
          Hasta que corra, <strong>nada de lo que hagas queda registrado</strong> — las
          acciones funcionan igual, pero no dejan rastro. Pega{' '}
          <code>supabase/migrations/132_bitacora_super_admin.sql</code> en el editor SQL y
          recarga.
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 13, color: 'var(--u-text-4)', margin: 0, lineHeight: 1.55 }}>
        Lo último que se ha hecho desde el Super Admin: reponer contraseñas, corregir correos,
        cambiar planes, suspender y borrar. El día que un cliente pregunte quién tocó su
        cuenta, la respuesta está aquí.
      </p>
      <LogList rows={rows} />
    </div>
  );
}
