import { redirect } from 'next/navigation';
import { getStaffSessionRaw } from '@/lib/supabase/server';
import { destinoTrasSegundoFactor } from '@/lib/auth/segundo-factor-destino';
import DosPasosClient from './dos-pasos-client';

export const metadata = {
  title: 'Verificación en dos pasos — Leogin',
  robots: { index: false, follow: false },
};

/**
 * El segundo paso del acceso (PLAN_ACCESO_Y_MONITOREO, ACC-01): aquí llega
 * quien ya dio su contraseña o su Google pero debe el código de su app
 * autenticadora — hoy, el Super Admin. Mientras no lo escriba, para el resto
 * del sitio no tiene sesión (`getStaffUser`) y la base no le enseña nada
 * (migración 137).
 */
export default async function DosPasosPage() {
  const { res, paso } = await getStaffSessionRaw();
  if (!res.data.user) redirect('/admin/login');
  // Ya verificado (o no le toca): a donde iba. También es lo que pinta la
  // respuesta de la acción que acaba de verificar el código (ver
  // destinoTrasSegundoFactor), así que tiene que ser el MISMO destino.
  if (paso === 'listo') redirect(await destinoTrasSegundoFactor(res.data.user.id));

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <DosPasosClient paso={paso} correo={res.data.user.email ?? null} />
    </main>
  );
}
