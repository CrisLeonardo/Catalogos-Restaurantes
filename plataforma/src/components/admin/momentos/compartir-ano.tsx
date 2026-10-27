'use client';

import { useCallback, useState } from 'react';
import { Icon } from '@/components/icons';
import { dibujarAno, type DatosDelAno } from '@/lib/compartir/ano';
import CompartirDialogo from './compartir-dialogo';

/* El botón de «Compartir mi año» (PLAN_MOMENTOS_PICO P8). Leo sale de la
   misma página: se copia el SVG que ya está pintado arriba (`leoId`). */
export default function CompartirAno({ datos, leoId }: { datos: DatosDelAno; leoId: string }) {
  const [abierto, setAbierto] = useState(false);
  const generar = useCallback(
    () => dibujarAno(datos, document.querySelector<SVGSVGElement>(`[data-leo="${leoId}"] svg`)),
    [datos, leoId],
  );
  const cerrar = useCallback(() => setAbierto(false), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="btn-accent press inline-flex min-h-11 items-center gap-2 rounded-adm-md border-0 px-4 text-[14px] font-semibold"
      >
        <Icon name="upload" size={15} /> Compartir mi año
      </button>
      {abierto && (
        <CompartirDialogo
          titulo={`Tu ${datos.ano} con Leogin`}
          archivo={`mi-${datos.ano}-con-leogin.png`}
          texto={`Así fue el ${datos.ano} de ${datos.restaurante} con Leogin.`}
          generar={generar}
          onClose={cerrar}
        />
      )}
    </>
  );
}
