import RecuperarClient from './recuperar-client';

export const metadata = {
  title: 'Recuperar contraseña — Leogin',
  robots: { index: false, follow: false },
};

/**
 * "Olvidé mi contraseña". Fuera de (protected): quien llega aquí, por
 * definición, no puede iniciar sesión.
 */
export default async function RecuperarPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const estado = (await searchParams).estado;

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <RecuperarClient expirado={estado === 'vencido'} />
    </main>
  );
}
