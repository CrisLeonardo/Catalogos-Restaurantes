/* ============================================================
   «CONFIRMA QUE ERES TÚ» — la decisión, sin dependencias
   ------------------------------------------------------------
   PLAN_ACCESO_Y_MONITOREO_2026-10-08, ACC-09. Con la sesión larga en el
   aparato personal (ACC-08), una sesión abierta y desatendida dura días. Lo
   que no puede quedar a un toque de quien tome ese celular es lo delicado:
   sacar el respaldo o la lista de clientes, cambiar el PIN de entrada,
   apagar el candado de aparatos, reponerle la contraseña al gerente o sacar
   a alguien del equipo. Eso vuelve a pedir la contraseña (o Google) si la
   última vez que la persona demostró ser ella fue hace más de 10 min.

   «Demostró ser ella» = cualquiera de las dos:
     · su sesión nació hace menos de 10 min (el `amr` del token dice cuándo
       se autenticó: contraseña, Google, código de la app…);
     · confirmó su contraseña en el diálogo hace menos de 10 min (un pase
       firmado, lib/auth/reauth.ts).
   ============================================================ */

export const REAUTH_VENTANA_MS = 10 * 60_000;

/** El error que devuelve una acción delicada cuando falta confirmar. */
export type ReauthRequerida = { error: string; reauth: true };

export const MENSAJE_REAUTH = 'Por seguridad, confirma que eres tú para continuar.';

export function reauthRequerida(): ReauthRequerida {
  return { error: MENSAJE_REAUTH, reauth: true };
}

/** ¿Este resultado de una acción pide confirmar identidad? */
export function pideReauth(x: unknown): x is ReauthRequerida {
  return !!x && typeof x === 'object' && (x as { reauth?: unknown }).reauth === true;
}

/**
 * Cuándo se autenticó esta sesión por última vez (ms), según el `amr` de su
 * token de acceso. Solo con un token que el servidor YA validó en esta
 * petición — aquí no se comprueba la firma. Ilegible → null (no reciente).
 */
export function autenticadoEnMs(token: string | null | undefined): number | null {
  if (!token) return null;
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  try {
    const json = JSON.parse(
      Buffer.from(partes[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as { amr?: { timestamp?: unknown }[] };
    const marcas = (json.amr ?? [])
      .map((m) => (typeof m?.timestamp === 'number' ? m.timestamp : NaN))
      .filter((t) => Number.isFinite(t));
    return marcas.length ? Math.max(...marcas) * 1000 : null;
  } catch {
    return null;
  }
}

/** ¿Fue hace menos de la ventana? Una marca del futuro no cuenta. */
export function esReciente(ms: number | null, ahora = Date.now()): boolean {
  if (ms === null) return false;
  const edad = ahora - ms;
  return edad >= -60_000 && edad <= REAUTH_VENTANA_MS;
}
