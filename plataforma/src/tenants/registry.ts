/* ============================================================
   OVERRIDES POR CÓDIGO POR CLIENTE  (capa 4 del motor)
   ------------------------------------------------------------
   Para los casos "sin límite" que no se pueden lograr solo desde
   el panel: aquí, por slug, podés forzar config, textos o CSS por
   código. Es la vía más potente (gana sobre la BD).

   Precedencia (mayor gana):
     code override  >  custom_css(BD)  >  config/content(BD)  >  DEFAULTS

   Cómo agregar un cliente:
     1. Agregá una entrada a TENANT_OVERRIDES con su `slug`.
     2. Poné solo lo que querés forzar (todo es opcional/parcial).
     3. Para diseños totalmente custom (un componente propio de portada,
        por ejemplo) se puede extender `components` más adelante.

   Ejemplo:
     'pizzeria-don-mario': {
       config: { backgroundType: 'image', backgroundImage: 'https://…/fondo.jpg' },
       content: { portada: { cta: 'Ordená tu pizza' } },
       customCss: `.glass{ border-radius: 4px; }`,
     },
   ============================================================ */

import type { ThemeConfig, ThemeContent } from '@/lib/theme/defaults';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export interface TenantOverride {
  config?: Partial<ThemeConfig>;
  content?: DeepPartial<ThemeContent>;
  customCss?: string;
}

/** Mapa slug → override. Vacío por defecto; se llena por cliente cuando hace falta. */
export const TENANT_OVERRIDES: Record<string, TenantOverride> = {
  // 'mi-restaurante': { config: { … }, content: { … }, customCss: `…` },
};

export function getTenantOverride(slug: string): TenantOverride | undefined {
  return TENANT_OVERRIDES[slug];
}
