'use client';

import { useRef, useState } from 'react';
import { Icon } from '@/components/icons';

/* BUSCAR UN AJUSTE (nada saturado, 2026-11-11).
   ------------------------------------------------------------------
   Ajustes son más de quince destinos en cuatro grupos. La página los pinta
   en el servidor; este buscador solo esconde las filas que no coinciden
   (`data-ajuste`) y los grupos que se quedan vacíos (`data-ajuste-grupo`),
   sin volver a pedir nada. Sin texto, todo vuelve a verse. */

const limpiar = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

export default function AjustesBuscador({ alcance }: { alcance: string }) {
  const [texto, setTexto] = useState('');
  const [sinResultados, setSinResultados] = useState(false);
  /* Se busca desde ESTE nodo y no por id: mientras la página llega por
     partes puede haber una copia oculta con el mismo id. */
  const caja = useRef<HTMLDivElement>(null);

  function filtrar(valor: string) {
    setTexto(valor);
    const raiz = caja.current?.parentElement?.querySelector<HTMLElement>(`#${alcance}`);
    if (!raiz) return;
    const q = limpiar(valor);
    let visibles = 0;
    for (const grupo of raiz.querySelectorAll<HTMLElement>('[data-ajuste-grupo]')) {
      let enGrupo = 0;
      for (const fila of grupo.querySelectorAll<HTMLElement>('[data-ajuste]')) {
        const coincide = !q || limpiar(fila.dataset.ajuste ?? '').includes(q);
        fila.hidden = !coincide;
        if (coincide) enGrupo += 1;
      }
      grupo.hidden = enGrupo === 0;
      visibles += enGrupo;
    }
    setSinResultados(!!q && visibles === 0);
  }

  return (
    <div ref={caja} className="grid gap-2">
      <label className="adm-search">
        <Icon name="search" size={16} aria-hidden />
        <input
          type="search" value={texto} onChange={(e) => filtrar(e.target.value)}
          placeholder="Buscar un ajuste" aria-label="Buscar un ajuste" aria-controls={alcance}
          autoComplete="off" enterKeyHint="search"
        />
      </label>
      {sinResultados && (
        <p role="status" className="px-1 text-[14px] text-adm-text-3">
          Ningún ajuste se llama «{texto.trim()}». Prueba con otra palabra.
        </p>
      )}
    </div>
  );
}
