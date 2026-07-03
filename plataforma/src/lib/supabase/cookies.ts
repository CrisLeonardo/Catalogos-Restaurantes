/**
 * Nombre de la cookie de sesión del COMENSAL (login con Google del menú).
 *
 * Vive en su propio módulo sin dependencias para que lo puedan importar por
 * igual el proxy (Edge runtime), el cliente de servidor (next/headers) y el
 * de navegador. La sesión del PERSONAL usa la cookie por defecto de Supabase
 * (`sb-<ref>-auth-token`); ver lib/supabase/server.ts para el porqué de la
 * separación.
 */
export const DINER_COOKIE_NAME = "sb-leogin-diner";
