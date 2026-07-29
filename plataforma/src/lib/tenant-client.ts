'use client';

import { useEffect, useState } from 'react';

/**
 * Contraparte de cliente de `stableTableUrl`/`stableMenuUrl` (lib/tenant.ts) y
 * del rewrite de `/m/<restaurantId>/...` en proxy.ts §1b.
 *
 * Cuando el menú se sirve por el link ESTABLE de mesa (dominio raíz), todas
 * las páginas siguen viviendo bajo el prefijo `/m/<restaurantId>` en la barra
 * de direcciones (el proxy solo reescribe internamente, no redirige). Los
 * links absolutos armados a mano en el código (`/checkout`, `/mis-pedidos`,
 * el `redirectTo` de Google, etc.) necesitan ese mismo prefijo o pierden el
 * contexto de tenant al navegar — ver el proxy, que solo puede resolver el
 * tenant a partir de la URL, no "recordarla" entre requests.
 */
export function getStableLinkPrefix(): string | null {
  if (typeof window === 'undefined') return null;
  const m = window.location.pathname.match(/^\/m\/[0-9a-fA-F-]{36}/);
  return m ? m[0] : null;
}

/**
 * Versión segura para SSR de `getStableLinkPrefix()`: en el primer render
 * (servidor Y cliente, antes de que corran los efectos) siempre devuelve
 * `null` — recién se actualiza en un efecto tras montar. Leer
 * `window.location` directo en el cuerpo del componente haría que el HTML
 * del servidor (sin `window`) y el del cliente (con `window`) no coincidieran
 * en el primer render — React lo reporta como error de hidratación.
 */
export function useStableLinkPrefix(): string | null {
  const [prefix, setPrefix] = useState<string | null>(null);
  useEffect(() => {
    setPrefix(getStableLinkPrefix());
  }, []);
  return prefix;
}

/**
 * `/checkout` → `/m/<id>/checkout` si aplica; si no, el path tal cual.
 * Hook (no función pura): usa `useStableLinkPrefix()` para no romper la
 * hidratación — ver ahí el porqué.
 */
export function useTenantPrefix(path: string): string {
  const prefix = useStableLinkPrefix();
  return prefix ? `${prefix}${path}` : path;
}
