'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { conEvento, EVENTOS } from '@/lib/analytics';
import { guardarPerfil } from '@/lib/perfil-negocio';

/* El botón de alta de /vende-en-linea: el mismo /registro de siempre, pero
   antes de irse deja dicho que el negocio vende en línea, para que el alta
   llegue con el plan armado (lib/perfil-negocio.ts). */
export function CtaEnLinea({ className, lugar, children }: { className: string; lugar: string; children: ReactNode }) {
  return (
    <Link
      href="/registro"
      {...conEvento(className, EVENTOS.clicCrear, `en línea · ${lugar}`)}
      onClick={() => guardarPerfil('en-linea')}
    >
      {children}
    </Link>
  );
}
