/* ============================================================
   PERFIL DEL NEGOCIO QUE LLEGA DE LA WEB
   ------------------------------------------------------------
   Quien entra por /vende-en-linea ya dijo cómo vende: no tiene
   mesas ni meseros, despacha para recoger y a domicilio. El alta
   (/mi-cuenta/nuevo) lo lee y deja el plan armado así, en vez de
   proponerle Premium con un salón que no tiene
   (docs/planes/PLAN_PORTADA_Y_VENDE_EN_LINEA_2026-10-27.md §2).

   Mismo mecanismo que la elección de la vitrina de diseños
   (muestra-mensajes.ts): localStorage con caducidad, porque entre
   la web y el alta hay un registro y a veces un correo de por medio.
   ============================================================ */

export type PerfilNegocio = 'en-linea';

export const PERFIL_KEY = 'leogin:perfil-negocio';
/** Una semana: lo mismo que dura la elección de la vitrina. */
export const PERFIL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function guardarPerfil(perfil: PerfilNegocio): void {
  try {
    window.localStorage.setItem(PERFIL_KEY, JSON.stringify({ perfil, t: Date.now() }));
  } catch { /* modo privado o almacenamiento lleno: el alta pregunta como siempre */ }
}

export function leerPerfil(now = Date.now()): PerfilNegocio | null {
  try {
    const raw = window.localStorage.getItem(PERFIL_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { perfil?: unknown; t?: unknown };
    if (p.perfil !== 'en-linea' || typeof p.t !== 'number' || now - p.t > PERFIL_TTL_MS) return null;
    return p.perfil;
  } catch {
    return null;
  }
}

export function borrarPerfil(): void {
  try { window.localStorage.removeItem(PERFIL_KEY); } catch { /* nada que borrar */ }
}
