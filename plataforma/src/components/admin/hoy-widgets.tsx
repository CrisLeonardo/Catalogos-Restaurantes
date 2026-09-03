import { Icon } from '@/components/icons';
import { List, ListLink, ListRow, ListText, StatusDot } from '@/components/ui/list';
import { Section } from '@/components/ui/section';
import { Stat, StatGroup } from '@/components/ui/stat';
import type { HouseData, OnlineData, RatingsData, StockData } from '@/lib/db/hoy';
import { panelBase } from '@/lib/panel-links-server';
import { panelHref } from '@/lib/panel-links';

/* ============================================================
   WIDGETS DE "HOY"
   ------------------------------------------------------------
   Un widget NO es una pieza nueva: es un bloque del panel, con
   el mismo rótulo (`Section`), la misma tarjeta agrupada
   (`List`) y las mismas filas que ya usan "Necesita tu
   atención", "Resumen del día" y "En curso". Por eso no se
   leen como un injerto — y por eso no hay CSS nuevo aquí.

   Las dos piezas de ventas —la gráfica de 14 días y el top de
   hoy— NO están aquí: las comparte con Pedidos, y viven en
   sales-widgets.tsx.

   Reglas que se respetan en todos:
     · Un widget contesta UNA pregunta. Si contesta dos, son dos.
     · Máximo UNA acción, en el rótulo (la regla de `Section`).
     · El color va en el DATO —la cifra, el punto—, nunca en el
       fondo de la tarjeta: cinco tarjetas de colores compiten
       entre ellas y pierde el ojo.
     · Todo número en mono tabular, como el resto del panel.
     · Ninguno se pinta vacío: quien decide si aparecen es
       lib/db/hoy.ts, devolviendo null.
   ============================================================ */

/** "hace 12 min". Compartido con la lista de pedidos en curso de Hoy. */
export function agoLabel(iso: string, now: number): string {
  const d = durationLabel(iso, now);
  return d ? `hace ${d}` : 'recién';
}

/**
 * "20 min", "1 h 20 min", "3 días" — sin el "hace", para frases como
 * "lleva abierta …". null por debajo del minuto: "lleva abierta recién" no se
 * dice, y esa fila prefiere quedarse sin explicación a decir una torpeza.
 *
 * Pasado el día entero se cuenta en DÍAS. Sin eso, una fila vieja de la lista
 * de espera —o una mesa que nadie cerró— salía con un "hace 801 h 10 min"
 * que no lo lee nadie: a esa escala los minutos ya no informan de nada.
 */
function durationLabel(iso: string, now: number): string | null {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return null;
  if (mins < 60) return `${mins} min`;
  if (mins < 1440) {
    const horas = Math.floor(mins / 60);
    const resto = mins % 60;
    return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
  }
  const dias = Math.floor(mins / 1440);
  return dias === 1 ? '1 día' : `${dias} días`;
}

/** Diferencia porcentual redondeada, o null si no hay con qué comparar. */
function diffPercent(actual: number, referencia: number): number | null {
  if (referencia <= 0) return null;
  return Math.round(((actual - referencia) / referencia) * 100);
}

/* ── 3 · La casa ─────────────────────────────────────────────── */

/** Mapa mínimo de la sala: un cuadrito por mesa, lleno si está ocupada. */
function TableDots({ occupied, total }: { occupied: number; total: number }) {
  // Con más de veinticuatro mesas el mapa deja de leerse de un vistazo y se
  // convierte en un código de barras: ahí manda solo la cifra. Y si hay más
  // mesas ocupadas que configuradas —pasa: alguien abre la "Mesa 15" en un
  // salón declarado de 12— el mapa mentiría, así que tampoco se dibuja.
  if (total <= 0 || total > 24 || occupied > total) return null;
  return (
    <div className="grid shrink-0 grid-cols-6 gap-1" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className="block size-2.5 rounded-[2px] border"
          style={
            i < occupied
              ? { background: 'var(--adm-accent-500)', borderColor: 'var(--adm-accent-500)' }
              : { borderColor: 'var(--adm-border-2)' }
          }
        />
      ))}
    </div>
  );
}

/**
 * Mesas, cola y reservas en UN widget de tres filas.
 *
 * Tres módulos distintos, sí, pero una sola pregunta: ¿cómo está la sala?
 * Como tres widgets separados serían tres rótulos y tres tarjetas para tres
 * renglones de información. Cada fila desaparece por su cuenta si su módulo
 * está apagado o si hoy no tiene nada.
 */
