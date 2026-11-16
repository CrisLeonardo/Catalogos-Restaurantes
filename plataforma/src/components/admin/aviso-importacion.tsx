'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { deshacerImportacion } from '@/lib/actions/importar-carta';

/* Al volver de importar (ficha 2.4): qué entró y «Deshacer» el lote.
   Una sola línea encima de la lista; se cierra sola al quitar el
   parámetro de la dirección. */
export default function AvisoImportacion({
  restaurantId, lote, nuevos, precios,
}: {
  restaurantId: string;
  lote: string;
  nuevos: number;
  precios: number;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const [pending, start] = useTransition();
  const [hecho, setHecho] = useState<string | null>(null);

  const texto = [
    nuevos ? `Se ${nuevos === 1 ? 'agregó 1 platillo' : `agregaron ${nuevos} platillos`}` : null,
    precios ? `${nuevos ? 'cambi' : 'Cambi'}${precios === 1 ? 'ó 1 precio' : `aron ${precios} precios`}` : null,
  ].filter(Boolean).join(' y ');

  function cerrar() { router.replace(ruta); }

  function deshacer() {
    start(async () => {
      const r = await deshacerImportacion({ restaurantId, lote });
      if ('error' in r) { setHecho(r.error); return; }
      setHecho(r.conservados > 0
        ? `Se deshizo. ${r.conservados === 1 ? 'Un platillo ya vendido se conservó' : `${r.conservados} platillos ya vendidos se conservaron`}.`
        : 'Se deshizo la importación.');
      router.refresh();
    });
  }

  return (
    <div role="status" className="flex min-h-12 items-center gap-3 rounded-adm-xl border border-adm-border bg-adm-card px-4 py-2 text-[14px] shadow-adm-xs">
      <Icon name="check" size={16} style={{ color: 'var(--c-ok)', flexShrink: 0 }} />
      <span className="min-w-0 flex-1 text-adm-text">{hecho ?? texto}</span>
      {!hecho && (
        <button type="button" onClick={deshacer} disabled={pending}
          className="min-h-11 shrink-0 cursor-pointer border-0 bg-transparent px-1 text-[14px] font-semibold text-adm-accent-ink">
          {pending ? 'Deshaciendo…' : 'Deshacer'}
        </button>
      )}
      <button type="button" onClick={cerrar} aria-label="Cerrar el aviso"
        className="grid size-11 shrink-0 cursor-pointer place-items-center border-0 bg-transparent text-adm-text-3">
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
