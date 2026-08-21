import { headers } from 'next/headers';
import { emailEnabled } from '@/lib/email';
import RecuperarClient from './recuperar-client';

export const metadata = {
  title: 'Recuperar contraseña — Leogin',
  robots: { index: false, follow: false },
};

/**
 * "Olvidé mi contraseña". Fuera de (protected): quien llega aquí, por
 * definición, no puede iniciar sesión.
 *
 * Hay DOS pantallas según haya proveedor de correo o no, y la decisión se
 * toma en el servidor para que no parpadee:
 *
 *  · Sin proveedor (hoy) → se atiende por WhatsApp y Leogin repone la
 *    contraseña a mano. Es una decisión deliberada mientras la cartera de
 *    clientes sea pequeña: no vale la pena pagar —ni depender de— otra
 *    plataforma para unos pocos mensajes al mes, y el rescate manual ya
 *    existe en el super admin.
 *  · Con proveedor → vuelve sola la pantalla de siempre (el enlace al
 *    correo). No hay que tocar nada: basta con configurar `RESEND_API_KEY`.
 */
export default async function RecuperarPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const estado = (await searchParams).estado;
  // Para el mensaje de WhatsApp: saber de qué restaurante escribe ahorra la
  // primera pregunta de la conversación.
  const slug = (await headers()).get('x-tenant-slug');

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <RecuperarClient
        expirado={estado === 'vencido'}
        porCorreo={emailEnabled()}
        slug={slug}
      />
    </main>
  );
}
