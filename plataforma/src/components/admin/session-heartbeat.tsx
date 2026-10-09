'use client';

/* Renueva la sesión de correo/Google en cada actividad real de la persona —
   clic, tecla, toque — así la ventana de inactividad (30 min en el local,
   7 días en un aparato personal; ver session-window.ts) es deslizante en vez
   de fija. Corre en TODAS las sesiones
   del panel (no solo las de PIN, a diferencia de OperatorHeartbeat) porque
   es justo la sesión de dueño/gerente la que antes no expiraba nunca.
   Throttled para no llamar la Server Action en cada evento. Invisible, no
   renderiza nada. */

import { useEffect, useRef, useTransition } from 'react';
import { touchSessionActivity } from '@/lib/actions/session-activity';

const THROTTLE_MS = 60_000;

export default function SessionHeartbeat() {
  const [, startTransition] = useTransition();
  const lastTouch = useRef(0);

  useEffect(() => {
    function touch() {
      const now = Date.now();
      if (now - lastTouch.current < THROTTLE_MS) return;
      lastTouch.current = now;
      // Sin argumento a propósito: la acción deriva el usuario de la sesión
      // del servidor — igual que touchOperatorSession().
      // Sin red no hay nada que marcar: el siguiente toque lo intenta otra vez.
      startTransition(() => { void touchSessionActivity().catch(() => {}); });
    }

    touch();
    const events = ['click', 'keydown', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, touch));
  }, []);

  return null;
}
