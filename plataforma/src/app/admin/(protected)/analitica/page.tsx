import AvisoLectura from '@/components/admin/aviso-lectura';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getAnalytics } from '@/lib/db/analytics';
import { can } from '@/lib/permissions';
import SelectorPeriodo from '@/components/admin/selector-periodo';
import { rangoEnPalabras } from '@/lib/rango-en-palabras';
import PlatillosAnalitica from '@/components/admin/platillos-analitica';
import { EmptyState } from '@/components/ui/empty-state';
import { panelBase, panelLink } from '@/lib/panel-links-server';
import { panelHref } from '@/lib/panel-links';
import { diaDeNegocio } from '@/lib/caja/dia';
import { corteDelRestaurante } from '@/lib/db/dia-negocio';
import s from '@/components/admin/negocio.module.css';
import { getEmbudoCarta, CANALES_EMBUDO, type Embudo } from '@/lib/db/embudo';

export const metadata = { title: 'Analítica – Panel admin' };

/* ============================================================
   /admin/analitica — operación y comportamiento de ventas
   Horas pico, velocidad de productos, cancelación y tiempos.
   (El dinero vive en /admin/finanzas, y ahí también canal, pago y
   zona: aquí se repetían contados en pedidos.)

   Línea N «nada saturado» (maqueta aprobada el 2026-11-18,
   docs/diseno/MAQUETA_ANALITICA_FINANZAS_NADA_SATURADO_2026-11-18.html):
   tres cifras en una franja, el mapa de horas recortado a las horas
   con pedidos (antes eran 24 columnas que había que deslizar en el
   teléfono) y los platillos en una tarjeta «Más pedidos / Sin pedidos».
   ============================================================ */

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DIA_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
/** Lunes primero, como se lee la semana en Guatemala. */
const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0];
/** 13 → «1 p. m.» */
const hora12 = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'a. m.' : 'p. m.'}`;
const aLa = (h: number) => `${h % 12 === 1 ? 'a la' : 'a las'} ${hora12(h)}`;
const intensidad = (r: number) => `color-mix(in srgb, var(--chart-hi) ${Math.round(22 + r * 78)}%, var(--surface-2))`;

/* «Hoy» es el día de NEGOCIO (migración 145): a la 1:30 el rango por
   omisión sigue siendo el de la noche que todavía no termina. */
async function todayInTz(tz: string, restaurantId: string): Promise<string> {
  return diaDeNegocio(new Date(), tz, await corteDelRestaurante(restaurantId));
}
function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const isYmd = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const fmtMin = (m: number | null) => (m == null ? '–' : m >= 60 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m)} min`);
const pedidos = (n: number) => (n === 1 ? '1 pedido' : `${n.toLocaleString('es-GT')} pedidos`);

