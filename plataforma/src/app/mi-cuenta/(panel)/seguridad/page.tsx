import { redirect } from 'next/navigation';
import { getStaffUser } from '@/lib/supabase/server';
import { debeCambiarContrasena, puedeCambiarContrasena } from '@/lib/auth/password-change-rules';
import { isSyntheticStaffEmail } from '@/lib/staff-email';
import { Icon } from '@/components/icons';
import CambiarContrasenaForm from './cambiar-contrasena-form';
import { destinoTrasSegundoFactor } from '@/lib/auth/segundo-factor-destino';

export const metadata = { title: 'Seguridad — Leogin' };
export const dynamic = 'force-dynamic';

const tarjeta: React.CSSProperties = {
  borderRadius: 'var(--radius-lg)', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14,
};

/**
 * SEGURIDAD DE TU CUENTA (PLAN_ACCESO_Y_MONITOREO, ACC-03).
 *
 * Vive en Mi cuenta y no dentro del panel de un restaurante porque la
 * contraseña es de la PERSONA, no del local: el dueño de tres restaurantes
 * tiene una sola. El panel enlaza aquí desde la tarjeta de sesión, que es
 * por donde llega el administrador con `usuario@restaurante`.
 */
export default async function SeguridadPage() {
  const { data: { user } } = await getStaffUser();
  if (!user) redirect('/admin/login');

  const puede = puedeCambiarContrasena(user);
  const usuarioDeRestaurante = isSyntheticStaffEmail(user.email);
  const conApp = (user.factors ?? []).some((f) => f.status === 'verified');
  // ACC-05: la eligió otro; hasta cambiarla no se puede ir a otra parte.
  const obligatorio = debeCambiarContrasena(user);
  const destino = obligatorio ? await destinoTrasSegundoFactor(user.id) : null;

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 560 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--u-text-3)', marginBottom: 8 }}>
          {usuarioDeRestaurante ? 'Tu usuario del restaurante' : user.email}
        </div>
        <h1 className="t-display" style={{ fontSize: 'clamp(22px, 4vw, 28px)', lineHeight: 1.15, margin: 0 }}>
          Seguridad de tu cuenta
        </h1>
      </div>

      {obligatorio && (
        <div
          role="status"
          style={{
            padding: '14px 16px', borderRadius: 'var(--radius-lg)', fontSize: 13, lineHeight: 1.6,
            background: 'color-mix(in srgb, var(--c-warn, #f59e0b) 14%, transparent)',
            border: '1px solid color-mix(in srgb, var(--c-warn, #f59e0b) 35%, transparent)',
            color: 'var(--u-text)',
          }}
        >
          <strong>Antes de seguir, cambia tu contraseña.</strong> La que usaste la eligió otra persona (tu jefe o
          Leogin). Pon una que solo sepas tú: así nadie más puede entrar con tu usuario.
        </div>
      )}

      <section className="glass" style={tarjeta}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="key" size={18} style={{ color: 'var(--u-text-3)' }} />
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--u-text)' }}>Contraseña</h2>
        </div>
        {puede.ok ? (
          <CambiarContrasenaForm destino={destino} />
        ) : (
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--u-text-3)', margin: 0 }}>{puede.motivo}</p>
        )}
      </section>

      {conApp && (
        <section className="glass" style={{ ...tarjeta, flexDirection: 'row', alignItems: 'center' }}>
          <Icon name="checkCircle" size={18} style={{ color: 'var(--c-success, #22c55e)', flexShrink: 0 }} />
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--u-text-2)', margin: 0 }}>
            <strong>Verificación en dos pasos activada.</strong> Al entrar te pedimos también el código de tu app
            autenticadora.
          </p>
        </section>
      )}
    </div>
  );
}
