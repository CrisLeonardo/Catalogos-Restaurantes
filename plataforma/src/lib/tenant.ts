/**
 * Resolución de tenant (restaurante) a partir del subdominio.
 *
 * Ejemplos (con NEXT_PUBLIC_ROOT_DOMAIN = "midominio.com"):
 *   azucar-negra.midominio.com  → "azucar-negra"
 *   midominio.com               → null  (sitio raíz / landing)
 *   www.midominio.com           → null
 *
 * En local soporta subdominios tipo: azucar-negra.localhost:3000
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
 *   subdomainUrl("azucar-negra")  → https://azucar-negra.leogin.com (prod)
 */
export function subdomainUrl(sub: string): string {
  const root = rootDomainForUrls();
  const isLocal = root.includes("localhost") || root.startsWith("127.");
  const proto = isLocal ? "http" : "https";
  return `${proto}://${sub}.${root}`;
}

export function getTenantSlug(host: string | null | undefined): string | null {
  if (!host) return null;
  const hostname = host.toLowerCase().split(":")[0]; // quita el puerto

  for (const root of ROOT_DOMAINS) {
    if (hostname === root || hostname === `www.${root}`) return null;
    if (hostname.endsWith(`.${root}`)) {
      const sub = hostname.slice(0, hostname.length - root.length - 1);
      if (!sub || sub === "www") return null;
      // azucar-negra-admin.root → slug es "azucar-negra"
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
 * Ejemplos: azucar-negra-admin.leogin.online → true
 *           azucar-negra.leogin.online       → false
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