export default async function AdminAnaliticaPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (!can(ctx.profile.role, ctx.profile.permissions, 'analitica')) redirect(await panelLink('/admin'));

  let restaurantId: string | null = null;
  let timezone = 'America/Guatemala';
  let ordersEnabled = false;

  if (ctx.profile.role === 'SUPER_ADMIN') {
    const slug = (await headers()).get('x-tenant-slug');
    if (slug) {
      const t = await getRestaurantBySlug(slug);
      restaurantId = t?.restaurant.id ?? null;
      timezone = t?.restaurant.timezone ?? timezone;
      ordersEnabled = (t?.restaurant.modules as { orders?: boolean } | null)?.orders === true;
    }
  } else {
    restaurantId = ctx.profile.restaurant_id;
    timezone = ctx.restaurant?.timezone ?? timezone;
    ordersEnabled = (ctx.restaurant?.modules as { orders?: boolean } | null)?.orders === true;
  }

  if (!restaurantId) redirect('/admin/login');

  if (!ordersEnabled) {
    return (
      <EmptyState
        icon="chart"
        title="Analítica todavía no está activa"
        desc="Se basa en los pedidos en línea. Enciende la función Pedidos (plan Estándar) para ver horas pico, velocidad de platillos, cancelaciones y tiempos."
        action={{ href: '/admin/suscripcion', label: 'Ver planes' }}
      />
    );
  }

  const hoy = await todayInTz(timezone, restaurantId);
  const sp = await searchParams;
  const to = isYmd(sp.to) && sp.to <= hoy ? sp.to : hoy;
  const from = isYmd(sp.from) && sp.from <= to ? sp.from : shiftYmd(to, -29);

  const [a, base, embudo] = await Promise.all([getAnalytics(restaurantId, from, to, timezone), panelBase(), getEmbudoCarta(restaurantId, from, to)]);
  const rango = rangoEnPalabras(from, to, hoy);
  const selector = <SelectorPeriodo from={from} to={to} hoy={hoy} basePath="/admin/analitica" />;

  /* Con la consulta caída, los ceros de abajo dirían «0 pedidos»: no se
     pintan (auditoría 2026-11-03, X20/PA-T16). Se conserva el rango para
     reintentar el mismo. */
  if (a.estado === 'error') {
    return (
      <div className={`${s.panel} anim-fade-up`}>
        {selector}
        <AvisoLectura estado="error" que="los pedidos de este rango" noConcluir="No significa que no hayas vendido." sinDatos />
      </div>
    );
  }

  if (a.totalOrders === 0) {
    return (
      <div className={`${s.panel} anim-fade-up`}>
        {selector}
        <div className={`${s.tarjeta} ${s.vendido}`}>
          <p className={s.clave}>Sin pedidos {rango}</p>
          <p className={s.apoyo}>Elige otras fechas para ver tus horas fuertes y tus platillos.</p>
        </div>
      </div>
    );
  }

  /* Mapa de calor recortado a las horas con algún pedido: en el teléfono
     cabe sin deslizar. La hora más fuerte es el título. */
  const heatLookup = new Map(a.heat.map((c) => [`${c.day}-${c.hour}`, c.count]));
  const conPedidos = a.heat.filter((c) => c.count > 0).map((c) => c.hour);
  const primeraHora = conPedidos.length ? Math.min(...conPedidos) : 0;
  const ultimaHora = conPedidos.length ? Math.max(...conPedidos) : 23;
  const horas = Array.from({ length: ultimaHora - primeraHora + 1 }, (_, i) => primeraHora + i);
  const pico = a.heat.reduce<{ day: number; hour: number; count: number } | null>(
    (m, c) => (!m || c.count > m.count ? c : m), null,
  );

  const celdas = 2 + (a.prepSamples > 0 ? 1 : 0);
  const cancelAlto = a.cancelRate >= 10;

  return (
    <div className={`${s.panel} anim-fade-up`}>
      {selector}

      <AvisoLectura
        estado={a.estado}
        que="pedidos"
        parcial="El rango tiene más pedidos de los que esta pantalla alcanza a contar. Achica el rango para ver números completos."
      />

      <div className={`${s.tarjeta} ${s.franja}`} style={{ ['--celdas' as string]: celdas }}>
        <div><b>{a.validOrders.toLocaleString('es-GT')}</b>{a.validOrders === 1 ? 'pedido' : 'pedidos'}</div>
        <div data-alto={cancelAlto ? '' : undefined}>
          <b>{a.cancelRate.toFixed(0)} %</b>cancelados · {a.cancelled.toLocaleString('es-GT')}
        </div>
        {a.prepSamples > 0 && <div><b>{fmtMin(a.avgPrepMin)}</b>en preparar</div>}
      </div>

      <div className={`${s.columnas} ${s.columnasMapa}`}>
        <div>
          {pico && a.heatMax > 0 && (
            <section className={`${s.tarjeta} ${s.bloque}`} aria-labelledby="horas-fuertes">
              <h2 className={s.titulo} id="horas-fuertes">Se llena el {DIA_LARGO[pico.day]} {aLa(pico.hour)}</h2>
              <div
                className={s.mapa}
                style={{ gridTemplateColumns: `30px repeat(${horas.length}, minmax(0, 1fr))` }}
                role="img"
                aria-label={`Pedidos por día y hora ${rango}. La hora más fuerte es el ${DIA_LARGO[pico.day]} ${aLa(pico.hour)}, con ${pedidos(pico.count)}.`}
              >
                <span />
                {horas.map((h) => (
                  <span key={h} className={s.hora}>{h % 3 === 0 ? (h % 12 === 0 ? 12 : h % 12) : ''}</span>
                ))}
                {ORDEN_SEMANA.map((day) => [
                  <span key={`d${day}`} className={s.dia}>{WEEKDAYS[day]}</span>,
                  ...horas.map((h) => {
                    const c = heatLookup.get(`${day}-${h}`) ?? 0;
                    return (
                      <i
                        key={`${day}-${h}`}
                        className={s.celda}
                        title={`${WEEKDAYS[day]} ${hora12(h)} — ${pedidos(c)}`}
                        style={c > 0 ? { background: intensidad(c / a.heatMax) } : undefined}
                      />
                    );
                  }),
                ])}
              </div>
              <div className={s.leyenda} aria-hidden>
                Menos
                {[0, 0.25, 0.5, 0.75, 1].map((r) => (
                  <i key={r} style={r > 0 ? { background: intensidad(r) } : undefined} />
                ))}
                Más · de {hora12(primeraHora)} a {hora12(ultimaHora)}
              </div>
            </section>
          )}

          {a.deliverySamples > 0 && (
            <p className={s.linea}>Un domicilio tarda <b>{fmtMin(a.avgDeliveryMin)}</b> desde que entra hasta que se entrega.</p>
          )}
          {a.prepSamples === 0 && a.validOrders > 0 && (
            <p className={s.linea}>Los tiempos de preparación y entrega aparecen cuando marcas los pedidos como Listo y Entregado.</p>
          )}
        </div>

        <div>
          {(a.topSellers.length > 0 || a.sinPedidos.length > 0) && (
            <PlatillosAnalitica
              rango={rango}
              masPedidos={a.topSellers.map((v) => ({ name: v.name, qty: v.qty }))}
              sinPedidos={a.sinPedidos.flatMap((v) => (v.id
                ? [{ name: v.name, href: panelHref(base, `/admin/menu/productos/${v.id}`) }]
                : []))}
            />
          )}
        </div>
      </div>

      {embudo.estado !== 'falta-migracion' && embudo.estado !== 'error' && <EmbudoCarta e={embudo.datos} rango={rango} />}
    </div>
  );
}

