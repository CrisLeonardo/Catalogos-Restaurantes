'use client';

/* ============================================================
   /kiosko — interruptor del MODO KIOSKO (autoservicio)
   ------------------------------------------------------------
   El staff abre esta URL en la tablet/tótem del mostrador:
     · slug.leogin.online/kiosko          → activa y va al menú
     · slug.leogin.online/kiosko?salir=1  → desactiva y va al menú
   No hay página visible: marca la bandera (sessionStorage) y
   redirige. El comportamiento kiosko lo aplican el menú y el
   checkout leyendo isKioskMode() — ver src/lib/kiosk.ts.
   (El query se lee de window.location y no con useSearchParams
   para no requerir un boundary de Suspense en el prerender.)
   ============================================================ */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setKioskMode } from '@/lib/kiosk';

export default function KioskoSwitchPage() {
  const router = useRouter();
  const [salir, setSalir] = useState(false);

  useEffect(() => {
    const off = new URLSearchParams(window.location.search).get('salir') === '1';
    setSalir(off);
    setKioskMode(!off);
    router.replace('/');
  }, [router]);

  return (
    <main style={{ minHeight: '100svh', display: 'grid', placeItems: 'center', color: 'var(--u-text-3)', fontSize: 14 }}>
      {salir ? 'Saliendo del modo kiosko…' : 'Activando modo kiosko…'}
    </main>
  );
}
