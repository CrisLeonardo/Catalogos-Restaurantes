import { Section } from '@/components/ui/section';
import { Stat, StatGroup } from '@/components/ui/stat';

/* ── Pedidos · Tiempos de hoy ────────────────────────────────── */

export interface TimesData {
  /** Minutos medios entre que entra el pedido y se entrega/sirve. */
  avgTotal: number;
  /** Cuántos pasaron de media hora. */
  slow: number;
  /** El más lento de hoy, si hubo alguno pasado de media hora. */
  worst: { label: string; minutes: number } | null;
  /** Sobre cuántos pedidos cerrados se calculó. */
  sample: number;
}

/**
 * Cuánto se está tardando hoy.
 *
 * La cocina no sabe si va lenta hasta que alguien se queja. Sale de
 * `created_at` y de la marca de cierre de cada pedido, que ya están en los
 * pedidos cerrados que la pantalla carga: cero consultas nuevas.
 */
export function TimesWidget({ data }: { data: TimesData }) {
  return (
    <Section title="Tiempos de hoy">
      <div className="overflow-hidden rounded-adm-xl border border-adm-border bg-adm-card shadow-adm-sm">
        <StatGroup className="rounded-none border-0 shadow-none">
          <Stat label="Del pedido a la mesa" value={`${data.avgTotal} min`} />
          <Stat label="Pedidos medidos" value={String(data.sample)} />
          <Stat
            label="Pasaron de 30 min"
            value={String(data.slow)}
            tone={data.slow > 0 ? 'warn' : undefined}
          />
        </StatGroup>
        {data.worst && (
          <div className="border-t border-adm-border px-4 py-2.5 text-[13.5px] leading-snug text-adm-text-2 md:px-5.5">
            El más lento fue {data.worst.label}, con{' '}
            <span className="t-mono">{data.worst.minutes} min</span>.
          </div>
        )}
      </div>
    </Section>
  );
}
