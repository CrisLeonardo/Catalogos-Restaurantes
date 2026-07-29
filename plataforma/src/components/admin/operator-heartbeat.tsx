'use client';

/* Renueva la sesión de operador (login por PIN) en cada actividad real de
   la persona — clic, tecla, toque — así la ventana de inactividad (30 min,
   ver isOperatorSessionStale) es deslizante en vez de fija. Throttled para
   no llamar la Server Action en cada evento. Invisible, no renderiza nada. */

import { useEffect, useRef, useTransition } from 'react';
import { touchOperatorSession } from '@/lib/actions/operator';

const THROTTLE_MS = 60_000;

export default function OperatorHeartbeat({ profileId }: { profileId: string }) {
  const [, startTransition] = useTransition();
  const lastTouch = useRef(0);

  useEffect(() => {
    function touch() {
      const now = Date.now();
      if (now - lastTouch.current < THROTTLE_MS) return;
      lastTouch.current = now;
      // Sin argumento a propósito: la acción deriva el perfil de la sesión del
      // servidor. Mandarlo desde aquí permitía falsear la marca y anular el
      // cierre por inactividad.
      startTransition(() => { void touchOperatorSession(); });
    }

    touch();
    const events = ['click', 'keydown', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, touch));
  }, [profileId]);

  return null;
}
