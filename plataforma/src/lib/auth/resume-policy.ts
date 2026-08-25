/* ============================================================
   CANDADO DE "CONTINUAR COMO" — la decisión, sin dependencias
   ------------------------------------------------------------
   Vive aparte de resume.ts (que habla con Supabase) por la misma razón que
   pin-policy.ts vive aparte de trusted-device.ts: la regla que decide si se
   esconde "Continuar como {nombre}" tiene que poder probarse de verdad, y
   la única forma es que sea una función pura (resume.ts importa
   'server-only' y usa next/headers — nada de eso se puede traer a un test).

   Checklist 2026-08-25 §1: en un aparato de confianza del local, "Continuar
   como {nombre}" para un rol ALTO (dueño, super admin) es el mismo hueco que
   el PIN existe para tapar — cualquiera que agarre ese aparato entra sin
   PIN ni contraseña. STAFF/WAITER no se esconde: ya aparece en la propia
   grilla de PIN, así que su atajo no abre nada nuevo.
   ============================================================ */

/** Roles que ya conviven con el PIN (aparecen en su grilla). */
const LOW_PRIVILEGE_ROLES = new Set(['RESTAURANT_STAFF', 'RESTAURANT_WAITER']);

/**
 * ¿Es de bajo privilegio este rol? Un rol desconocido/ausente NUNCA cuenta
 * como bajo privilegio — el error prudente es esconder de más, no de menos.
 */
export function isLowPrivilegeRole(role: string | null | undefined): boolean {
  return !!role && LOW_PRIVILEGE_ROLES.has(role);
}

/**
 * ¿Debe esconderse "Continuar como {nombre}" en este aparato, para este rol?
 *
 * Único punto donde se decide, para que `resume.ts` (servidor) y
 * `login-client.tsx` (UI) no puedan desincronizarse.
 */
export function shouldHideResume(pinTrusted: boolean, role: string | null | undefined): boolean {
  return pinTrusted && !isLowPrivilegeRole(role);
}
