import { List, ListRow } from '@/components/ui/list';
import { Section } from '@/components/ui/section';
import type { DaySale, DayPace, TopProduct } from '@/lib/db/orders';

/* ============================================================
   VENTAS — las dos piezas que comparten Hoy y Pedidos
   ------------------------------------------------------------
   Estaban DUPLICADAS: Pedidos tenía su propia gráfica de 14
   días y su propio "Top de hoy", escritos con el vocabulario
   anterior al rediseño (tarjeta suelta, rótulo `.t-poster` en
   mayúsculas), y Hoy estrenó otras dos con el vocabulario
   nuevo. Misma consulta, mismos datos, dos aspectos distintos
   en dos pantallas contiguas.

   Aquí hay una sola de cada una. Las dos tienen que verse bien
   tanto a lo ancho de la columna de contenido de Hoy (~976 px)
   como en la columna estrecha de Pedidos (300 px), así que
   NADA lleva ancho fijo: las barras crecen y se encogen, y el
   texto se trunca antes de desbordar. Es también la razón de
   que no se usen puntos de ruptura (`md:`) para el ancho: la
   columna de Pedidos mide 300 px en una pantalla grande, donde
   cualquier media query diría "escritorio".
   ============================================================ */

type Money = (n: number) => string;

/** Diferencia porcentual redondeada, o null si no hay con qué comparar. */
function diffPercent(actual: number, referencia: number): number | null {
  if (referencia <= 0) return null;
  return Math.round(((actual - referencia) / referencia) * 100);
}

/* ── Cómo va el día ──────────────────────────────────────────── */

/**
 * La serie de 14 días y una frase que la interpreta.
 *
 * No repite el total de hoy: las dos pantallas que la usan ya lo tienen a
 * pocos centímetros —"Resumen del día" en Hoy, la fila de cifras en Pedidos—
 * y enseñar el mismo número dos veces en la misma pantalla no informa, solo
 * ocupa. Lo que esta pieza añade es lo único que convierte un número en
 * información: con qué compararlo.
 *
 * Y la comparación es contra lo que un día igual llevaba A ESTA HORA (ver
 * getDayPace), no contra su total: a la una de la tarde nadie lleva lo que
 * cerrará.
 */
export function SalesTrendWidget({
  series, totalLast14, pace, todaySales, money, title = 'Cómo va el día',
}: {
  series: DaySale[];
  totalLast14: number;
  pace: DayPace | null;
  todaySales: number;
  money: Money;
  title?: string;
}) {
  const max = Math.max(...series.map((d) => d.total), 1);
  const delta = pace ? diffPercent(todaySales, pace.typicalSoFar) : null;

  return (
    <Section title={title}>
      <List>
        {/* La cifra a un lado y la gráfica al otro cuando hay sitio; en la
            columna estrecha de Pedidos la gráfica se va sola al renglón de
            abajo (`flex-wrap`), sin punto de ruptura de por medio: lo que
            manda aquí es el ancho del CONTENEDOR, no el de la pantalla. */}
        <ListRow className="flex-wrap items-end gap-x-6 gap-y-3 py-4">
          {/* El mínimo de la cifra es lo que dispara el salto de renglón:
              mientras pueda encogerse hasta cero, flexbox siempre "encuentra
              sitio" para las dos columnas y acaba recortando el importe. */}
          <div className="min-w-[140px] flex-1">
            <div className="text-[13px] text-adm-text-3">Últimos 14 días</div>
            <div className="t-mono mt-1 text-[20px] leading-none font-semibold text-adm-text">
              {money(totalLast14)}
            </div>
          </div>

          {/* Catorce barras piden unos 320 px para leerse: más estrecho se
              aplastan y más ancho se convierten en losas separadas por
              huecos enormes. De ahí el tope — el espacio que sobra se lo
              queda la cifra de la izquierda, no la gráfica.

              El mínimo de 260 px no es decorativo: es lo que obliga a la
              gráfica a bajarse al renglón siguiente antes de que la cifra se
              quede sin sitio. Con 220 px cabían las dos en un teléfono, pero
              a la cifra le tocaban 70 px para un importe que mide 118, y el
              texto se salía por debajo de las barras. */}
          <div className="w-full max-w-[340px] min-w-[260px] flex-[2]">
            <div className="flex h-24 items-end gap-[3px]">
              {series.map((d, i) => (
                <span
                  key={i}
                  title={`${d.label}: ${money(d.total)}`}
                  className="block min-w-[4px] flex-1 rounded-t-[3px]"
                  style={{
                    height: `${Math.max(d.total > 0 ? 6 : 2, (d.total / max) * 100)}%`,
                    background: d.isToday
                      ? 'var(--adm-accent-500)'
                      : 'color-mix(in srgb, var(--u-text) 13%, transparent)',
                  }}
                />
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-adm-text-4">
              <span>hace 14 días</span>
              <span>hoy</span>
            </div>
          </div>
        </ListRow>

        {pace && delta !== null && (
          <ListRow className="py-2.5">
            <div className="text-[13.5px] leading-snug text-adm-text-2">
              Un día como hoy a esta hora va en{' '}
              <span className="t-mono">{money(pace.typicalSoFar)}</span>.{' '}
              {delta === 0 ? (
                'Vas igual.'
              ) : (
                <>
                  Vas{' '}
                  <span
                    className="t-mono"
                    style={{ color: delta > 0 ? 'var(--c-ok)' : 'var(--c-warn)' }}
                  >
                    {Math.abs(delta)}%
                  </span>{' '}
                  {delta > 0 ? 'arriba' : 'abajo'}.
                </>
              )}
            </div>
          </ListRow>
        )}
      </List>
    </Section>
  );
}

/* ── Lo que más sale hoy ─────────────────────────────────────── */

/**
 * Los platillos más vendidos de HOY, para decidir qué preparar en la
 * siguiente tanda. `topToday` viene ya calculado por getOrderStats, así que
 * esta pieza no cuesta una consulta en ninguna de las dos pantallas.
 */
export function TopTodayWidget({ items }: { items: TopProduct[] }) {
  const max = Math.max(...items.map((i) => i.qty), 1);

  return (
    <Section title="Lo que más sale hoy">
      <List>
        {items.map((item) => (
          <ListRow key={item.name} className="gap-3 py-2.5">
            <div className="min-w-0 flex-[2] truncate text-[14px] text-adm-text">{item.name}</div>
            <div
              className="h-1.5 min-w-8 max-w-40 flex-1 overflow-hidden rounded-adm-full"
              style={{ background: 'color-mix(in srgb, var(--u-text) 9%, transparent)' }}
            >
              <span
                className="block h-full rounded-adm-full"
                style={{ width: `${(item.qty / max) * 100}%`, background: 'var(--adm-accent-500)' }}
              />
            </div>
            <div className="t-mono w-7 shrink-0 text-right text-[14px] text-adm-text">{item.qty}</div>
          </ListRow>
        ))}
      </List>
    </Section>
  );
}
