/**
 * Nombre de la cookie de sesión del COMENSAL (login con Google del menú).
 *
 * Vive en su propio módulo sin dependencias para que lo puedan importar por
 * igual el proxy (Edge runtime), el cliente de servidor (next/headers) y el
 * de navegador. La sesión del PERSONAL usa la cookie por defecto de Supabase
 * (`sb-<ref>-auth-token`); ver lib/supabase/server.ts para el porqué de la
 * separación.
 *
 * "v2": la primera versión (`sb-leogin-diner`) se escribía con
 * `domain=.leogin.online`, así que iniciar sesión en un restaurante te dejaba
 * con sesión iniciada en TODOS los restaurantes de la plataforma. La v2 es
 * host-only: la sesión pertenece únicamente al subdominio del restaurante
 * donde se inició. Se renombró (en vez de solo quitar el domain) porque una
 * cookie vieja de dominio ancho conviviría con la nueva host-only bajo el
 * mismo nombre y el servidor leería una sesión inconsistente ("cookie
 * fantasma"); el proxy expira las viejas con LEGACY_DINER_COOKIE_PATTERN.
 */
export const DINER_COOKIE_NAME = "sb-leogin-diner-v2";

/**
 * Cookies de la v1 (dominio ancho), incluidas sus piezas troceadas
 * (`sb-leogin-diner.0`, `.1`, …) que @supabase/ssr crea cuando la sesión no
 * cabe en 4 KB. No matchea la v2 (el sufijo `-v2` rompe el patrón).
 */
export const LEGACY_DINER_COOKIE_PATTERN = /^sb-leogin-diner(\.\d+)?$/;
