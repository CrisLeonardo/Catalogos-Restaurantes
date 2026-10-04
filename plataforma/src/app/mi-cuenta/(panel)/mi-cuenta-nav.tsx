'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/icons';
import { useEffect, useRef } from 'react';

/* ============================================================
   Las secciones de Mi cuenta.
   ------------------------------------------------------------
   Aparecen en cuanto la persona tiene UN restaurante propio: ver cómo va el
   negocio de un vistazo, sin entrar al panel, no es una función de cadena.
   Lo que sí depende de tener varios es "Comparativa" —con un solo
   restaurante no hay nada con qué compararlo—, y "Finanzas" sigue las
   mismas reglas de plan que dentro del panel: si no la tiene contratada, se
   ve con candado y lleva a su suscripción, igual que en el menú lateral.
   ============================================================ */

type Tab = { href: string; label: string; icon: string; locked?: boolean; lockedHref?: string };

export default function MiCuentaNav({
  isGroup,
  financeLocked,
  upgradeUrl,
}: {
  isGroup: boolean;
  financeLocked: boolean;
  upgradeUrl: string | null;
}) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  // La pestaña activa, a la vista (solo se toca el scroll de la propia fila).
  useEffect(() => {
    const box = navRef.current;
    if (!box || box.scrollWidth <= box.clientWidth) return;
    const active = box.querySelector<HTMLElement>('[aria-current="page"]');
    if (active) box.scrollLeft = active.offsetLeft - (box.clientWidth - active.offsetWidth) / 2;
  }, [pathname]);

  const tabs: Tab[] = [
    { href: '/mi-cuenta', label: 'Restaurantes', icon: 'bag' },
    { href: '/mi-cuenta/resumen', label: 'Resumen', icon: 'dashboard' },
    ...(isGroup ? [{ href: '/mi-cuenta/comparativa', label: 'Comparativa', icon: 'chart' }] : []),
    {
      href: '/mi-cuenta/finanzas',
      label: 'Finanzas',
      icon: 'wallet',
      locked: financeLocked,
      lockedHref: upgradeUrl ?? undefined,
    },
  ];

  return (
    <nav
      ref={navRef}
      aria-label="Secciones de mi cuenta"
      style={{
        display: 'flex', gap: 6, overflowX: 'auto', margin: '0 0 22px',
        paddingBottom: 2, scrollbarWidth: 'none',
        /* En el teléfono las pestañas no caben y la última salía cortada sin
           pista de que hay más: se desvanece el borde derecho y la activa
           se centra sola (auditoría 2026-10-02, MIC-04). */
        WebkitMaskImage: 'linear-gradient(to right, #000 calc(100% - 28px), transparent)',
        maskImage: 'linear-gradient(to right, #000 calc(100% - 28px), transparent)',
        paddingRight: 28,
      }}
    >
      {tabs.map((t) => {
        const active = !t.locked
          && (t.href === '/mi-cuenta' ? pathname === '/mi-cuenta' : pathname.startsWith(t.href));
        return (
          <Link
            key={t.href}
            href={t.locked ? (t.lockedHref ?? '/mi-cuenta') : t.href}
            aria-current={active ? 'page' : undefined}
            title={t.locked ? `${t.label} viene con el plan Estándar` : undefined}
            className="press"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
              padding: '9px 15px', borderRadius: 'var(--radius-full)', textDecoration: 'none',
              fontSize: 13, fontWeight: 600,
              border: `1px solid ${active ? 'transparent' : 'var(--u-hair-2)'}`,
              background: active ? 'var(--u-text)' : 'transparent',
              color: active ? 'var(--brand-bg)' : 'var(--u-text-3)',
              opacity: t.locked ? 0.55 : 1,
            }}
          >
            <Icon name={t.icon} size={15} />
            {t.label}
            {t.locked && <Icon name="key" size={12} />}
          </Link>
        );
      })}
    </nav>
  );
}