/* ── Tu carta, de la apertura al pedido (CV-37) ───────────────
   Una línea por canal con gente: cuántos abrieron, vieron un plato,
   agregaron, llegaron al pago y pidieron, y qué parte terminó en pedido.
   Personas por día, anónimas. Sin datos todavía, la tarjeta se calla. */
const NOMBRE_CANAL: Record<(typeof CANALES_EMBUDO)[number], string> = {
  mesa: 'QR de la mesa', general: 'Enlace de la carta', platillo: 'Enlace de un platillo',
};
function EmbudoCarta({ e, rango }: { e: Embudo; rango: string }) {
  const filas = CANALES_EMBUDO.filter((c) => e[c].apertura > 0);
  if (filas.length === 0) return null;
  return (
    <section className={`${s.tarjeta} ${s.bloque}`} aria-labelledby="embudo-carta">
      <h2 className={s.titulo} id="embudo-carta">Tu carta, de abrirla a pedir · {rango}</h2>
      {filas.map((c) => {
        const f = e[c];
        const conversion = f.apertura > 0 ? Math.round((f.pedido / f.apertura) * 100) : 0;
        return (
          <p key={c} className={s.linea}>
            <b>{NOMBRE_CANAL[c]}</b>: {f.apertura.toLocaleString('es-GT')} la abrieron · {f.ficha.toLocaleString('es-GT')} vieron un platillo · {f.agregar.toLocaleString('es-GT')} agregaron · {f.checkout.toLocaleString('es-GT')} llegaron al pago · <b>{f.pedido.toLocaleString('es-GT')} pidieron ({conversion} %)</b>
          </p>
        );
      })}
      <p className={s.apoyo}>Personas por día, sin nombres ni teléfonos.</p>
    </section>
  );
}
