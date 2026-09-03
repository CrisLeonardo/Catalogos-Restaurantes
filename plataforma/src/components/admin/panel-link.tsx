'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { panelBaseFrom, panelHref } from '@/lib/panel-links';

/* ============================================================
   UN ENLACE QUE SABE EN QUÉ ORIGEN ESTÁ
   ------------------------------------------------------------
   Igual que `next/link`, pero traduce las rutas del panel al origen desde el
   que se está sirviendo la página:

     <PanelLink href="/admin/menu">   en el subdominio  → /admin/menu
                                      en el origen único → /panel/<slug>/menu

   Fuera del panel no hace nada: `panelHref('', x) === x`, así que se puede
   usar en cualquier sitio sin condicionales.

   Por qué un componente y no una llamada en cada sitio: hay decenas de
   enlaces al panel repartidos por pantallas que son componentes de SERVIDOR,
   donde no se puede usar `usePathname()`. Este componente es de cliente —lo
   puede renderizar un componente de servidor sin problema— así que resuelve
   el prefijo él solo y quien lo usa no tiene que enterarse de nada. Es
   también lo que permite que `ListLink` y el `action` de `Section` funcionen
   en los dos orígenes sin tocar sus decenas de sitios de uso.
   ============================================================ */
export default function PanelLink({
  href,
  ...props
}: React.ComponentProps<typeof Link>) {
  const base = panelBaseFrom(usePathname());
  const destino = typeof href === 'string' ? panelHref(base, href) : href;
  return <Link href={destino} {...props} />;
}
