/* ============================================================
   BUILD VIEJO EN UNA PESTAÑA ABIERTA
   ------------------------------------------------------------
   Next parte la app en "chunks" con el hash del contenido en el
   nombre. Cada despliegue genera nombres nuevos y BORRA los
   anteriores del servidor. Una pestaña que estaba abierta desde
   antes del deploy sigue ejecutando el build viejo: en cuanto
   navega a una sección que aún no había cargado, pide un archivo
   que ya no existe y revienta con "Failed to load chunk".

   Pasó de verdad el 2026-08-10, justo después de un deploy:
   leogin.online → "Acceder" → pantalla de error. El chunk del
   mensaje devolvía 404 y /login ya servía otros nombres.

   No es un fallo de la app: es una pestaña vieja hablando con un
   servidor nuevo. Y `reset()` de Next no lo arregla —vuelve a
   montar el MISMO bundle roto—, así que sin esto la pantalla de
   error es un callejón sin salida y el único remedio es que el
   usuario sepa hacer Ctrl+Shift+R. Un dueño en plena hora de
   servicio no tiene por qué saber eso.
   ============================================================ */

/** ¿El error es "mi bundle ya no existe en el servidor"? */
export function isStaleBuildError(error: unknown): boolean {
  const err = error as { name?: string; message?: string } | null;
  const text = `${err?.name ?? ''} ${err?.message ?? ''}`;
  return /chunkloaderror|failed to load chunk|loading chunk .* failed|dynamically imported module|importing a module script failed/i
    .test(text);
}

/** Cuándo se recargó por última vez por este motivo, en esta pestaña. */
const RELOAD_STAMP = 'leogin:recarga-por-build-viejo';

/**
 * Ventana antibucle. Si tras recargar el error vuelve enseguida, no era un
 * build viejo (la recarga habría traído el nuevo) y recargar otra vez sería
 * un bucle infinito.
 *
 * Es una ventana y no una marca de "ya recargué una vez" a propósito: el
 * panel se queda abierto días en la PC del restaurante y aguanta varios
 * despliegues; con una marca permanente solo se auto-curaría del primero.
 */
const RELOAD_WINDOW_MS = 30_000;

/**
 * Recarga la página, salvo que acabe de hacerlo por lo mismo.
 * Devuelve true si disparó la recarga (quien llama puede pintar
 * "actualizando…" en vez de la pantalla de error).
 */
export function recoverFromStaleBuild(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_STAMP));
    if (Number.isFinite(last) && last > 0 && Date.now() - last < RELOAD_WINDOW_MS) {
      return false; // recién recargamos y sigue fallando: no es esto
    }
    sessionStorage.setItem(RELOAD_STAMP, String(Date.now()));
  } catch {
    // Modo incógnito con el storage bloqueado: mejor recargar sin memoria de
    // haberlo hecho que dejar al usuario en la pantalla de error.
  }
  window.location.reload();
  return true;
}
