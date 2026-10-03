'use client';

/* Selector de rango de fechas para /admin/finanzas. Navega con ?from&to;
   la página (server component) re-renderiza con el nuevo rango. */

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { panelBaseFrom, panelHref } from '@/lib/panel-links';
import { Button } from '@/components/ui/button';

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DateRangeForm({ from, to, basePath = '/admin/finanzas' }: { from: string; to: string; basePath?: string }) {
  const router = useRouter();
  /* `basePath` es una ruta INTERNA (`/admin/finanzas`). Sin traducirla, cambiar
     el rango de fechas sacaba del panel a quien entró por el origen único: se
     tocaba "30 días" y se aterrizaba fuera. Ver lib/panel-links.ts. */
  const base = panelBaseFrom(usePathname());
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  function go(nf: string, nt: string) {
    router.push(`${panelHref(base, basePath)}?from=${nf}&to=${nt}`);
  }

  function rangeFor(days: number): { nf: string; nt: string } {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    return { nf: ymd(start), nt: ymd(end) };
  }

  function preset(days: number) {
    const { nf, nt } = rangeFor(days);
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
      {/* Neutro: en negro competía con el periodo elegido en naranja, dos
          colores para el mismo control (NEG-03). */}
      <Button type="button" variant="secondary" onClick={() => go(f, t)} className="min-h-10">
        Aplicar
      </Button>
      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
        {atajos.map((p) => {
          const { nf, nt } = rangeFor(p.d);
          const activo = f === nf && t === nt;
          return (
            <button
              key={p.d}
              onClick={() => preset(p.d)}
              aria-label={p.largo}
              aria-pressed={activo}
              className={activo ? 'press' : 'press glass-quiet'}
              style={{
                padding: '10px 14px', minHeight: 40, borderRadius: 99, border: 'none', cursor: 'pointer',
                fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
                background: activo ? 'var(--brand-accent)' : undefined,
                color: activo ? 'var(--brand-on-accent, #fff)' : 'var(--u-text-2)',
                boxShadow: activo ? '0 4px 14px color-mix(in srgb, var(--brand-accent) 28%, transparent)' : undefined,
              }}
            >
              {p.corto}
            </button>
          );
        })}
      </div>
    </div>
  );
}
