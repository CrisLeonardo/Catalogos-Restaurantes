import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/icons';
import { PageHeader, PlanChip, StatusChip } from '@/components/super/ui';
import AccountRescue from '@/components/super/account-rescue';
import AccountDanger from '@/components/super/account-danger';
import LogList from '@/components/super/log-list';
import { getAccountById, localesQueSeQuedanSinDueño } from '@/lib/db/accounts';
import { listSuperAdminLog } from '@/lib/db/super-admin-log';
import { emailEnabled } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cuenta — Super Admin' };

const ROL_LOCAL: Record<string, string> = {
  OWNER: 'Dueño',
  MANAGER: 'Gerente',
  STAFF: 'Personal',
  WAITER: 'Mesero',
};

export default async function CuentaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detalle = await getAccountById(id);
  // Lo que se le ha hecho A ESTA CUENTA. Va en la misma pantalla que los
  // botones que lo escriben: cuando alguien llama preguntando qué pasó con
  // su acceso, la respuesta tiene que estar donde ya estás mirando.
  const bitacora = await listSuperAdminLog({ targetUserId: id, limit: 30 });
  // Qué se rompería al borrarla. Se pregunta aquí para poder AVISAR antes de
  // enseñar el botón; la acción lo vuelve a comprobar por su cuenta.
  const sinDueño = await localesQueSeQuedanSinDueño(id);

  if (detalle.estado === 'migracion-pendiente') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader title="Cuenta" backHref="/super/cuentas" backLabel="Cuentas" />
        <Card style={{ padding: 20, fontSize: 13, lineHeight: 1.6, color: 'var(--u-text-3)' }}>
          Falta correr la migración <code>131_vista_cuentas.sql</code> en esta base.
        </Card>
      </div>
    );
  }
  if (detalle.estado === 'no-existe') notFound();

  const c = detalle.cuenta;
  const nombre = c.fullName?.trim() || (c.email ?? '').split('@')[0] || 'Sin nombre';
  const conGoogle = c.providers.includes('google');

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title={nombre}
        backHref="/super/cuentas"
        backLabel="Cuentas"
        subtitle={
          <span style={{ fontFamily: 'var(--ui-font-mono)', fontSize: 13 }}>{c.email ?? 'sin correo'}</span>
        }
      />

      {/* Lo que hay que saber antes de tocar nada */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {c.suspendida && <Badge variant="danger">Suspendida</Badge>}
        {c.huerfana && <Badge variant="danger">Huérfana</Badge>}
        {c.sinLocal && !c.huerfana && <Badge variant="warn">Sin ningún local</Badge>}
        {!c.verificado && !c.esPin && <Badge variant="warn">Correo sin verificar</Badge>}
        {c.esPin && <Badge variant="neutral">Acceso por PIN</Badge>}
        <Badge variant="neutral">
          <Icon name={conGoogle ? 'globe' : 'key'} size={12} /> {comoEntra(c.providers)}
        </Badge>
        <Badge variant="neutral">
          <Icon name="clock" size={12} /> {ultimoAcceso(c.lastSignInAt)}
        </Badge>
        {c.createdAt && <Badge variant="neutral">Alta {fecha(c.createdAt)}</Badge>}
      </div>

      {/* Sus locales — la pregunta que la ficha de un restaurante no contesta */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SectionTitle>
          {c.locales.length === 0
            ? 'No administra ningún local'
            : c.locales.length === 1
              ? 'Su local'
              : `Sus ${c.locales.length} locales`}
        </SectionTitle>

        {c.locales.length === 0 ? (
          <Card style={{ padding: 18, fontSize: 13, lineHeight: 1.6, color: 'var(--u-text-3)' }}>
            {c.huerfana ? (
              <>
                Su restaurante se borró y su cuenta se quedó atrás. Puede seguir entrando al
                login y no tiene a dónde ir. Si ya no debería tener acceso, es una cuenta que
                conviene cerrar; si vuelve a trabajar en un local, hay que darle acceso desde
                la ficha de ese restaurante.
              </>
            ) : (
              <>
                Creó su cuenta y nunca llegó a crear su restaurante. Su correo ya está
                ocupado, así que si vuelve a intentar registrarse se le va a decir que la
                cuenta existe: lo que necesita es poder entrar y terminar en{' '}
                <code>/mi-cuenta/nuevo</code>.
              </>
            )}
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {c.locales.map((l) => (
              <Card key={l.restaurantId} variant="interactive" style={{ padding: 0 }}>
                <Link
                  href={`/super/restaurantes/${l.restaurantId}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', textDecoration: 'none' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>{l.name}</div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 3, fontSize: 11, color: 'var(--u-text-4)', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--ui-font-mono)' }}>{l.slug}</span>
                      <span>{ROL_LOCAL[l.role] ?? l.role}</span>
                      {l.legacy && <span style={{ color: 'var(--c-warn)' }}>sin membresía</span>}
                    </div>
                  </div>
                  {l.plan && <span className="hide-mobile"><PlanChip plan={l.plan} /></span>}
                  {l.status && <StatusChip status={l.status} />}
                  <Icon name="chevronRight" size={16} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
                </Link>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* El rescate */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SectionTitle>Rescate</SectionTitle>
        {/* Quien va a pulsar estos botones merece saber si queda escrito o no.
            Y mientras la 132 no haya corrido, la respuesta honesta es que no:
            decir «queda registrado» sin que sea verdad es peor que callarlo. */}
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', margin: 0, lineHeight: 1.55 }}>
          {bitacora.migracionPendiente
            ? 'Nada de esto queda registrado en esta base: falta correr la migración 132.'
            : 'Todo esto queda registrado —quién, cuándo y desde qué IP— y se ve abajo, en el historial de la cuenta.'}
        </p>
        <AccountRescue
          cuenta={{
            id: c.id,
            email: c.email,
            providers: c.providers,
            esPin: c.esPin,
            verificado: c.verificado,
          }}
          correoDisponible={emailEnabled()}
        />
      </section>

      {/* Lo que no tiene vuelta atrás, al final y separado: son las dos cosas
          que se hacen CONTRA alguien, no para ayudarle. Al super admin no se
          le enseñan —el candado de las acciones lo rechazaría igual, pero un
          botón que siempre falla no debería existir. */}
      {c.role !== 'SUPER_ADMIN' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SectionTitle>Zona peligrosa</SectionTitle>
          <AccountDanger
            userId={c.id}
            email={c.email}
            suspendida={c.suspendida}
            sinDueño={sinDueño}
          />
        </section>
      )}

      {/* Lo que se le ha hecho a esta cuenta */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SectionTitle>Historial de esta cuenta</SectionTitle>
        {bitacora.migracionPendiente ? (
          <Card style={{ padding: 16, fontSize: 13, lineHeight: 1.6, color: 'var(--u-text-3)' }}>
            Falta correr la migración <code>132_bitacora_super_admin.sql</code>: hasta
            entonces nada de lo de arriba queda registrado.
          </Card>
        ) : (
          <LogList
            rows={bitacora.rows}
            ocultarObjetivo
            vacio="Todavía no se ha hecho nada sobre esta cuenta desde el Super Admin."
          />
        )}
      </section>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 13, fontWeight: 600,
        color: 'var(--u-text-4)', margin: 0,
      }}
    >
      {children}
    </h2>
  );
}

function comoEntra(providers: string[]): string {
  const google = providers.includes('google');
  const clave = providers.includes('email');
  if (google && clave) return 'Google y contraseña';
  if (google) return 'Google';
  if (clave) return 'Contraseña';
  return 'Sin identidad';
}

function ultimoAcceso(iso: string | null): string {
  if (!iso) return 'Nunca ha entrado';
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return 'Entró hoy';
  if (dias === 1) return 'Entró ayer';
  if (dias < 30) return `Entró hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return `Entró hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' });
}
