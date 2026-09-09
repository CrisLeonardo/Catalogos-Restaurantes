/* ============================================================
   QUÉ SE LE PUEDE HACER A UNA CUENTA, Y QUÉ NO (fase 2)
   ------------------------------------------------------------
   Las reglas del rescate, aparte de la acción que las aplica y de la
   pantalla que las explica, porque los tres sitios tienen que decir
   exactamente lo mismo: si el formulario deja escribir algo que la
   acción va a rechazar, la persona que está al teléfono se lleva un
   error después de haber prometido que ya estaba.

   Cada impedimento existe porque saltárselo rompe algo concreto:

     · GOOGLE — su identidad en Google sigue apuntando al correo viejo.
       Cambiarlo por aquí no la mueve: la próxima vez que entre con el
       botón de Google se crea (o se reencuentra) por el correo de
       antes, y esa persona acaba con dos cuentas y sus restaurantes
       repartidos entre las dos.

     · PIN — su correo no es un correo. Es
       `u.<restaurante>.<usuario>@staff.leogin.internal`, y de ahí se
       leen el restaurante y el usuario (`parseStaffUsername`). Editarlo
       a mano rompe el login del local.

   No se comprueba aquí quién llama ni si el objetivo es un super admin:
   eso es autorización y vive en la acción, con la sesión delante.
   ============================================================ */

import { isSyntheticStaffEmail } from '@/lib/staff-email';

/** Lo poco que hace falta saber de la cuenta para decidir. */
export type CuentaParaRescate = {
  email: string | null;
  providers: string[];
  esPin: boolean;
};

/** Lo que descalifica a la CUENTA, sea cual sea el correo que se escriba. */
export type ImpedimentoDeCuenta = 'google' | 'pin' | null;

export type ImpedimentoCorreo =
  | NonNullable<ImpedimentoDeCuenta>
  | 'formato'
  | 'dominio-interno'
  | 'sin-cambio'
  | null;

export type ImpedimentoEnlace =
  | 'pin'
  | 'sin-correo'
  | 'sin-proveedor'
  | null;

const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Por qué esta CUENTA no admite que se le cambie el correo, escriba lo que
 * escriba quien mira, o `null`.
 *
 * Aparte para que la pantalla pueda apagar el formulario y explicarlo ANTES
 * de que nadie teclee nada: enseñar un campo que va a rechazar cualquier
 * cosa es hacer perder el tiempo justo a quien está resolviendo un problema.
 */
export function impedimentoDeCuentaParaCorreo(cuenta: CuentaParaRescate): ImpedimentoDeCuenta {
  if (cuenta.providers.includes('google')) return 'google';
  if (cuenta.esPin) return 'pin';
  return null;
}

/**
 * Por qué NO se puede poner `nuevo` como correo de esta cuenta, o `null`
 * si se puede.
 *
 * El orden importa: primero lo que descalifica a la CUENTA —y da igual qué
 * se escriba—, después lo que descalifica al CORREO. Al revés, a alguien
 * con cuenta de Google que además tecleó mal el correo se le diría
 * «escribe un correo válido», que le manda a corregir un campo que no le
 * iba a servir de nada.
 */
export function impedimentoParaCambiarCorreo(
  cuenta: CuentaParaRescate,
  nuevo: string,
): ImpedimentoCorreo {
  const deCuenta = impedimentoDeCuentaParaCorreo(cuenta);
  if (deCuenta) return deCuenta;

  const email = nuevo.trim().toLowerCase();
  if (!FORMATO_CORREO.test(email)) return 'formato';
  if (isSyntheticStaffEmail(email)) return 'dominio-interno';
  if (email === (cuenta.email ?? '').trim().toLowerCase()) return 'sin-cambio';
  return null;
}

/** Por qué NO se le puede mandar el enlace de recuperación, o `null`. */
export function impedimentoParaEnlace(
  cuenta: CuentaParaRescate,
  correoDisponible: boolean,
): ImpedimentoEnlace {
  // El buzón se comprueba antes que el proveedor: aunque mañana se
  // configure Resend, a una credencial de PIN seguirá sin poder mandársele
  // nada, y decir «falta RESEND_API_KEY» haría creer que sí.
  if (cuenta.esPin) return 'pin';
  if (!cuenta.email) return 'sin-correo';
  if (!correoDisponible) return 'sin-proveedor';
  return null;
}
