'use client';

import { useEffect, useState } from 'react';
import Link from '@/components/admin/panel-link';
import { Icon } from '@/components/icons';
import { Leo } from '@/components/leo';
import type { Hito } from '@/lib/momentos';
import { Confeti } from '@/components/confeti';

/* Un hito alcanzado (PLAN_MOMENTOS_PICO, P6): 100 pedidos, el primer mes,
   cada año. Sale arriba de Hoy hasta que el dueño lo cierra, y no vuelve en
   este aparato (localStorage). Empieza oculto y se decide al montar: así
   el HTML del servidor no depende de lo que guardó el navegador. */
export default function HitoTarjeta({ restaurantId, hito }: { restaurantId: string; hito: Hito }) {
  const clave = `leogin:hito:${restaurantId}:${hito.clave}`;
  const [ver, setVer] = useState(false);

  useEffect(() => {
    let visto = false;
    try { visto = !!localStorage.getItem(clave); } catch { /* sin almacenamiento: se muestra */ }
    // Decidir al montar a propósito (ver cabecera); no es un estado derivado.
    setVer(!visto);
  }, [clave]);

  if (!ver) return null;

  function cerrar() {
    try { localStorage.setItem(clave, 'visto'); } catch { /* nada */ }
    setVer(false);
  }

  return (
    <div className="hito-tarjeta relative flex items-center gap-4 rounded-adm-xl border border-adm-border bg-adm-card p-4 pr-12 shadow-adm-sm md:p-5 md:pr-14">
      <div className="relative shrink-0">
        <Confeti piezas={22} alcance={0.55} />
        <Leo id={`leo-hito-${hito.clave}`} expresion="feliz" size={64} />
      </div>
      <div className="min-w-0">
        <h3 className="t-display" style={{ fontSize: 18, margin: 0, color: 'var(--u-text)' }}>{hito.titulo}</h3>
        <p style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--u-text-3)', margin: '4px 0 0' }}>{hito.texto}</p>
        {hito.clave.startsWith('aniversario') && (
          <Link href="/admin/tu-ano" className="press mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold no-underline" style={{ color: 'var(--brand-accent-ink, var(--adm-accent-500))' }}>
            Ver tu año con Leogin <Icon name="chevronRight" size={14} />
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={cerrar}
        aria-label="Cerrar"
        className="press absolute right-2 top-2 grid size-10 place-items-center rounded-full border-0 bg-transparent text-adm-text-3"
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
