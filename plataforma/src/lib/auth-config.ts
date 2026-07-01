/**
 * Login con Google para comensales. Controlado por variable de entorno para
 * poder activarlo solo cuando la config externa (Supabase + Google Cloud)
 * esté lista — ver docs/GOOGLE_AUTH.md antes de poner esta variable en 1.
 */
export function isGoogleAuthEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED;
  return v === '1' || v === 'true';
}
