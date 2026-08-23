'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';

import { Icon } from '@/components/icons';
import { isActivePath, type NavGroup } from '@/lib/admin-nav';

/* ============================================================
   PESTAÑAS DE SECCIÓN (rediseño 2026-08-21, Fase 3)
   ------------------------------------------------------------
   Lo que antes eran entradas sueltas de la barra lateral ahora son
   pestañas dentro de su grupo. Cocina, Mesas y Tomar pedidos no son
   seis sitios distintos: son cuatro caras de "Pedidos".

   Las pestañas BLOQUEADAS se quedan a la vista, con candado. Es
   deliberado y es donde se movió la venta: en la barra lateral un
   candado era ruido en medio del trabajo del día; aquí aparece justo
   cuando el dueño está buscando esa función, que es cuando la frase
   "esto es lo que hace y cuánto cuesta" significa algo.

   No se pinta la fila si el grupo tiene una sola pestaña: una
   pestaña sola no es una elección, es un adorno.
   ============================================================ */

interface Props {
  group: NavGroup;
  pathname: string;
  /** Vista previa del super admin: se ve todo, no navega. */
  preview?: boolean;
}

export default function SectionTabs({ group, pathname, preview = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  /* En un teléfono cinco pestañas no caben (484 px de pestañas en 347 px de
     barra), así que la fila se desplaza. Sin esto se podía aterrizar en
     "Proveedores" con la pestaña activa fuera de cuadro: la pantalla decía
     una cosa y la barra enseñaba otra. Solo se toca el scroll HORIZONTAL de
     la propia fila — nunca el de la página. */
  useEffect(() => {
    const box = ref.current;
    if (!box || box.scrollWidth <= box.clientWidth) return;
    const active = box.querySelector<HTMLElement>('[data-active="1"]');
    if (!active) return;
    box.scrollLeft = active.offsetLeft - (box.clientWidth - active.offsetWidth) / 2;
  }, [pathname]);

  if (group.index || group.items.length < 2) return null;

  return (
    <div className="admin-tabs" role="tablist" aria-label={group.label} ref={ref}>
      {group.items.map((it) => {
        const active = isActivePath(pathname, it.href);
        const content = (
          <>
            <span>{it.label}</span>
            {it.locked && <Icon name="key" size={12} aria-hidden />}
          </>
        );
        if (preview) {
          return (
            <span key={it.href} className="admin-tab" data-active={active ? '1' : '0'} data-locked={it.locked ? '1' : '0'}>
              {content}
            </span>
          );
        }
        return (
          <Link
            key={it.href}
            href={it.locked ? '/admin/suscripcion' : it.href}
            className="admin-tab press"
            data-active={active ? '1' : '0'}
            data-locked={it.locked ? '1' : '0'}
            data-tour-step={it.key}
            aria-current={active ? 'page' : undefined}
            title={it.locked ? `${it.label} no está en tu plan — mira qué incluye` : undefined}
          >
            {content}
          </Link>
        );
      })}
    </div>
  );
}
