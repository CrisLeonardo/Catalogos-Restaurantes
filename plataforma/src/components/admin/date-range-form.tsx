'use client';

/* Selector de rango de fechas para /admin/finanzas. Navega con ?from&to;
   la página (server component) re-renderiza con el nuevo rango. */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DateRangeForm({ from, to, basePath = '/admin/finanzas' }: { from: string; to: string; basePath?: string }) {
  const router = useRouter();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  function go(nf: string, nt: string) {
    router.push(`${basePath}?from=${nf}&to=${nt}`);
  }

  function preset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    const nf = ymd(start), nt = ymd(end);
    setF(nf); setT(nt); go(nf, nt);
  }

  const inputStyle: React.CSSProperties = {
    background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair)',
    borderRadius: 10, padding: '8px 11px', color: 'var(--u-text)', fontSize: 13,
    outline: 'none', fontFamily: 'var(--ui-font-mono)', colorScheme: 'dark',
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <input type="date" value={f} max={t} onChange={(e) => setF(e.target.value)} style={inputStyle} />
      <span style={{ color: 'var(--u-text-4)', fontSize: 13 }}>→</span>
      <input type="date" value={t} min={f} onChange={(e) => setT(e.target.value)} style={inputStyle} />
      <button
        onClick={() => go(f, t)}
        className="press"
        style={{ padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: 'var(--u-text)', color: 'var(--brand-bg)' }}
      >
        Aplicar
      </button>
      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
        {[{ l: '7d', d: 7 }, { l: '30d', d: 30 }, { l: '90d', d: 90 }].map((p) => (
          <button
            key={p.d}
            onClick={() => preset(p.d)}
            className="press glass-quiet"
            style={{ padding: '8px 12px', borderRadius: 99, border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--u-text-2)', fontWeight: 600 }}
          >
            {p.l}
          </button>
        ))}
      </div>
    </div>
  );
}
