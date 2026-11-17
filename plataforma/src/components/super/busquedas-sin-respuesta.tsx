import { Card } from '@/components/ui/card';
import type { BusquedaSinRespuesta } from '@/lib/ayuda/sin-respuesta';

/* Super › Configuración › Soporte: lo que los restaurantes buscan en Ayuda
   y no encuentran (ficha 2.9). Solo la frase; la respuesta se agrega en
   `lib/ayuda/intenciones.ts`. */
export default function BusquedasSinRespuesta({ filas, migracionPendiente }: { filas: BusquedaSinRespuesta[]; migracionPendiente: boolean }) {
  const fecha = new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'short', timeZone: 'America/Guatemala' });
  return (
    <Card style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', margin: 0 }}>
          Lo que buscan en Ayuda y no encuentran
        </h3>
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', margin: 0, lineHeight: 1.5 }}>
          Últimos 30 días, lo más pedido primero. Solo se guarda la frase, nunca quién la escribió.
        </p>
      </div>
      {migracionPendiente ? (
        <p style={{ fontSize: 13, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.55 }}>
          Falta correr <code>supabase/migrations/186_ayuda_sin_respuesta.sql</code> en esta base. Hasta entonces
          la Ayuda funciona igual, pero no anota lo que no encuentra.
        </p>
      ) : filas.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--u-text-3)', margin: 0 }}>Nadie se ha quedado sin respuesta en estos 30 días.</p>
      ) : (
        <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, border: '1px solid var(--adm-border)', borderRadius: 12, overflow: 'hidden' }}>
          {filas.map((f, i) => (
            <li key={f.frase + i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i ? '1px solid var(--adm-border)' : 0 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--u-text)', overflowWrap: 'anywhere' }}>«{f.frase}»</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--u-text-4)', marginTop: 1 }}>
                  {f.restaurantes.length ? f.restaurantes.slice(0, 3).join(', ') + (f.restaurantes.length > 3 ? ` y ${f.restaurantes.length - 3} más` : '') : 'Sin restaurante'}
                  {' · '}{fecha.format(new Date(f.ultima))}
                </span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text-2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {f.veces === 1 ? '1 vez' : `${f.veces} veces`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
