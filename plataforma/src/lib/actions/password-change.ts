'use server';

/* ============================================================
   CAMBIAR LA CONTRASEÑA ESTANDO DENTRO
   ------------------------------------------------------------
   PLAN_ACCESO_Y_MONITOREO_2026-10-08, ACC-03. Hasta ahora la única forma de
   cambiar una contraseña era el enlace de "Olvidé mi contraseña", que sin
   RESEND_API_KEY no sale: todo cambio terminaba en un WhatsApp a Leogin.

   Sirve al dueño (correo + contraseña) y al administrador con
   `usuario@restaurante`. No aplica a:
     · cuentas solo de Google — su contraseña la lleva Google;
     · personal de PIN — su credencial es el PIN, que cambia el dueño.

   Se pide la contraseña ACTUAL aunque haya sesión: una sesión abierta y
   desatendida (la laptop de la oficina) no debe bastar para quedarse con la
   cuenta. Se comprueba con un cliente aparte que no toca las cookies.
   ============================================================ */

import { headers } from 'next/headers';
import { createClient as createPlainClient } from '@supabase/supabase-js';
import { createClient, getStaffUser } from '@/lib/supabase/server';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { debeCambiarContrasena, puedeCambiarContrasena, validarContrasenaNueva } from '@/lib/auth/password-change-rules';
import { createServiceClient } from '@/lib/supabase/service';

export type CambioState = { error: string } | { ok: true } | null;

export async function cambiarContrasena(_prev: CambioState, formData: FormData): Promise<CambioState> {
  const actual = String(formData.get('actual') ?? '');
  const nueva = String(formData.get('nueva') ?? '');
  const nueva2 = String(formData.get('nueva2') ?? '');

  const { data: { user } } = await getStaffUser();
  if (!user?.email) return { error: 'Tu sesión venció. Vuelve a entrar.' };

  const puede = puedeCambiarContrasena(user);
  if (!puede.ok) return { error: puede.motivo };

  const invalida = validarContrasenaNueva({ actual, nueva, nueva2 });
  if (invalida) return { error: invalida };

  // Mismo techo que el login: probar contraseñas desde una sesión robada
  // tampoco sale gratis.
  const ip = clientIp(await headers());
  if (!(await rateLimit(`pwd-cambio:${user.id}`, 5, 10 * 60_000)) ||
      !(await rateLimit(`pwd-cambio-ip:${ip}`, 20, 10 * 60_000))) {
    return { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' };
  }

  // ¿La actual es la buena? Con un cliente SIN cookies: si se usara el de la
  // sesión, este signIn reemplazaría la sesión del navegador.
  const aparte = createPlainClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error: errActual } = await aparte.auth.signInWithPassword({ email: user.email, password: actual });
  if (errActual) return { error: 'Tu contraseña actual no es correcta.' };
  // Esa comprobación abrió una sesión en Supabase: se cierra en el acto.
  await aparte.auth.signOut({ scope: 'local' });

  // Con la SESIÓN, no con la llave de administrador: medido contra Supabase
  // (2026-10-08), `admin.updateUserById` cierra TODAS las sesiones —también
  // la de quien está en esta pantalla—, mientras que el cambio hecho por la
  // propia sesión conserva la suya y cierra solo las de los demás aparatos.
  // Que es justo lo que quiere quien cambia la contraseña porque sospecha que
  // alguien más la tiene.
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === 'reauthentication_needed' || code === 'reauthentication_not_valid') {
      return { error: 'Por seguridad, sal, vuelve a entrar y cámbiala enseguida.' };
    }
    if (code === 'weak_password') {
      return { error: 'Esa contraseña es muy fácil de adivinar. Prueba con una más larga.' };
    }
    console.error('[password-change] updateUser falló:', error.message);
    return { error: 'No se pudo guardar la contraseña nueva. Inténtalo de nuevo.' };
  }

  // ACC-05: ya eligió la suya; se quita la marca de «debe cambiarla». Solo
  // esa clave (Auth mezcla `app_metadata`), y no cierra ninguna sesión
  // (comprobado contra Supabase).
  if (debeCambiarContrasena(user)) {
    await createServiceClient().auth.admin.updateUserById(user.id, {
      app_metadata: { debe_cambiar_contrasena: null },
    });
  }

  return { ok: true };
}
