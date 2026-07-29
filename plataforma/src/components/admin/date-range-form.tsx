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
    outline: 'none', fontFamily: 'var(--ui-font-mono)',
  };

  /* Las dos casillas de fecha no tenían nombre: eran dos recuadros iguales
     separados por una flecha. Visualmente se adivina; para cualquier lectura
     asistida eran "campo de fecha" y "campo de fecha". Y los atajos decían
     "7d / 30d / 90d", que es jerga: se leen ahora en palabras. */
  const atajos = [
    { corto: '7 días', largo: 'Ver los últimos 7 días', d: 7 },
    { corto: '30 días', largo: 'Ver los últimos 30 días', d: 30 },
    { corto: '90 días', largo: 'Ver los últimos 90 días', d: 90 },
  ];

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label htmlFor="rango-desde" style={{ fontSize: 11.5, color: 'var(--u-text-4)', fontWeight: 600 }}>Desde</label>
        <input id="rango-desde" type="date" value={f} max={t} onChange={(e) => setF(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label htmlFor="rango-hasta" style={{ fontSize: 11.5, color: 'var(--u-text-4)', fontWeight: 600 }}>Hasta</label>
        <input id="rango-hasta" type="date" value={t} min={f} onChange={(e) => setT(e.target.value)} style={inputStyle} />
      </div>
      <button
        onClick={() => go(f, t)}
        className="press"
        style={{ padding: '10px 16px', minHeight: 40, borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: 'var(--u-text)', color: 'var(--brand-bg)' }}
      >
        Aplicar
      </button>
      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
        {atajos.map((p) => (
          <button
            key={p.d}
            onClick={() => preset(p.d)}
            aria-label={p.largo}
            className="press glass-quiet"
            style={{ padding: '10px 14px', minHeight: 40, borderRadius: 99, border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--u-text-2)', fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            {p.corto}
          </button>
        ))}
      </div>
    </div>
  );
}
