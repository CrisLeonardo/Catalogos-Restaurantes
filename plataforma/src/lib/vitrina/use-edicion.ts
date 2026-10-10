'use client';

import { useEffect, useState } from 'react';
import { useThemeConfig } from '@/lib/theme/context';
import { estadoEdicion, type Edicion } from './edicion';

/**
 * Estado de la edición con reloj: se recalcula SOLO al cruzar la apertura o
 * el cierre, no cada segundo. Quien espera un drop con la página abierta ve
 * aparecer los botones al abrir sin recargar, y la carta no se vuelve a
 * pintar entera cada segundo (la cuenta regresiva lleva su propio reloj).
 */
export function useEdicion(): Edicion {
  const config = useThemeConfig();
  const [now, setNow] = useState(() => Date.now());
  const edicion = estadoEdicion(config, now);
  const { abre, cierra } = edicion;

  useEffect(() => {
    const proximos = [abre, cierra].filter((x): x is number => x !== null && x > now);
    if (proximos.length === 0) return;
    // setTimeout no acepta más de ~24,8 días; si falta más, se vuelve a mirar entonces.
    const espera = Math.min(Math.min(...proximos) - Date.now() + 50, 2_000_000_000);
    const t = setTimeout(() => setNow(Date.now()), Math.max(0, espera));
    return () => clearTimeout(t);
  }, [now, abre, cierra]);

  return edicion;
}
