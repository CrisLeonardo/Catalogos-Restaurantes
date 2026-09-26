import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getStaffUser } from '@/lib/supabase/server';
import { getMyGroupScope } from '@/lib/db/group';
import LeoginLogo from '@/components/leogin-logo';
import { logout } from '@/lib/actions/auth';
import { isSessionStale, SESSION_SEEN_COOKIE } from '@/lib/auth/session-activity';
import SessionHeartbeat from '@/components/admin/session-heartbeat';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import MiCuentaNav from './mi-cuenta-nav';

export const dynamic = 'force-dynamic';

/**
 * EL MARCO DE MI CUENTA — el hogar de quien tiene restaurantes.
 *
 * Aquí se unieron las dos casas que tenía un dueño de varios locales: la
 * lista de sus restaurantes y el panel del grupo, que hasta ahora vivía en
 * otro subdominio (`grupo-central.dominio`) con su propio inicio de sesión,
 * porque nació cuando los grupos los creaba Leogin a mano. Hoy es una
 * pestaña más de esta misma pantalla, con la misma sesión.
 *
 * Las secciones (Resumen, Comparativa, Finanzas) aparecen en cuanto la
 * persona tiene un restaurante propio: mirar cómo va el negocio de un
 * vistazo, sin entrar al panel, sirve igual con uno que con cinco. Quién ve
 * cuál lo decide `getMyGroupScope` (ver MiCuentaNav).
 *
 * `/mi-cuenta/nuevo` queda FUERA de este marco a propósito: es un asistente
 * a pantalla completa, con su propia cabecera.
 */
export default async function MiCuentaPanelLayout({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    redirect('/');
  }

  const { data: { user } } = await getStaffUser();
  if (!user) redirect('/admin/login');

  // Checklist 2026-08-25 §2 — ver /admin/(protected)/layout.tsx. Mi cuenta
  // (dueño de grupo, o dueño con varios restaurantes) tampoco tenía ningún
  // candado de inactividad.
  const cookieStore = await cookies();
  if (isSessionStale(cookieStore.get(SESSION_SEEN_COOKIE)?.value, user.id)) {
    redirect('/admin/logout-operator');
  }

  const scope = await getMyGroupScope();

  /* El Toaster va aquí porque los avisos de las secciones consolidadas
     (exportar el Excel/PDF del grupo) los emite `useToastManager`, y sin un
     proveedor por encima la pantalla entera revienta. Lo daba el shell del
     panel viejo; al mudarse aquí se vino con él. */
  return (
    <ToastProvider>
    <SessionHeartbeat />
    <main style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
      <header
        className="glass-solid"
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none',
          height: 56, padding: '0 18px', display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        <LeoginLogo size={24} />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: 'var(--u-text-3)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.email}
        </span>
        <form action={logout}>
          <button
            type="submit"
            className="press"
            style={{
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: '6px 12px',
              borderRadius: 99, border: '1px solid var(--u-hair-2)',
              background: 'transparent', color: 'var(--u-text-2)',
            }}
          >
            Salir
          </button>
        </form>
      </header>

      <div style={{ flex: 1, width: '100%', maxWidth: 940, margin: '0 auto', padding: '30px 18px 72px' }}>
        {scope && (
          <MiCuentaNav
            isGroup={scope.isGroup}
            financeLocked={!scope.hasFinance}
            upgradeUrl={scope.upgradeUrl}
          />
        )}
        {children}
      </div>
    </main>
    <Toaster />
    </ToastProvider>
  );
}
