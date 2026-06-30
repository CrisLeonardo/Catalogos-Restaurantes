/**
 * Configuración del login social de comensales.
 *
 * El botón "Continuar con Google" solo aparece si el proveedor está habilitado.
 * Así el código convive sin romper nada hasta que el restaurante/Leogin
 * configure Google en Supabase + Google Cloud (ver docs/GOOGLE_AUTH.md).
 *
 * Activar: poner NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=1 en el entorno.
 * (NEXT_PUBLIC_* se inyecta en build, sirve en servidor y navegador.)
 */
export function isGoogleAuthEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED;
  return v === '1' || v === 'true';
}
