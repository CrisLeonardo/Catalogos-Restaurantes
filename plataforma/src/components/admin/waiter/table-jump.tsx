'use client';

/* Cambiar de mesa sin soltar el teclado (Ctrl/⌘ + M).
   ------------------------------------------------------------------
   Aquí decía «Ctrl/⌘ + K» y el atajo real es **M**: la K se la quedó el
   buscador global del panel. Documentar un atajo que no existe es peor
   que no documentarlo — quien lo lea lo va a probar (M-26).

   Es la primera pulsación de la comanda tecleada: ⌘M, el número, y ya
   se está apuntando en esa mesa. Sin esto, el mesero que teclea rápido
   tenía que soltar el teclado, buscar la mesa con el ratón y volver —
   que es justo el gesto que hace que la gente siga apuntando en papel.

   Se abre con un atajo, pero no depende de él: toda mesa es tocable en
   el riel. Esto acelera, no habilita. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { Group, Hr, Key, Mono, Row } from '@/components/admin/waiter/pieces';
import { byUrgency, type TableWithState } from '@/lib/table-state';

const MAX = 7;

export default function TableJump({ tables, money, onPick, onClose }: {
  tables: TableWithState[];
  money: (n: number) => string;
  onPick: (n: number) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => {
    const t = q.trim();
    if (!t) {
      /* Sin escribir nada, lo primero son las mesas que piden algo: si
         abro el salto de mesa en hora pico, casi seguro voy a una de
         ellas.

         Y en el MISMO orden que el salón (M-26). Ordenaba por
         `state.priority` a secas, que solo mira el motivo; el salón usa
         `byUrgency`, que pesa primero el NIVEL —una llamada antes que un
         reloj corrido—. Con dos criterios, el salto de mesa proponía una
         lista distinta de la que el mesero estaba viendo dos centímetros
         más allá. */
      return byUrgency(tables).slice(0, MAX);
    }
    return tables.filter((x) => String(x.n).startsWith(t)).slice(0, MAX);
  }, [tables, q]);

  useEffect(() => { setActive(0); }, [q]);

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const t = results[active];
      if (t) onPick(t.n);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 620, background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-start',
        justifyContent: 'center', padding: '12vh 20px 20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Cambiar de mesa"
        className="anim-slide-up"
        style={{
          width: '100%', maxWidth: 460, borderRadius: 'var(--radius-lg)', overflow: 'hidden',
          background: 'var(--adm-bg)', border: '1px solid var(--adm-border-2)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', height: 56, borderBottom: '1px solid var(--adm-border)' }}>
          <Icon name="search" size={18} style={{ color: 'var(--u-text-3)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value.replace(/\D/g, '').slice(0, 3))}
            onKeyDown={onKey}
            placeholder="Número de mesa…"
            aria-label="Número de mesa"
            inputMode="numeric"
            autoComplete="off"
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'none', color: 'var(--u-text)', fontSize: 16 }}
          />
          <span style={{ display: 'inline-flex', gap: 3, flexShrink: 0 }}><Key>Esc</Key></span>
        </div>

        <div style={{ padding: 12, maxHeight: '52vh', overflowY: 'auto' }}>
          {results.length === 0 ? (
            <div style={{ padding: '24px 8px', textAlign: 'center', fontSize: 13, color: 'var(--u-text-3)' }}>
              No hay ninguna mesa {q}.
            </div>
          ) : (
            <Group>
              {results.map((t, i) => (
                <div key={t.n} style={{ background: i === active ? 'color-mix(in srgb, var(--adm-accent-500) 10%, transparent)' : 'none' }}>
                  {i > 0 && <Hr />}
                  <Row
                    onClick={() => onPick(t.n)}
                    title={`Mesa ${t.n}`}
                    sub={t.state.label}
                    right={t.occ ? <Mono size={13.5} color="var(--u-text-2)">{money(t.occ.total)}</Mono> : null}
                  />
                </div>
              ))}
            </Group>
          )}
        </div>
      </div>
    </div>
  );
}
