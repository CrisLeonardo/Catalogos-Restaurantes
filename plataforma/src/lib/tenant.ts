/**
 * Resolución de tenant (restaurante) a partir del subdominio.
 *
 * Ejemplos (con NEXT_PUBLIC_ROOT_DOMAIN = "midominio.com"):
 *   mi-restaurante.midominio.com  → "mi-restaurante"
 *   midominio.com               → null  (sitio raíz / landing)
 *   www.midominio.com           → null
 *
 * En local soporta subdominios tipo: mi-restaurante.localhost:3000
 */

const ROOT_DOMAINS = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000")
  .split(",")
  .map((d) => d.trim().toLowerCase().split(":")[0]) // quita el puerto
  .filter(Boolean);

/**
 * Slug reservado para la demo pública de Leogin.
 * `demo.midominio.com` siempre muestra un menú de ejemplo (datos en código),
 * funcione o no la base de datos. Sirve para enseñar a prospectos cómo se
 * vería su restaurante. NO debe usarse como slug de un restaurante real.
 */
export const DEMO_SLUG = "demo";

/** Primer ROOT_DOMAIN configurado, con puerto si lo trae (para armar URLs). */
export function rootDomainForUrls(): string {
  return (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000")
    .split(",")[0]
    .trim();
}

/**
 * URL absoluta a un subdominio (tenant o demo).
 *   subdomainUrl("demo")          → http://demo.localhost:3000   (local)
 *   subdomainUrl("mi-restaurante")  → https://mi-restaurante.leogin.com (prod)
 */
export function subdomainUrl(sub: string): string {
  const root = rootDomainForUrls();
  const isLocal = root.includes("localhost") || root.startsWith("127.");
  const proto = isLocal ? "http" : "https";
  return `${proto}://${sub}.${root}`;
}

/**
 * Prefijo del panel de un restaurante DENTRO del origen único.
 *   panelPath("mi-restaurante") → "/panel/mi-restaurante"
 *
 * El proxy reconoce esta forma y la reescribe a `/admin/...` poniendo
 * `x-tenant-slug` (proxy.ts §2a) — el mismo mecanismo que antes hacía el
 * subdominio, pero leyendo el slug de la ruta.
 */
export function panelPath(slug: string): string {
  return `/panel/${slug}`;
}

/**
 * A dónde se entra al PANEL de un restaurante: una RUTA del mismo origen.
 *
 *   adminUrl("mi-restaurante") → "/panel/mi-restaurante"
 *
 * Antes esto devolvía `https://<slug>-admin.<raíz>`, y ese subdominio ERA el
 * problema: el `scope` de una PWA es por ORIGEN, así que cruzar de Mi cuenta
 * (dominio raíz) al panel hacía que Android pintara la barra del navegador
 * encima — "salir de la app instalada". No hay arreglo de plataforma para eso:
 * `scope_extensions` no existe en Android. Ver PLAN_ORIGEN_UNICO.md.
 *
 * Lo que hace que esto funcione, y que hubo que construir ANTES (fases 1-3):
 *  · el proxy reconoce `/panel/<slug>/…` y lo reescribe a `/admin/…` poniendo
 *    `x-tenant-slug` (proxy.ts §2a);
 *  · los enlaces internos del panel llevan el prefijo cuando toca
 *    (lib/panel-links.ts) — sin eso, entrar aquí dejaba un panel cuyos enlaces
 *    caían todos en "Restaurante no encontrado".
 *
 * El subdominio viejo sigue vivo hasta la fase 5, que le pone un 308 a esta
 * misma ruta: hay íconos ya instalados, marcadores y Leogin Desktop apuntando
 * ahí.
 */
export function adminUrl(slug: string): string {
  return panelPath(slug);
}

/**
 * `/admin/login` y `/admin/logout-operator` viven en el dominio raíz porque
 * NO son de un restaurante (lib/panel-links.ts las marca "sin restaurante" a
 * propósito: admiten la credencial completa `usuario@slug` sin saber de
 * antemano de qué local es). Pero cuando SÍ se sabe el restaurante —porque la
 * persona estaba dentro de su panel un segundo antes de cerrar sesión, o
 * porque el aparato ya demostró pertenecer a uno (ver
 * `restaurantIdForDevice`)— conviene volver ahí, no a un login genérico: es
 * lo que le devuelve al mostrador su marca y su grilla de PIN en vez de
 * dejarlo pidiendo un correo y contraseña que el personal nunca tuvo.
 *
 * Sin slug, se queda exactamente como hoy (ruta plana, dominio raíz).
 */
export function authPathFor(
  path: '/admin/login' | '/admin/logout-operator',
  slug: string | null | undefined,
): string {
  if (!slug) return path;
  return `${panelPath(slug)}${path.slice('/admin'.length)}`;
}

/**
 * URL pública y ESTABLE de una mesa, pensada para grabarse en el QR/NFC
 * que se IMPRIME y se pega en la mesa física.
 *
 * Vive en /m/<slug>/<mesa> del dominio raíz y el proxy (§2b) la sirve con
 * el menú del restaurante. Era /m/<restaurantId>/<mesa>: el UUID no cambia
 * nunca, pero salía un QR más denso y una dirección ilegible (auditoría
 * 2026-10-02, D-5). Con el slug sigue siendo igual de estable: si el Super
 * le cambia el slug a un restaurante, el viejo queda en
 * `restaurant_slug_aliases` (migración 134) y el QR impreso sigue abriendo
 * su menú. Los QR ya impresos con UUID funcionan igual que siempre.
 *
 *   prod:  https://distleogin.com/m/<slug>/<mesa>
 *   local: http://localhost:3000/m/<slug>/<mesa>
 */
export function stableTableUrl(slug: string, mesa: number): string {
  return `${stableRootUrl()}/m/${slug}/${mesa}`;
}

/** Igual que stableTableUrl(), pero para el QR general del restaurante (sin mesa). */
export function stableMenuUrl(restaurantId: string): string {
  return `${stableRootUrl()}/m/${restaurantId}`;
}

export function stableRootUrl(): string {
  const root = rootDomainForUrls();
  const isLocal = root.includes("localhost") || root.startsWith("127.");
  const proto = isLocal ? "http" : "https";
  return `${proto}://${root}`;
}

export function getTenantSlug(host: string | null | undefined): string | null {
  if (!host) return null;
  const hostname = host.toLowerCase().split(":")[0]; // quita el puerto

  for (const root of ROOT_DOMAINS) {
    if (hostname === root || hostname === `www.${root}`) return null;
    if (hostname.endsWith(`.${root}`)) {
      const sub = hostname.slice(0, hostname.length - root.length - 1);
      if (!sub || sub === "www") return null;
      // slug-central.root → panel del GRUPO, no es un menú de restaurante.
      if (sub.endsWith("-central")) return null;
      // mi-restaurante-admin.root → slug es "mi-restaurante"
      if (sub.endsWith("-admin")) {
        return sub.slice(0, -6); // quita el sufijo "-admin"
      }
      return sub.split(".")[0];
    }
  }
  return null;
}

/**
 * Devuelve true cuando el host es el subdominio admin del tenant.
 * Patrón: SLUG-admin.leogin.online  (un solo nivel, cubierto por *.leogin.online)
 * Ejemplos: mi-restaurante-admin.leogin.online → true
 *           mi-restaurante.leogin.online       → false
 */
export function isAdminSubdomain(host: string | null | undefined): boolean {
  if (!host) return false;
  const hostname = host.toLowerCase().split(":")[0];
  for (const root of ROOT_DOMAINS) {
    if (hostname.endsWith(`.${root}`)) {
      const sub = hostname.slice(0, hostname.length - root.length - 1);
      return sub.endsWith("-admin");
    }
  }
  return false;
}

/**
 * Devuelve true cuando el host es el subdominio del PANEL DE GRUPO.
 * Patrón: SLUG-central.leogin.online (un nivel, cubierto por el wildcard).
 * Ejemplos: tacos-del-norte-central.leogin.online → true
 */
export function isGroupSubdomain(host: string | null | undefined): boolean {
  if (!host) return false;
  const hostname = host.toLowerCase().split(":")[0];
  for (const root of ROOT_DOMAINS) {
    if (hostname.endsWith(`.${root}`)) {
      const sub = hostname.slice(0, hostname.length - root.length - 1);
      return sub.endsWith("-central");
    }
  }
  return false;
}

/** Slug del grupo a partir del host (quita el sufijo "-central"), o null. */
export function getGroupSlug(host: string | null | undefined): string | null {
  if (!host) return null;
  const hostname = host.toLowerCase().split(":")[0];
  for (const root of ROOT_DOMAINS) {
    if (hostname.endsWith(`.${root}`)) {
      const sub = hostname.slice(0, hostname.length - root.length - 1);
      if (sub.endsWith("-central")) return sub.slice(0, -8); // quita "-central"
    }
  }
  return null;
}

/**
 * Si `host` vive en un ROOT_DOMAIN que NO es el primero de la lista (una
 * marca/dominio anterior que se dejó vivo tras una migración, ej.
 * leogin.online tras pasar a distleogin.com), devuelve el host equivalente
 * en el dominio primario — mismo subdominio, solo cambia el sufijo. `null`
 * si `host` ya es del dominio primario, no coincide con ningún ROOT_DOMAIN
 * conocido, o solo hay uno configurado (nada que redirigir).
 */
export function legacyDomainRedirectHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const [primary, ...legacy] = ROOT_DOMAINS;
  if (!primary || legacy.length === 0) return null;
  const hostname = host.toLowerCase().split(":")[0];
  if (hostname === primary || hostname.endsWith(`.${primary}`)) return null;
  for (const root of legacy) {
    if (hostname === root) return primary;
    if (hostname.endsWith(`.${root}`)) {
      const sub = hostname.slice(0, hostname.length - root.length - 1);
      return `${sub}.${primary}`;
    }
  }
  return null;
}
