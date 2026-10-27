'use client';

import { useCallback, useState } from 'react';
import { Icon } from '@/components/icons';
import { dibujarPlato, type MarcaRestaurante, type PlatoParaCompartir } from '@/lib/compartir/plato';
import CompartirDialogo from './compartir-dialogo';

/* «Comparte tu plato del día» (PLAN_MOMENTOS_PICO P7): el botón junto al
   plato estrella de Hoy. La imagen se dibuja al abrir, no antes. */
export default function CompartirPlato({ marca, plato }: { marca: MarcaRestaurante; plato: PlatoParaCompartir }) {
  const [abierto, setAbierto] = useState(false);
  const generar = useCallback(() => dibujarPlato(marca, plato), [marca, plato]);
  const cerrar = useCallback(() => setAbierto(false), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="press -my-1 -mr-2 inline-flex min-h-8 items-center gap-1.5 rounded-full border-0 px-2.5 text-[12px] font-semibold"
        style={{ background: 'color-mix(in srgb, var(--brand-accent) 14%, transparent)', color: 'var(--brand-accent-ink, var(--brand-accent))' }}
      >
        <Icon name="upload" size={13} /> Compartir
      </button>
      {abierto && (
        <CompartirDialogo
          titulo="Tu plato del día"
          archivo={`plato-del-dia-${plato.nombre.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`}
          texto={`Hoy en ${marca.nombre}: ${plato.nombre}. Pídelo en ${marca.menu}`}
          generar={generar}
          onClose={cerrar}
        />
      )}
    </>
  );
}
