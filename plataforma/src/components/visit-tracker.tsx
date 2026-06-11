'use client';

/* ============================================================
   VISIT TRACKER — registra la visita del comensal (anónima)
   ------------------------------------------------------------
   Una vez por sesión de navegación y por restaurante: genera un
   visitor_id estable en el dispositivo y lo manda al server
   action. No usa cookies de terceros ni datos personales.
   ============================================================ */

import { useEffect } from 'react';
import { trackVisit } from '@/lib/actions/metrics';
import { getVisitorId } from '@/lib/customer-local';

export default function VisitTracker({ restaurantId }: { restaurantId: string }) {
  useEffect(() => {
    try {
      const guard = `visited-${restaurantId}`;
      if (sessionStorage.getItem(guard)) return;
      const visitorId = getVisitorId();
      if (!visitorId) return;
      sessionStorage.setItem(guard, '1');
      trackVisit(restaurantId, visitorId, window.location.pathname || '/');
    } catch {}
  }, [restaurantId]);

  return null;
}
