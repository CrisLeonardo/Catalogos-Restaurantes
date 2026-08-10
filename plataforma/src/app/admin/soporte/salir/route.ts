import { NextResponse } from 'next/server';
import { SUPPORT_COOKIE, supportCookieOptions } from '@/lib/auth/support-session';
import { rootDomainForUrls } from '@/lib/tenant';

/**
 * Salida del modo soporte. Es un GET (un enlace en la franja roja, no un
 * formulario) porque solo BORRA el pase: lo peor que puede provocar un enlace
 * disparado sin querer es que el Super Admin tenga que volver a confirmar.
 * Conceder el pase, que es la operación con consecuencias, sí exige POST
 * (ver ../actions.ts).
 */
export async function GET() {
  // El panel del super admin vive en el dominio RAÍZ, no en el subdominio del
  // restaurante que se está dejando.
  const root = rootDomainForUrls();
  const proto = root.includes('localhost') || root.startsWith('127.') ? 'http' : 'https';
  const destination = new URL('/super/restaurantes', `${proto}://${root}`);

  const response = NextResponse.redirect(destination);
  response.cookies.set(SUPPORT_COOKIE, '', { ...supportCookieOptions(), maxAge: 0 });
  return response;
}

// El pase es una cookie: no hay nada que cachear y una respuesta cacheada
// dejaría al Super Admin "saliendo" sin que se borre nada.
export const dynamic = 'force-dynamic';
