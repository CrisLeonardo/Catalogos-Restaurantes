'use client';

import { useState } from 'react';

export function ServicePreferencesCtl({ items, onChange }: { items: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  function add() {
    const v = draft.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setDraft('');
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ flex: 1, fontSize: 13, color: 'var(--u-text-2)', padding: '7px 10px', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', borderRadius: 'var(--radius-md)', border: '1px solid var(--u-hair)' }}>
            {item}
          </span>
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="press"
            style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--c-danger-line)', background: 'transparent', color: 'var(--c-danger)', flexShrink: 0 }}
          >
            Quitar
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Nueva preferencia…"
          style={{
            flex: 1, background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', border: '1px solid var(--u-hair-2)',
            borderRadius: 'var(--radius-md)', padding: '7px 10px', color: 'var(--u-text)', fontSize: 13, outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={add}
          className="press"
          style={{ padding: '7px 14px', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--u-hair-2)', background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', color: 'var(--u-text-2)', flexShrink: 0 }}
        >
          Agregar
        </button>
      </div>
    </div>
  );
}
