'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { splitLoginIdentifier, staffUsernameEmail } from '@/lib/staff-email';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { resolveStaffDestination } from '@/lib/auth/destination';
import { logPanelAccess } from '@/lib/auth/access-log';

export type AuthState = { error: string } | null;

/**
 * Con qué correo se abre sesión, a partir de lo que la persona escribió.
 *
 * Se puede escribir dos cosas en ese campo:
 *  · un CORREO de verdad (el dueño) → se usa tal cual;
 *  · un USUARIO del restaurante (el administrador que dio de alta el dueño)
 *    → se traduce al correo interno de ese local.
 *
 * El usuario se resuelve contra el restaurante del subdominio, que es donde
 * su credencial vale. Desde el dominio raíz —donde no hay restaurante que
 * mirar— se acepta también `usuario@direccion-del-restaurante`, para que
 * quien llegue por ahí no se quede sin poder entrar.
 *
 * Devuelve null cuando no hay forma de saber de qué restaurante se habla.
 */
async function resolveLoginEmail(entrada: string, tenantSlug: string | null): Promise<string | null> {
  const parsed = splitLoginIdentifier(entrada, tenantSlug);
  if (!parsed) return null;
  if (parsed.kind === 'email') return parsed.email;

  const db = createServiceClient();
  const { data } = await db.from('restaurants').select('id').eq('slug', parsed.slug).maybeSingle();
  if (!data?.id) return null;

  return staffUsernameEmail(data.id as string, parsed.username);
}

export async function login(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const entrada = (formData.get('email') as string)?.trim();
  const password = formData.get('password') as string;

  if (!entrada || !password) {
    return { error: 'Escribe tu correo o usuario y tu contraseña.' };
  }

  // Anti fuerza bruta: límite por IP (10 intentos / 5 min) y por IP+cuenta.
  // Se cuenta contra lo ESCRITO y antes de traducirlo, para que probar mil
  // usuarios contra un restaurante tampoco salga gratis.
  const cabeceras = await headers();
  const ip = clientIp(cabeceras);
  if (!(await rateLimit(`login:${ip}`, 10, 5 * 60_000)) ||
      !(await rateLimit(`login:${ip}:${entrada.toLowerCase()}`, 6, 5 * 60_000))) {
    return { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' };
  }

  const tenantSlug = cabeceras.get('x-tenant-slug');
  const email = await resolveLoginEmail(entrada, tenantSlug);
  if (!email) {
    // Escribió un usuario suelto en un sitio sin restaurante (el dominio
    // raíz). Decirle "usuario o contraseña incorrectos" sería mentirle: la
    // credencial puede estar perfecta y el problema es la dirección.
    return { error: 'Entra desde la dirección de tu restaurante, o escribe tu correo completo.' };
  }

  const supabase = await createClient();
  const { data: signInData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) return { error: 'Usuario o contraseña incorrectos.' };

  // Redirigir según rol
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions, restaurant_id')
    .eq('id', signInData.user.id)
    .single();

  if (!profile) redirect('/admin/login');

  // Bitácora de accesos (migración 109): el dueño la ve en /admin/personal.
  await logPanelAccess({
    profileId: signInData.user.id,
    restaurantId: (profile.restaurant_id as string | null) ?? null,
    method: 'password',
    headers: await headers(),
  });

  // Redirigir al subdominio del restaurante SIEMPRE que no sea ya el actual —
  // no solo cuando el login se hizo desde el dominio raíz. Antes esto solo
  // comparaba "¿estamos en la raíz?" (isRootDomain), así que loguearse con la
  // cuenta del restaurante B mientras se está en el subdominio del
  // restaurante A caía al `redirect('/admin/menu')` relativo de más abajo —
  // se quedaba en A y el candado de tenant de (protected)/layout.tsx
  // terminaba mandando al menú PÚBLICO de A en vez de al panel de B (bug
  // real: cuenta nueva de otro restaurante "no reconocida" solo en el
  // desktop, porque ahí es común arrancar ya posicionado en el subdominio de
  // un restaurante distinto al de la cuenta que se está probando).
  redirect(await resolveStaffDestination(supabase, profile as { role: string; permissions: string[] | null; restaurant_id: string | null }, tenantSlug, '?welcome=1'));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });
  redirect('/admin/login');
}

/** Logout desde el panel de grupo (vuelve al login del grupo). */
export async function logoutGroup() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/central/login');
}
