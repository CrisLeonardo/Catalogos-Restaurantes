import { redirect } from 'next/navigation';
import { Glass } from '@/components/glass';
import WalletGoogleButton from '@/components/cuenta/wallet-google-button';
import { getWalletUser } from '@/lib/supabase/server';
import { isGoogleAuthEnabled } from '@/lib/auth-config';
import { urlDeCanje, urlSinPuente, viaSegura, vueltaSegura } from '@/lib/cuenta/puente';
import { crearPuente, restauranteParaPuente, yaSeUnio } from '@/lib/cuenta/puente-db';
import PermisoPuente from './permiso-puente';

export const dynamic = 'force-dynamic';

/**
 * `/billetera/puente?r=<slug>&via=<sub|m>&vuelta=<ruta>`
 * (PLAN_BILLETERA_COMENSAL_2026-10-25, BIL-02 pasos 1-3).
 *
 *  · Sin cuenta iniciada → «Continuar con Google», que vuelve aquí mismo.
 *  · Ya unido a ese restaurante → código de un solo uso y directo al canje.
 *  · Primera vez → se pide permiso; la cuenta no se comparte sin un «Unirme».
 *
 * En todos los casos hay un «Seguir sin cuenta» que vuelve al menú tal cual.
 */
export default async function PuentePage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string; via?: string; vuelta?: string }>;
}) {
  const params = await searchParams;
  const via = viaSegura(params.via);
  const vuelta = vueltaSegura(params.vuelta);
  const restaurante = params.r ? await restauranteParaPuente(params.r) : null;

  if (!restaurante) {
    return (
      <Glass variant="solid" style={{ padding: '28px 22px', textAlign: 'center' }}>
        <p style={{ fontSize: 15, color: 'var(--u-text-2)', margin: 0 }}>
          Este restaurante no está disponible.
        </p>
      </Glass>
    );
  }

  const sinCuenta = urlSinPuente(restaurante.slug, via, vuelta);
  const user = await getWalletUser();

  if (user && (await yaSeUnio(user.id, restaurante.id))) {
    const codigo = await crearPuente(user.id, restaurante.id, vuelta);
    // Sin código (la base no contestó) se sigue sin sesión: el comensal
    // solo quería ver el menú.
    redirect(codigo ? urlDeCanje(restaurante.slug, via, codigo) : sinCuenta);
  }

  const aqui = `/billetera/puente?${new URLSearchParams({ r: restaurante.slug, via, vuelta }).toString()}`;

  return (
    <Glass variant="solid" style={{ padding: '28px 22px' }}>
      <h1 style={{ fontSize: 21, fontWeight: 700, margin: '0 0 8px', color: 'var(--u-text)' }}>
        Entrar a {restaurante.nombre}
      </h1>
      {user ? (
        <PermisoPuente
          slug={restaurante.slug}
          nombre={restaurante.nombre}
          via={via}
          vuelta={vuelta}
          email={user.email ?? ''}
          sinCuenta={sinCuenta}
        />
      ) : (
        <>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--u-text-2)', margin: '0 0 20px' }}>
            Con tu cuenta Leogin, {restaurante.nombre} te reconoce y guarda tus puntos y pedidos.
            Es la misma cuenta para todos los restaurantes Leogin.
          </p>
          {isGoogleAuthEnabled() ? (
            <WalletGoogleButton next={aqui} />
          ) : (
            <p style={{ fontSize: 14, color: 'var(--u-text-3)', margin: 0 }}>
              El acceso con Google todavía no está activo.
            </p>
          )}
          <a href={sinCuenta} style={{ display: 'block', textAlign: 'center', marginTop: 16, fontSize: 14, color: 'var(--u-text-3)' }}>
            Seguir sin cuenta
          </a>
        </>
      )}
    </Glass>
  );
}
