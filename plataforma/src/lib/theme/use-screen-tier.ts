'use client';

/* Escalón de pantalla, en vivo. Ver lib/theme/canvas.ts para el reparto de
   responsabilidades entre este hook y el CSS. */

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { TIER_MIN_VW, type ScreenTier } from './canvas';

/** Los que hay que vigilar: 'phone' es el suelo, no tiene consulta. */
const WATCHED: ScreenTier[] = ['tablet', 'desktop', 'wide'];

/**
 * En el servidor no hay pantalla que medir, así que se asume teléfono: es de
 * donde entra casi todo el mundo (el QR de la mesa) y el único caso que nunca
 * desborda. El ancho del lienzo NO depende de este hook —lo pone el CSS y ya
 * es correcto en el primer pintado—, así que lo único que se reacomoda al
 * hidratar en una computadora es el reparto en columnas.
 */
export function useScreenTier(): ScreenTier {
  const queries = useMemo(
    () =>
      WATCHED.map((tier) => ({
        tier,
        mq: typeof window === 'undefined' ? null : window.matchMedia(`(min-width: ${TIER_MIN_VW[tier]}px)`),
      })),
    [],
  );

  const subscribe = useCallback(
    (onChange: () => void) => {
      const offs = queries.map(({ mq }) => {
        mq?.addEventListener('change', onChange);
        return () => mq?.removeEventListener('change', onChange);
      });
      return () => offs.forEach((off) => off());
    },
    [queries],
  );

  const get = useCallback(() => {
    let tier: ScreenTier = 'phone';
    for (const { tier: t, mq } of queries) if (mq?.matches) tier = t;
    return tier;
  }, [queries]);

  return useSyncExternalStore(subscribe, get, () => 'phone' as ScreenTier);
}
