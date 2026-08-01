'use client';

/* Ajustes → "Este dispositivo".
   Es el MISMO interruptor de PC principal que vive en /admin/mi-pc, no una
   copia: antes había dos implementaciones distintas de "hacer de esta PC el
   servidor" y solo una de ellas sabía apagar. Aquí queda por comodidad (es
   donde uno busca las cosas de "este equipo"), con un enlace a la pantalla
   completa para lo demás. */

import Link from 'next/link';
import MainPcSwitch from '@/components/admin/main-pc-switch';

export default function DesktopServerSettings() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <MainPcSwitch />
      <Link
        href="/admin/mi-pc"
        style={{ fontSize: 12.5, color: 'var(--brand-accent-ink)', fontWeight: 700, textDecoration: 'none' }}
      >
        Ver impresoras y respaldo sin internet →
      </Link>
    </div>
  );
}
