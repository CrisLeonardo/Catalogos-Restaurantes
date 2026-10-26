import { Glass } from '@/components/glass';
import WalletGoogleButton from '@/components/cuenta/wallet-google-button';
import WalletSignOut from '@/components/cuenta/wallet-sign-out';
import { getWalletUser } from '@/lib/supabase/server';
import { isGoogleAuthEnabled } from '@/lib/auth-config';
import { urlDelPuente } from '@/lib/cuenta/puente';
import { restaurantesUnidos } from '@/lib/cuenta/puente-db';
import { RestauranteFila } from './restaurante-fila';

export const dynamic = 'force-dynamic';

/**
 * «Mis restaurantes» — la casa de la cuenta Leogin del comensal.
 *
 * Fase 1 (PLAN_BILLETERA_COMENSAL_2026-10-25): entrar con Google y la lista
 * de restaurantes a los que se unió, cada uno con su entrada por el puente.
 * Los puntos, los pedidos y la última visita llegan en la Fase 2.
 */
export default async function BilleteraPage({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string }>;
}) {
  const { auth_error } = await searchParams;
  const user = await getWalletUser();

  if (!user) {
    return (
      <Glass variant="solid" style={{ padding: '28px 22px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', color: 'var(--u-text)' }}>
          Tu cuenta Leogin
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--u-text-2)', margin: '0 0 20px' }}>
          Una sola cuenta para todos tus restaurantes. Entra una vez y cada restaurante Leogin te
          reconoce, sin registrarte de nuevo.
        </p>
        {auth_error && (
          <p role="alert" style={{ fontSize: 14, color: 'var(--c-danger, #b42318)', margin: '0 0 14px' }}>
            No se pudo entrar con Google. Intenta otra vez.
          </p>
        )}
        {isGoogleAuthEnabled() ? (
          <WalletGoogleButton />
        ) : (
          <p style={{ fontSize: 14, color: 'var(--u-text-3)', margin: 0 }}>
            El acceso con Google todavía no está activo.
          </p>
        )}
      </Glass>
    );
  }

  const restaurantes = await restaurantesUnidos(user.id);
  const nombre = (user.user_metadata?.full_name as string | undefined)?.split(' ')[0];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', color: 'var(--u-text)' }}>
          {nombre ? `Hola, ${nombre}` : 'Mis restaurantes'}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--u-text-3)', margin: 0, overflowWrap: 'anywhere' }}>
          {user.email}
        </p>
      </div>

      <Glass variant="solid" style={{ padding: restaurantes.length ? 6 : '24px 20px' }}>
        {restaurantes.length === 0 ? (
          <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--u-text-2)', margin: 0 }}>
            Todavía no te has unido a ningún restaurante. Cuando abras el menú de uno, toca
            «Entrar con mi cuenta Leogin» y aparecerá aquí.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {restaurantes.map((r) => (
              <li key={r.id}>
                {/* Por el link estable (`/m/<slug>`): mismo origen que la
                    billetera, así la PWA instalada no salta al navegador (BIL-03). */}
                <RestauranteFila nombre={r.nombre} logoUrl={r.logoUrl} href={urlDelPuente(r.slug, 'm', '/')} />
              </li>
            ))}
          </ul>
        )}
      </Glass>

      <div style={{ textAlign: 'center' }}>
        <WalletSignOut />
      </div>
    </div>
  );
}
