import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { readResetPass, RESET_COOKIE } from '@/lib/auth/reset-session';
import NuevaClaveClient from './nueva-clave-client';

export const metadata = {
  title: 'Nueva contraseña — Leogin',
  robots: { index: false, follow: false },
};

/**
 * Pantalla de contraseña nueva. Solo se llega con el pase que emite
 * /admin/auth/recuperar al canjear el enlace del correo: tener sesión no
 * basta (ver lib/auth/reset-session.ts).
 */
export default async function NuevaClavePage() {
  const pass = readResetPass((await cookies()).get(RESET_COOKIE)?.value);
  if (!pass) redirect('/admin/recuperar?estado=vencido');

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <NuevaClaveClient />
    </main>
  );
}
