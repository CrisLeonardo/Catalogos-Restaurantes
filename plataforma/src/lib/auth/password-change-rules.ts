/* ============================================================
   CAMBIAR LA CONTRASEÑA — las reglas, sin dependencias
   ------------------------------------------------------------
   Aparte de la acción (lib/actions/password-change.ts) para poder probarlas,
   y porque la pantalla tiene que enseñar lo mismo que la acción decide.
   ============================================================ */

import { isSyntheticStaffEmail } from '@/lib/staff-email';

type UsuarioMinimo = {
  email?: string | null;
  identities?: { provider: string }[] | null;
};

/** Cuentas de PIN: `staff-<hex>@staff.leogin.internal`. Las de usuario del
    restaurante son `u.<id>.<usuario>@…` y SÍ tienen contraseña. */
function esCuentaDePin(email: string): boolean {
  return isSyntheticStaffEmail(email) && email.startsWith('staff-');
}

export type PuedeCambiar = { ok: true } | { ok: false; motivo: string; google?: boolean };

/** ¿Esta cuenta tiene una contraseña que cambiar desde aquí? */
export function puedeCambiarContrasena(user: UsuarioMinimo): PuedeCambiar {
  const email = user.email ?? '';
  if (!email) return { ok: false, motivo: 'Esta cuenta no tiene contraseña.' };
  if (esCuentaDePin(email)) {
    return { ok: false, motivo: 'Entras con PIN. Si quieres cambiarlo, pídeselo al dueño del restaurante.' };
  }
  const proveedores = (user.identities ?? []).map((i) => i.provider);
  // Sin identidades (respuesta vieja de Auth) se asume correo: es el caso
  // de todas las cuentas creadas por el servidor.
  if (proveedores.length > 0 && !proveedores.includes('email')) {
    return {
      ok: false,
      google: proveedores.includes('google'),
      motivo: proveedores.includes('google')
        ? 'Entras con Google, así que tu contraseña es la de tu cuenta de Google y se cambia allí.'
        : 'Esta cuenta no entra con contraseña.',
    };
  }
  return { ok: true };
}

/** A dónde se manda a quien debe cambiar su contraseña (ACC-05). */
export const CAMBIO_OBLIGATORIO = '/mi-cuenta/seguridad?primera=1';

/**
 * ¿Tiene que cambiar la contraseña antes de seguir? (ACC-05)
 *
 * La marca la pone el servidor cuando la contraseña la eligió OTRO: el
 * dueño al dar de alta o reponerle la contraseña a un administrador, o
 * Leogin al crear un acceso o rescatar una cuenta. Así el dueño no conoce
 * para siempre la contraseña de su gerente, y la bitácora vuelve a decir
 * quién entró de verdad. Solo el servidor escribe `app_metadata`.
 */
export function debeCambiarContrasena(user: { app_metadata?: Record<string, unknown> | null }): boolean {
  return user.app_metadata?.debe_cambiar_contrasena === true;
}

/** Mensaje de error, o null si la contraseña nueva vale. */
export function validarContrasenaNueva(input: { actual: string; nueva: string; nueva2: string }): string | null {
  if (!input.actual) return 'Escribe tu contraseña actual.';
  if (input.nueva.length < 8) return 'La contraseña nueva debe tener al menos 8 caracteres.';
  if (input.nueva !== input.nueva2) return 'Las dos contraseñas nuevas no coinciden.';
  if (input.nueva === input.actual) return 'La contraseña nueva tiene que ser distinta de la actual.';
  return null;
}
