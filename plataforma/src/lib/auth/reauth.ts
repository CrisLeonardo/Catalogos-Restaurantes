import 'server-only';

import { cookies } from 'next/headers';
import { getStaffSessionRaw } from '@/lib/supabase/server';
import { mintToken, passCookieOptions, readToken } from '@/lib/auth/signed-token';
import { esReciente, REAUTH_VENTANA_MS } from '@/lib/auth/reauth-policy';

/* ============================================================
   «CONFIRMA QUE ERES TÚ» — la parte que habla con cookies y sesión
   ------------------------------------------------------------
   ACC-09. La regla está en reauth-policy.ts. Cada acción delicada empieza
   con:

     if (!(await identidadReciente())) return reauthRequerida();

   y la pantalla, antes de enviar, pregunta `necesitoReautenticar()` para
   abrir el diálogo ANTES (un formulario ya enviado se vacía en React 19 y
   no se podría reenviar igual). La comprobación de la acción es la que
   manda: la de la pantalla solo evita el viaje de ida y vuelta.
   ============================================================ */

const COOKIE = 'leogin_reauth';
const SCOPE = 'reauth';

/** ¿Quien llama demostró ser quien es hace menos de 10 min? */
export async function identidadReciente(): Promise<boolean> {
  const { res, autenticadoEn, paso } = await getStaffSessionRaw();
  const user = res.data.user;
  if (!user || paso !== 'listo') return false;

  // La sesión misma es nueva (acaba de entrar, o de volver con Google).
  if (esReciente(autenticadoEn)) return true;

  // O confirmó su contraseña en el diálogo hace poco. El pase va a nombre de
  // la cuenta: el de otra persona en el mismo navegador no vale.
  return readToken(SCOPE, (await cookies()).get(COOKIE)?.value) === user.id;
}

/** Deja constancia de que esta cuenta acaba de confirmar su identidad.
    Solo desde una Server Action o un Route Handler (escribe cookies). */
export async function marcarIdentidadConfirmada(userId: string): Promise<void> {
  (await cookies()).set(COOKIE, mintToken(SCOPE, userId, REAUTH_VENTANA_MS), {
    ...passCookieOptions(),
    // El vencimiento de verdad va firmado dentro; esto es solo limpieza.
    maxAge: Math.round(REAUTH_VENTANA_MS / 1000) + 60,
  });
}
