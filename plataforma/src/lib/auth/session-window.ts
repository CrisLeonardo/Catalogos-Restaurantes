/* ============================================================
   CUÁNTO VIVE UNA SESIÓN SIN USO — la decisión, sin dependencias
   ------------------------------------------------------------
   PLAN_ACCESO_Y_MONITOREO_2026-10-08, ACC-08. Sustituye a la decisión del
   2026-08-25 («un solo umbral, sin excepción por tipo de aparato»), que
   cerraba a los 30 min también la sesión del dueño en SU celular: abría la
   app a mirar el cierre una hora después y tenía que volver a entrar.

   El problema que los 30 min resolvían era el APARATO COMPARTIDO del local
   (un mesero tomando la tablet con la sesión del dueño abierta). Así que:

     · aparato del local (de confianza o PC principal) → 30 min, como antes;
     · Super Admin → 30 min en cualquier aparato (ve a todos los clientes);
     · cualquier otro aparato (el celular o la compu personal) → 7 días.

   Lo que hace segura la sesión larga es ACC-09: lo delicado (borrar un
   restaurante, sacar el respaldo, crear llaves de API…) vuelve a pedir la
   contraseña aunque la sesión siga abierta (lib/auth/reauth.ts).
   ============================================================ */

export const VENTANA_CORTA_MS = 30 * 60_000;
export const VENTANA_LARGA_MS = 7 * 24 * 60 * 60_000;

export type TipoVentana = 'corta' | 'larga';

export function tipoDeVentana(input: { role: string | null | undefined; aparatoDelLocal: boolean }): TipoVentana {
  if (input.role === 'SUPER_ADMIN') return 'corta';
  if (input.aparatoDelLocal) return 'corta';
  return 'larga';
}

export function msDeVentana(tipo: TipoVentana): number {
  return tipo === 'corta' ? VENTANA_CORTA_MS : VENTANA_LARGA_MS;
}
