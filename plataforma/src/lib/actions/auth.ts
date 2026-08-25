'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { splitLoginIdentifier, staffUsernameEmail } from '@/lib/staff-email';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { resolveStaffDestination } from '@/lib/auth/destination';
import { logPanelAccess } from '@/lib/auth/access-log';
import { writeSessionActivity } from '@/lib/auth/session-activity';

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
 * Cuando no se puede, dice POR QUÉ: "no sé de qué restaurante hablas" y "ese
 * restaurante no existe" se arreglan de formas distintas, y una sola frase
 * para las dos manda a la persona a revisar lo que estaba bien.
 */
type LoginEmail =
  | { email: string }
  | { fail: 'sin-restaurante' | 'restaurante-desconocido' };

async function resolveLoginEmail(entrada: string, tenantSlug: string | null): Promise<LoginEmail> {
  const parsed = splitLoginIdentifier(entrada, tenantSlug);
  // Usuario suelto en un sitio sin restaurante (el dominio raíz), o usuario
  // mal escrito: en los dos casos lo que falta es la dirección del local.
  if (!parsed) return { fail: 'sin-restaurante' };
  if (parsed.kind === 'email') return { email: parsed.email };

  const db = createServiceClient();
  const { data } = await db.from('restaurants').select('id').eq('slug', parsed.slug).maybeSingle();
  if (!data?.id) return { fail: 'restaurante-desconocido' };

  return { email: staffUsernameEmail(data.id as string, parsed.username) };
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
  const resuelto = await resolveLoginEmail(entrada, tenantSlug);
  if ('fail' in resuelto) {
    // Decirle "usuario o contraseña incorrectos" sería mentirle: la
    // credencial puede estar perfecta y lo que falta es DE QUÉ local
    // hablamos. El mensaje enseña el formato, porque quien llega aquí
    // normalmente ni sabe que existe.
    return {
      error: resuelto.fail === 'restaurante-desconocido'
        ? 'No encontramos ese restaurante. Revisa la dirección que va después del @.'
        : 'Falta el restaurante: escribe tu usuario con la dirección de tu local detrás, así carlos@turestaurante. Si eres el dueño, entra con tu correo completo.',
    };
  }
  const email = resuelto.email;

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

  // Arranca el reloj de inactividad (checklist 2026-08-25 §2) desde este
  // mismo login, en vez de esperar a que el heartbeat del panel la escriba
  // en el próximo render — igual que el PIN escribe su marca al validar.
  await writeSessionActivity(signInData.user.id);

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
