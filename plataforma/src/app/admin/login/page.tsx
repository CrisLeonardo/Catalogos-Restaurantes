import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getStaffSessionRaw } from '@/lib/supabase/server';
import { DEMO_SLUG, authPathFor } from '@/lib/tenant';
import { getBareLoginSlug, getResumeSession } from '@/lib/auth/resume';
import { getAgentHubInfo } from '@/lib/print-agent';
import { isGoogleAuthEnabled } from '@/lib/auth-config';
import { getPinAccess, readDeviceId, restaurantIdForDevice } from '@/lib/auth/trusted-device';
import LoginClient from '@/app/login/login-client';

/**
 * Página de login dentro del scope /admin/ de la PWA.
 * Misma UI que /login pero en una ruta dentro del scope del admin manifest,
 * lo que permite que la app admin standalone maneje la sesión sin salir de scope.
 * Es también el LOGIN CENTRAL de Leogin Desktop (sin tenant): si ya hay una
 * sesión de personal viva en el dominio, ofrece "Continuar como {nombre}".
 */
/* Sin metadata propia, esta pantalla heredaba el título del menú público del
   tenant y la pestaña del navegador decía "Menú en línea" mientras el dueño
   estaba escribiendo su contraseña. */
export const metadata = {
  title: 'Acceso al panel — Leogin',
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string }>;
}) {
  // Segundo factor (ACC-01): quien ya dio su contraseña o su Google pero
  // debe el código de su app no tiene nada que hacer en un login — vuelve a
  // esa pantalla (desde ahí puede salir y entrar con otra cuenta). Es por
  // donde llega el Super Admin cuando /super lo rebota sin sesión.
  if ((await getStaffSessionRaw()).paso !== 'listo') redirect('/admin/dos-pasos');

  const cabeceras = await headers();
  const slug = cabeceras.get('x-tenant-slug');
  const authError = (await searchParams).auth_error === '1';
  // ¿Se está pintando como RESPUESTA de una acción (el propio login)? Next
  // vuelve a pintar la página al escribirse las cookies de la sesión, y si
  // aquí se redirigiera, esa redirección le ganaría al destino que devolvió
  // login() — el dueño acababa en «Continuar como» en vez de en Mi cuenta.
  const pintadaDeAccion = cabeceras.has('next-action');

  // Login en seco, dominio raíz, sin ninguna pista de a qué restaurante
  // pertenece este aparato. Es justo donde caen `logout()` y "Cambiar de
  // usuario" tras cerrar sesión sin que hubiera tenant que arrastrar, y
  // también un ícono/favorito abierto semanas después. Antes de rendirse a
  // un formulario en blanco, se pregunta si ESTE aparato ya demostró ser de
  // un restaurante (PIN correcto alguna vez, o autorizado a mano en
  // Personal → Dispositivos) — `restaurant_devices` no depende de ninguna
  // sesión ni cookie de actividad, así que sigue reconociendo el aparato
  // aunque pasen días o semanas sin usarlo.
  if (!slug && !authError && !pintadaDeAccion) {
    const deviceId = await readDeviceId();
    const restaurantIdConocido = deviceId ? await restaurantIdForDevice(deviceId) : null;
    const slugConocido = await getBareLoginSlug(restaurantIdConocido);
    if (slugConocido) redirect(authPathFor('/admin/login', slugConocido));
  }

  let restaurantName: string | null = null;
  let restaurantId: string | null = null;
  let logoUrl: string | null = null;

  if (slug && slug !== DEMO_SLUG) {
    try {
      const data = await getRestaurantBySlug(slug);
      if (data) {
        restaurantName = data.restaurant.name;
        restaurantId = data.restaurant.id;
        logoUrl = data.resolved.config.pwaIconUrl ?? data.resolved.config.logoUrl ?? null;
      }
    } catch {
      /* sin BD → branding Leogin */
    }
  }

  // Fallback del hub local (Fase 2 offline): si el PIN falla por conectividad
  // intermitente justo al enviarlo, staff-pin-login.tsx reintenta contra el
  // hub con esto — nunca abre sesión por sí solo, solo identifica al operador.
  let hubUrl: string | null = null;
  let hubToken: string | null = null;
  // Candado de dispositivos (migración 112) — ver /login/page.tsx.
  let pinAllowed = true;
  let pinTrusted = false;
  if (restaurantId) {
    try {
      const hub = await getAgentHubInfo(restaurantId);
      hubUrl = hub.hubUrl;
      hubToken = hub.hubToken;
    } catch {
      /* sin agente vinculado → sin fallback offline */
    }
    try {
      const access = await getPinAccess(restaurantId);
      pinAllowed = access.allowed;
      pinTrusted = access.trusted;
    } catch {
      /* sin BD → se deja como estaba */
    }
  }

  // pinTrusted tiene que estar resuelto ANTES de esto — ver /login/page.tsx.
  let resume = null;
  try {
    resume = await getResumeSession({ restaurantId, pinTrusted });
  } catch {
    /* sin sesión utilizable → login normal */
  }

  return (
    <LoginClient
      restaurantName={restaurantName}
      restaurantId={restaurantId}
      logoUrl={logoUrl}
      slug={slug}
      resume={resume}
      hubUrl={hubUrl}
      hubToken={hubToken}
      googleEnabled={isGoogleAuthEnabled()}
      authError={authError}
      pinAllowed={pinAllowed}
      pinTrusted={pinTrusted}
    />
  );
}