export async function HouseWidget({
  data, now, canSeeTables,
}: {
  data: HouseData;
  now: number;
  canSeeTables: boolean;
}) {
  /* Prefijo del origen unico ('' en el subdominio de hoy). Ver lib/panel-links.ts. */
  const base = await panelBase();
  const { tables, waiting, reservation } = data;

  return (
    <Section
      title="La casa"
      action={canSeeTables ? { href: panelHref(base, '/admin/mesas'), label: 'Ver mesas' } : undefined}
    >
      <List>
        {tables && (
          <ListLink href={panelHref(base, "/admin/mesas")}>
            <TableDots occupied={tables.occupied} total={tables.total} />
            <ListText
              title={
                tables.total >= tables.occupied && tables.total > 0
                  ? `${tables.occupied} de ${tables.total} mesas ocupadas`
                  : `${tables.occupied} ${tables.occupied === 1 ? 'mesa ocupada' : 'mesas ocupadas'}`
              }
              desc={
                tables.oldest && durationLabel(tables.oldest.since, now)
                  ? `La ${tables.oldest.n} lleva abierta ${durationLabel(tables.oldest.since, now)}.`
                  : undefined
              }
            />
            <Icon name="chevronRight" size={15} className="shrink-0 text-adm-text-4" />
          </ListLink>
        )}

        {waiting && (
          <ListLink href={panelHref(base, "/admin/lista-espera")}>
            <span className="t-mono w-11 shrink-0 text-[19px] font-semibold text-adm-text">
              {waiting.count}
            </span>
            <ListText
              title={waiting.count === 1 ? 'Grupo esperando mesa' : 'Grupos esperando mesa'}
              desc={`El primero de la fila llegó ${agoLabel(waiting.since, now)}.`}
            />
            <span
              className="shrink-0 text-[13.5px] font-semibold"
              style={{ color: 'var(--brand-accent-ink, var(--adm-accent-500))' }}
            >
              Ver la fila
            </span>
          </ListLink>
        )}

        {reservation && (
          <ListLink href={panelHref(base, "/admin/reservaciones")}>
            <span className="t-mono w-11 shrink-0 text-[14px] font-semibold text-adm-text-2">
              {reservation.time}
            </span>
            <ListText
              title={`${reservation.name} · ${reservation.partySize} ${reservation.partySize === 1 ? 'persona' : 'personas'}`}
              desc={
                reservation.more > 0
                  ? `Y ${reservation.more} ${reservation.more === 1 ? 'reserva más' : 'reservas más'} hoy.`
                  : 'La única reserva de hoy.'
              }
            />
            <Icon name="chevronRight" size={15} className="shrink-0 text-adm-text-4" />
          </ListLink>
        )}
      </List>
    </Section>
  );
}

/* ── 4 · Se está acabando ────────────────────────────────────── */

/**
 * Existencias bajas y agotados.
 *
 * Es el único widget que cuesta dinero por NO verse: quien no se entera de que
 * algo se está acabando no lo repone, y a media noche lo pide media sala.
 *
 * Habla de EXISTENCIAS, no de si el platillo se ve en el menú: son dos cosas
 * distintas —lo marcado agotado vuelve solo a las doce horas, ver
 * lib/product-availability.ts— y esa segunda pregunta la contesta el widget de
 * la pantalla Menú. Lo agotado va primero y en rojo; lo bajo, en ámbar.
 */
export async function StockWidget({ data, canSeeInventory }: { data: StockData; canSeeInventory: boolean }) {
  /* Prefijo del origen unico ('' en el subdominio de hoy). Ver lib/panel-links.ts. */
  const base = await panelBase();

  const filas = [
    ...data.out.map((p) => ({ ...p, agotado: true })),
    ...data.low.map((p) => ({ ...p, agotado: false })),
  ];
  const resto = data.total - filas.length;

  return (
    <Section
      title="Se está acabando"
      action={canSeeInventory ? { href: panelHref(base, '/admin/inventario'), label: 'Ver inventario' } : undefined}
    >
      <List>
        {filas.map((p) => (
          <ListRow key={p.name}>
            <StatusDot tone={p.agotado ? 'danger' : 'warn'} size={9} />
            <ListText
              title={p.name}
              desc={
                p.agotado
                  ? 'Sin existencias. Se marcó agotado solo.'
                  : `Quedan pocas. Avisas por debajo de ${p.threshold}.`
              }
            />
            <span
              className="t-mono shrink-0 text-[15px] font-semibold"
              style={{ color: p.agotado ? 'var(--c-danger)' : 'var(--c-warn)' }}
            >
              {p.stock}
            </span>
          </ListRow>
        ))}
        {resto > 0 && canSeeInventory && (
          <ListLink
            href={panelHref(base, "/admin/inventario")}
            className="gap-2 text-[14px] font-semibold"
            style={{ color: 'var(--brand-accent-ink, var(--adm-accent-500))' }}
          >
            Ver {resto === 1 ? 'el otro producto' : `los otros ${resto} productos`}
            <Icon name="chevronRight" size={15} />
          </ListLink>
        )}
      </List>
    </Section>
  );
}

