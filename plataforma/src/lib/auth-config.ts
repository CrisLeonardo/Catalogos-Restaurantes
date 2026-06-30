/**
 * Login con Google deshabilitado temporalmente por problemas de configuración.
 * Para reactivarlo: cambiar el return a la línea comentada de abajo y poner
 * NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=1 en el entorno.
 */
export function isGoogleAuthEnabled(): boolean {
  return false;
  // const v = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED;
  // return v === '1' || v === 'true';
}
