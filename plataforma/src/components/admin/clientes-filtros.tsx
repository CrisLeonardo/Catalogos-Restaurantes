'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Icon } from '@/components/icons';
import { Select } from '@/components/ui/select';
import { CUSTOMER_SORTS, type CustomerSort } from '@/lib/customer-sort';
import { Button } from '@/components/ui/button';

/* ============================================================
   BUSCAR Y ORDENAR CLIENTES (auditoría 2026-10-02, CLI-01)
   ------------------------------------------------------------
   La lista se pagina en el servidor (de 20 en 20), así que buscar
   tiene que ir en la URL (`?q=…&orden=…`) y no filtrar en el
   navegador solo la página que se ve. Se escribe y, tras una pausa
   corta, se reemplaza la URL: sin botón «Buscar» y sin llenar el
   historial con una entrada por letra. Cambiar la búsqueda o el
   orden vuelve a la página 1 y cierra el cliente abierto.
   ============================================================ */
export default function ClientesFiltros({ q, sort, inactive = false, total, exportSlot }: { q: string; sort: CustomerSort; inactive?: boolean; total?: number; exportSlot?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [text, setText] = useState(q);
  const [pending, startTransition] = useTransition();
  const first = useRef(true);
  /** El orden se cambia de vez en cuando: se abre desde el botón de filtros. */
  const [orden, setOrden] = useState(sort !== 'recientes');

  function go(next: { q?: string; orden?: CustomerSort; inactivos?: boolean }) {
    const sp = new URLSearchParams(params.toString());
    sp.delete('page');
    sp.delete('c');
    const nq = next.q ?? text;
    const no = next.orden ?? sort;
    const ni = next.inactivos ?? inactive;
    if (nq.trim()) sp.set('q', nq.trim()); else sp.delete('q');
    if (no !== 'recientes') sp.set('orden', no); else sp.delete('orden');
    if (ni) sp.set('inactivos', '30'); else sp.delete('inactivos');
    const s = sp.toString();
    startTransition(() => router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  }

  // Búsqueda mientras se escribe, con una pausa de 300 ms.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (text.trim() === q.trim()) return;
    const t = setTimeout(() => go({ q: text }), 300);
    return () => clearTimeout(t);
    // `go` cambia en cada render; lo que importa es el texto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const pill = (on: boolean, aviso = false): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0, whiteSpace: 'nowrap',
    minHeight: 44, padding: '0 14px', borderRadius: 'var(--radius-md)', border: '1px solid transparent',
    font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    background: on ? (aviso ? 'var(--c-warn)' : 'var(--u-text)') : aviso ? 'var(--c-warn-bg)' : 'var(--adm-bg-2)',
    color: on ? (aviso ? 'var(--adm-card)' : 'var(--adm-bg)') : aviso ? 'var(--c-warn)' : 'var(--u-text-2)',
  });

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {/* Una fila: buscar y filtros. */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label className="adm-search" style={{ flex: '1 1 0', minWidth: 0 }} aria-busy={pending}>
          <Icon name="search" size={16} aria-hidden />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') go({ q: text }); }}
            placeholder="Nombre o teléfono"
            aria-label="Buscar cliente por nombre o teléfono"
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>
        <Button type="button" variant="secondary" size="touch" className="shrink-0" aria-expanded={orden}
          aria-controls="clientes-orden" aria-label="Ordenar clientes" onClick={() => setOrden(!orden)}>
          <Icon name="list" size={18} />
          <span className="max-md:hidden">Orden</span>
        </Button>
        {exportSlot && <div className="max-md:hidden">{exportSlot}</div>}
      </div>
      {orden && (
        <div id="clientes-orden" style={{ maxWidth: 260 }}>
          <Select
            aria-label="Ordenar clientes"
            options={CUSTOMER_SORTS.map((s) => ({ value: s.value, label: s.label }))}
            value={sort}
            onValueChange={(v) => go({ orden: v as CustomerSort })}
          />
        </div>
      )}
      {/* La cifra y el filtro son la misma píldora. Los que dejaron de venir:
          a quién escribirle (CLI-06). */}
      <div className="u-noscroll" style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
        <button type="button" style={pill(!inactive)} aria-pressed={!inactive} onClick={() => go({ inactivos: false })}>
          Todos{total != null && <span style={{ opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{total}</span>}
        </button>
        <button type="button" style={pill(inactive, true)} aria-pressed={inactive} onClick={() => go({ inactivos: !inactive })}>
          Sin venir +30 días
        </button>
      </div>
    </div>
  );
}
