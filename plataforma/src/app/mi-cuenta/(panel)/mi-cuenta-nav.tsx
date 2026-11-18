'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import s from '@/components/mi-cuenta/mi-cuenta.module.css';

/* ============================================================
   Las secciones de Mi cuenta: Restaurantes · Finanzas.
   ------------------------------------------------------------
   Eran cuatro (Restaurantes, Resumen, Comparativa, Finanzas) y en el
   teléfono no cabían. Línea N «nada saturado» (2026-11-18): lo de hoy de
   Resumen vive ahora en cada fila de Restaurantes y la comparación entre
   restaurantes es la tarjeta «Por restaurante» de Finanzas. Las rutas
   viejas reenvían aquí.

   Finanzas siempre lleva a su pantalla: ahí se explica qué trae el plan si
   no la tiene contratada (antes la pestaña saltaba directo a la
   suscripción, sin decir por qué).
   ============================================================ */

export default function MiCuentaNav() {
  const pathname = usePathname();
  const tabs = [
    { href: '/mi-cuenta', label: 'Restaurantes', activa: pathname === '/mi-cuenta' },
    { href: '/mi-cuenta/finanzas', label: 'Finanzas', activa: pathname.startsWith('/mi-cuenta/finanzas') },
  ];

  return (
    <nav aria-label="Secciones de mi cuenta" className={s.pestanas}>
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={s.pestana} aria-current={t.activa ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
