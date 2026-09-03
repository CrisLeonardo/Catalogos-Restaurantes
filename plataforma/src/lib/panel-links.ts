/* ============================================================
   LOS ENLACES DEL PANEL, EN CUALQUIERA DE LOS DOS ORÍGENES
   ------------------------------------------------------------
   El panel se sirve hoy desde DOS sitios a la vez, y va a seguir así hasta
   que el subdominio viejo quede sin tráfico (PLAN_ORIGEN_UNICO.md):

     · subdominio     <slug>-admin.distleogin.com/menu     (prod, hoy)
                      <slug>.localhost:3000/admin/menu     (local, hoy)
     · origen único   distleogin.com/panel/<slug>/menu     (a donde vamos)

   La ruta INTERNA es la misma en los dos casos —`/admin/menu`, que es lo que
   renderiza Next— pero el enlace que hay que pintar NO. De eso va este
   archivo, y es lo que permite que la fase 3 se pueda subir sola: mientras el
   navegador no esté en `/panel/<slug>`, `panelBaseFrom()` devuelve cadena
   vacía y todos los enlaces quedan exactamente como estaban.

   Por qué medirlo desde el pathname y no desde una prop: `usePathname()` bajo
   un rewrite del proxy devuelve la ruta que ve el NAVEGADOR (comprobado el
   2026-09-02: con el panel abierto en `/panel/azucar-negra`, la barra dice
   `/panel/azucar-negra`), así que el slug ya viaja en el único sitio del que
   no se puede desincronizar.
   ============================================================ */

/** Rutas bajo `/admin/` que NO son de un restaurante: viven en el dominio raíz. */
const SIN_RESTAURANTE = [
  "/admin/login",
  "/admin/logout-operator",
  "/admin/recuperar",
  "/admin/nueva-clave",
  "/admin/auth",
] as const;

function esRutaSinRestaurante(ruta: string): boolean {
  return SIN_RESTAURANTE.some((r) => ruta === r || ruta.startsWith(`${r}/`) || ruta.startsWith(`${r}?`));
}

/**
 * Prefijo del panel según la ruta del navegador.
 *   "/panel/azucar-negra/menu" → "/panel/azucar-negra"
 *   "/admin/menu"              → ""   (subdominio: no hay prefijo que poner)
 */
export function panelBaseFrom(pathname: string | null | undefined): string {
  const m = (pathname ?? "").match(/^\/panel\/([a-z0-9][a-z0-9-]*)(?=\/|$)/i);
  return m ? m[0] : "";
}

/**
 * La ruta INTERNA que corresponde a lo que ve el navegador. Sirve para que
 * toda la lógica que ya compara contra `/admin/...` (pestaña activa, títulos,
 * modo kiosco) siga funcionando sin tocarla.
 *
 *   "/panel/azucar-negra/menu" → "/admin/menu"
 *   "/panel/azucar-negra"      → "/admin"
 *   "/admin/menu"              → "/admin/menu"  (sin cambios)
 */
export function internalPanelPath(pathname: string | null | undefined): string {
  const ruta = pathname ?? "";
  const base = panelBaseFrom(ruta);
  if (!base) return ruta;
  const resto = ruta.slice(base.length);
  return resto === "" || resto === "/" ? "/admin" : `/admin${resto}`;
}

/**
 * El enlace que hay que pintar para una ruta interna del panel.
 *
 *   panelHref("/panel/azucar-negra", "/admin/menu")  → "/panel/azucar-negra/menu"
 *   panelHref("",                    "/admin/menu")  → "/admin/menu"
 *   panelHref("/panel/azucar-negra", "/admin/login") → "/admin/login"   (sin restaurante)
 *   panelHref("/panel/azucar-negra", "/mi-cuenta")   → "/mi-cuenta"     (de la persona)
 *
 * Todo lo que no sea una ruta del panel pasa de largo: Mi cuenta, el menú
 * público, una URL absoluta a otro dominio.
 */
export function panelHref(base: string, ruta: string): string {
  if (!base) return ruta;
  if (esRutaSinRestaurante(ruta)) return ruta;
  if (ruta === "/admin") return base;
  if (!ruta.startsWith("/admin/") && !ruta.startsWith("/admin?")) return ruta;
  return `${base}${ruta.slice("/admin".length)}`;
}
