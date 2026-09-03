import 'server-only';
import { headers } from 'next/headers';
import { panelBaseFrom, panelHref } from '@/lib/panel-links';

/**
 * El prefijo del panel para un componente de SERVIDOR.
 *
 * Sale de `x-pathname` —la ruta que ve el navegador, que el proxy ya propaga
 * (proxy.ts §2)— y no de `x-tenant-slug`, que existe en los DOS orígenes. Lo
 * que hay que saber aquí no es qué restaurante es, sino por dónde entró la
 * persona: en el subdominio de hoy esto devuelve cadena vacía y los enlaces
 * salen exactamente como siempre.
 */
export async function panelBase(): Promise<string> {
  return panelBaseFrom((await headers()).get('x-pathname'));
}

/** `panelHref` resolviendo la base por su cuenta. Ver lib/panel-links.ts. */
export async function panelLink(ruta: string): Promise<string> {
  return panelHref(await panelBase(), ruta);
}
