'use server';

/* ============================================================
   ALTA DE CUENTA (migración 047, partida en dos en la 113)
   ------------------------------------------------------------
   Esta acción crea UNA CUENTA. Nada más. El restaurante se crea después,
   desde Mi cuenta (`createAnotherRestaurant` en lib/actions/mi-cuenta.ts).

   Antes creaba las dos cosas de un tirón, y eso era lo que ataba una cuenta
   a un restaurante: para abrir el segundo local había que inventarse otro
   correo. Con las membresías eso dejó de ser cierto en todo el producto
   menos aquí, que era la última puerta que seguía pensando "una cuenta, un
   restaurante". Ahora:

     · `/registro`        → tu cuenta (esto).
     · `/mi-cuenta/nuevo` → tus restaurantes, el primero y el quinto, con
       las mismas reglas de plan, prueba y cobro para todos.

   DOS FORMAS DE CREARLA (lo demás es idéntico):
     · correo + contraseña → se crea el usuario de Auth aquí mismo.
     · cuenta de Google    → el usuario de Auth YA existe: el asistente mandó
       a Google antes de enviar el formulario y volvió con la sesión abierta
       (ver /admin/auth/google/callback). Aquí solo se le cuelga el perfil.
       La identidad se relee de la sesión, nunca del formulario.

   Seguridad: rate-limit por IP + validación estricta de entrada.
   Usa service role; no requiere sesión previa.
   ============================================================ */

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { sendEmailVerification } from '@/lib/auth/email-verification';
import { isSyntheticStaffEmail } from '@/lib/staff-email';

export type SignupState = { error: string } | null;

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function signupAccount(
  prevState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  // ── Rate limit por IP (anti-abuso) ──────────────────────────
  const ip = clientIp(await headers());
  if (!(await rateLimit(`signup:${ip}`, 5, 60 * 60 * 1000))) {
    return { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' };
  }

  // ── ¿Con qué se está creando la cuenta? ─────────────────────
  // El campo del formulario es solo una pista: lo que manda es si hay una
  // sesión de Google viva. Si alguien pone `auth_provider=google` a mano sin
  // sesión, cae al alta normal y se le pedirá contraseña como a todo el mundo.
  const supabase = await createClient();
  const wantsGoogle = (formData.get('auth_provider') as string | null) === 'google';
  const googleUser = wantsGoogle ? (await supabase.auth.getUser()).data.user : null;
  const withGoogle = !!googleUser?.email;

  // Venía por Google pero la sesión ya no está (tardó, cerró sesión en otra
  // pestaña). Sin esto el formulario llegaba con el correo en blanco —porque
  // el asistente no lo pide cuando hay Google— y el error que veía era
  // "escribe un correo válido", que no dice nada de lo que de verdad pasó.
  if (wantsGoogle && !withGoogle) {
    return { error: 'Tu sesión de Google se cerró. Vuelve a pulsar "Registrarme con Google".' };
  }

  // ── Entrada ─────────────────────────────────────────────────
  const email = withGoogle
    ? googleUser!.email!.trim().toLowerCase()
    : (formData.get('email') as string)?.trim().toLowerCase();
  const password = (formData.get('password') as string) ?? '';
  const password2 = (formData.get('password2') as string) ?? '';
  const fullName = (formData.get('full_name') as string)?.trim() || null;
  const terms = formData.get('terms');

  if (!email || !validEmail(email)) return { error: 'Escribe un correo válido.' };
  // El dominio interno del personal por PIN no es de nadie: no recibe correo,
  // así que una cuenta ahí no podría ni recuperar su contraseña.
  if (isSyntheticStaffEmail(email)) return { error: 'Escribe un correo válido.' };
  if (!withGoogle) {
    if (password.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres.' };
    // La doble captura se valida TAMBIÉN aquí, no solo en el asistente: el
    // formulario manda campos ocultos y cualquiera puede saltarse el paso del
    // navegador. El correo ya no se pide dos veces —era un campo más en la
    // pantalla donde más gente abandona—: el dedazo se ataja mostrándolo
    // grande en el paso "Confirmar", antes de crear nada.
    if (password !== password2) return { error: 'Las dos contraseñas no coinciden.' };
  }
  if (terms !== 'on' && terms !== 'true') {
    return { error: 'Debes aceptar los términos para continuar.' };
  }

  const db = createServiceClient();

  // ── 1. Usuario de Auth ──────────────────────────────────────
  // Con Google ya existe (lo creó el propio inicio de sesión); solo se reusa.
  let userId: string;
  if (withGoogle) {
    userId = googleUser!.id;
  } else {
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createErr || !created?.user) {
      const m = createErr?.message?.toLowerCase() ?? '';
      if (m.includes('already') || m.includes('registered') || m.includes('exists')) {
        return { error: 'Ya existe una cuenta con ese correo. Inicia sesión en su lugar.' };
      }
      return { error: createErr?.message ?? 'No se pudo crear la cuenta.' };
    }
    userId = created.user.id;
  }

  // ── 2. Perfil, SIN restaurante ──────────────────────────────
  // `restaurant_id` nace en null a propósito: esta persona todavía no tiene
  // ninguno, y su acceso a los que cree viajará por `restaurant_members`.
  // El rol de dueño es lo que le deja crear el primero.
  const { data: existing } = await db
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (existing) {
    // Ya tenía cuenta en Leogin (se registró antes, o entró con este mismo
    // Google). No es un error: es alguien que ya está dentro y llegó al
    // formulario de alta por costumbre. Se le lleva a su casa.
    redirect('/mi-cuenta');
  }

  const { error: profErr } = await db.from('profiles').insert({
    id: userId,
    restaurant_id: null,
    role: 'RESTAURANT_OWNER',
    full_name: fullName,
    // Con Google el correo ya viene verificado por Google: marcarlo evita
    // pedirle que confirme un correo que nunca escribió (migración 109).
    ...(withGoogle ? { email_verified_at: new Date().toISOString() } : {}),
  });
  if (profErr) {
    // Si el usuario nació en esta misma petición, se deshace; el de Google no
    // se toca nunca — es su cuenta de Google, no una que hayamos creado.
    if (!withGoogle) await db.auth.admin.deleteUser(userId);
    return { error: 'No se pudo terminar el registro. Inténtalo de nuevo.' };
  }

  // ── 3. Confirmación del correo (suave, no bloquea) ──────────
  // La cuenta ya está viva; esto solo comprueba que el buzón existe y es
  // suyo. Hasta que abra el enlace, el panel se lo recuerda con un aviso.
  // Ver lib/auth/email-verification.ts para por qué no es un muro.
  if (!withGoogle) await sendEmailVerification(email);

  // ── 4. Iniciar sesión ───────────────────────────────────────
  // Con Google la sesión ya está abierta desde el callback: no hay nada que
  // hacer aquí (y no hay contraseña con la que entrar).
  if (!withGoogle) {
    try {
      await supabase.auth.signInWithPassword({ email, password });
    } catch {
      // Si no prendiera la sesión, /mi-cuenta manda al login y desde ahí
      // entra con el correo y la contraseña que acaba de elegir.
    }
  }

  // Su casa. Ahí crea su restaurante, que es el siguiente paso real.
  redirect('/mi-cuenta/nuevo');
}
