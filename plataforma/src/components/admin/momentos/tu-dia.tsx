import { Icon } from '@/components/icons';
import { Leo } from '@/components/leo';
import type { HoraPico, RecordDelDia } from '@/lib/momentos';

/* «Tu día» (PLAN_MOMENTOS_PICO, P4 · estrategia R3): debajo de las tres
   cifras del resumen, lo que cambia cada día y da ganas de volver a mirar:
   el plato estrella, la hora pico y, si de verdad lo es, el récord. Cada
   pieza sale solo si tiene algo cierto que decir (lib/momentos.ts). */
export function TuDiaTira({
  estrella,
  horaPico,
  record,
  compartir,
}: {
  estrella: { name: string; qty: number } | null;
  horaPico: HoraPico | null;
  record: RecordDelDia | null;
  /** El botón de «Comparte tu plato del día», si quien mira puede usarlo. */
  compartir?: React.ReactNode;
}) {
  if (!estrella && !horaPico && !record) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {record && (
        <span className="tu-dia-chip tu-dia-record">
          <Leo id="leo-record" expresion="feliz" size={26} />
          {record.texto}
        </span>
      )}
      {estrella && (
        <span className="tu-dia-chip">
          <Icon name="star" size={14} />
          <span>
            Plato estrella: <strong>{estrella.name}</strong> · {estrella.qty}
          </span>
          {compartir}
        </span>
      )}
      {horaPico && (
        <span className="tu-dia-chip">
          <Icon name="clock" size={14} />
          Hora pico: {horaPico.texto.charAt(0).toLowerCase() + horaPico.texto.slice(1)} · {horaPico.pedidos} pedidos
        </span>
      )}
    </div>
  );
}
