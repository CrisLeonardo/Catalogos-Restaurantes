/* ============================================================
   SEGUNDO FACTOR — la decisión, sin dependencias
   ------------------------------------------------------------
   PLAN_ACCESO_Y_MONITOREO_2026-10-08, ACC-01. Vive aparte de quien habla
   con Supabase por la misma razón que tenant-guard.ts y pin-policy.ts: la
   regla que decide quién entra tiene que poder probarse de verdad.

   Quién lo necesita:
     · quien lleva la marca `app_metadata.requiere_segundo_factor` (la pone
       la migración 137 a todo SUPER_ADMIN, y solo el servidor la escribe);
     · quien ya tiene un factor VERIFICADO, sea quien sea: si alguien se lo
       puso, no tiene sentido dejarle entrar sin él.

   Y lo tiene cumplido cuando su sesión es `aal2`: en ESTA sesión ya
   escribió el código de su app autenticadora.
   ============================================================ */

export type Aal = 'aal1' | 'aal2' | null;

/** Lo mínimo del usuario de Supabase que hace falta para decidir. */
export type UsuarioConFactores = {
  app_metadata?: Record<string, unknown> | null;
  factors?: { status: string; factor_type?: string }[] | null;
};

export type PasoSegundoFactor =
  /** No lo necesita, o ya lo verificó en esta sesión. */
  | 'listo'
  /** Lo necesita y todavía no tiene app configurada: hay que inscribirla. */
  | 'inscribir'
  /** Ya tiene la app: falta el código de esta sesión. */
  | 'verificar';

function tieneFactorVerificado(user: UsuarioConFactores): boolean {
  return (user.factors ?? []).some((f) => f.status === 'verified');
}

/** ¿Esta cuenta tiene que entrar con segundo factor? */
export function exigeSegundoFactor(user: UsuarioConFactores): boolean {
  return user.app_metadata?.requiere_segundo_factor === true || tieneFactorVerificado(user);
}

/** Qué le falta a esta sesión para poder entrar. */
export function pasoSegundoFactor(user: UsuarioConFactores, aal: Aal): PasoSegundoFactor {
  if (!exigeSegundoFactor(user) || aal === 'aal2') return 'listo';
  return tieneFactorVerificado(user) ? 'verificar' : 'inscribir';
}

/**
 * El `aal` de un token de acceso, leído SIN verificar la firma.
 *
 * Solo se usa con un token que el servidor YA validó en esta misma petición
 * (getUser() contra Supabase Auth): aquí no se decide si es auténtico, solo
 * se lee qué nivel trae. Un token ilegible cuenta como `aal1`, el nivel que
 * no abre nada.
 */
export function aalDelToken(token: string | null | undefined): Aal {
  if (!token) return null;
  const partes = token.split('.');
  if (partes.length !== 3) return 'aal1';
  try {
    const json = JSON.parse(
      Buffer.from(partes[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as { aal?: unknown };
    return json.aal === 'aal2' ? 'aal2' : 'aal1';
  } catch {
    return 'aal1';
  }
}

/** Un código de app autenticadora: exactamente 6 cifras. */
export function esCodigoValido(codigo: string): boolean {
  return /^\d{6}$/.test(codigo);
}