/* ── 5 · Lo que dicen tus clientes ───────────────────────────── */

/**
 * Nota media de la SEMANA y el último comentario.
 *
 * Semanal, no diario: por eso va abajo del todo. El promedio histórico no se
 * mueve y no es noticia; el de esta semana sí, y el comentario es lo que de
 * verdad se lee.
 */
export async function RatingsWidget({ data, now, canSeeSurveys }: {
  data: RatingsData;
  now: number;
  canSeeSurveys: boolean;
}) {
  /* Prefijo del origen unico ('' en el subdominio de hoy). Ver lib/panel-links.ts. */
  const base = await panelBase();
  const max = Math.max(...data.distribution, 1);

  return (
    <Section
      title="Lo que dicen tus clientes"
      action={canSeeSurveys ? { href: panelHref(base, '/admin/encuestas'), label: 'Ver encuestas' } : undefined}
    >
      <List>
        <ListRow>
          <div className="w-28 shrink-0">
            <div className="t-mono text-[28px] leading-none font-semibold text-adm-text">
              {data.average.toFixed(1)}
            </div>
            <div className="mt-1 text-[13px] text-adm-text-3">
              de 5 · {data.count} esta semana
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {data.distribution.map((n, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="t-mono w-2.5 text-[11.5px] text-adm-text-4">{5 - i}</span>
                <span
                  className="h-1.5 flex-1 overflow-hidden rounded-adm-full"
                  style={{ background: 'color-mix(in srgb, var(--u-text) 9%, transparent)' }}
                >
                  <span
                    className="block h-full rounded-adm-full"
                    style={{ width: `${(n / max) * 100}%`, background: 'var(--adm-accent-500)' }}
                  />
                </span>
              </div>
            ))}
          </div>
        </ListRow>

        {data.latest && (
          <ListRow>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] leading-snug text-adm-text-2">
                «{data.latest.comment}»
              </div>
              <div className="mt-0.5 text-[13px] text-adm-text-3">
                {data.latest.who ? `${data.latest.who} · ` : ''}
                {agoLabel(data.latest.at, now)} ·{' '}
                {data.latest.rating} {data.latest.rating === 1 ? 'estrella' : 'estrellas'}
              </div>
            </div>
          </ListRow>
        )}
      </List>
    </Section>
  );
}

/* ── 6 · Tu menú en línea ────────────────────────────────────── */

/**
 * Visitas al menú, pedidos y cuánto se convierte.
 *
 * Tapa un hueco real: en el plan Básico —sin pedidos en línea— "Resumen del
 * día" no se pinta, y la portada Hoy se quedaba COMPLETAMENTE vacía. Este es
 * el único widget que ese restaurante ve, y es justo el número que le importa:
 * cuánta gente está mirando su menú.
 */
export function OnlineWidget({ data, showOrders }: { data: OnlineData; showOrders: boolean }) {
  const conversion = data.today > 0 ? Math.round((data.orders / data.today) * 100) : 0;
  const delta = diffPercent(data.today, data.typicalDay);

  return (
    <Section title="Tu menú en línea">
      <div className="overflow-hidden rounded-adm-xl border border-adm-border bg-adm-card shadow-adm-sm">
        <StatGroup className="rounded-none border-0 shadow-none">
          <Stat label="Visitas hoy" value={String(data.today)} />
          <Stat label="Personas distintas" value={String(data.uniqueToday)} />
          {showOrders && <Stat label="Piden" value={`${conversion}%`} />}
        </StatGroup>
        {delta !== null && Math.abs(delta) >= 5 && (
          <div className="border-t border-adm-border px-4 py-2.5 text-[13.5px] leading-snug text-adm-text-2 md:px-5.5">
            Un día normal recibe <span className="t-mono">{Math.round(data.typicalDay)}</span> visitas.
            Hoy vas{' '}
            <span className="t-mono" style={{ color: delta > 0 ? 'var(--c-ok)' : 'var(--u-text-2)' }}>
              {Math.abs(delta)}%
            </span>{' '}
            {delta > 0 ? 'arriba' : 'abajo'}.
          </div>
        )}
      </div>
    </Section>
  );
}
