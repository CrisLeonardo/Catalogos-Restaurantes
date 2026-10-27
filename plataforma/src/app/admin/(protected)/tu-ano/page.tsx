import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getSalesReport } from '@/lib/db/reports';
import { countVisitsInRange } from '@/lib/db/visits';
import { corteDelRestaurante } from '@/lib/db/dia-negocio';
import { createServiceClient } from '@/lib/supabase/service';
import { diaDeNegocio, inicioDelDia } from '@/lib/caja/dia';
import { can } from '@/lib/permissions';
import { formatPrice, type ResolvedTheme } from '@/lib/theme/resolve';
import { fmtMoney } from '@/lib/money';
import { Leo } from '@/components/leo';
import { Rodillo } from '@/components/ui/rodillo';
import { EmptyState } from '@/components/ui/empty-state';
import CompartirAno from '@/components/admin/momentos/compartir-ano';
import type { DatosDelAno } from '@/lib/compartir/ano';

export const metadata = { title: 'Tu año con Leogin – Panel admin' };

/* ============================================================
   /admin/tu-ano — «Tu año con Leogin» (estrategia R7)
   ------------------------------------------------------------
   El resumen del año en curso, del 1 de enero a hoy, para mirar
   con orgullo y compartir: lo vendido, los pedidos, el plato
   estrella, el mejor día, por dónde pidieron, los clientes nuevos
   y las visitas al menú. Las cifras salen del mismo reporte que
   Métricas y Finanzas (leogin_sales_report), así que cuadran.

   No está en el menú del panel (la disciplina de seis destinos):
   se llega desde Métricas y desde el hito de cada aniversario.
   ============================================================ */

const LARGA = new Intl.DateTimeFormat('es-GT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

function fechaLarga(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = LARGA.format(new Date(Date.UTC(y, m - 1, d, 12)));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default async function TuAnoPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (!can(ctx.profile.role, ctx.profile.permissions, 'metricas')) redirect('/admin');

  let restaurantId: string | null = ctx.profile.restaurant_id ?? null;
  let nombre = ctx.restaurant?.name ?? 'Tu restaurante';
  let timezone = ctx.restaurant?.timezone ?? 'America/Guatemala';
  let resolved: ResolvedTheme | null = null;
  const slug = (await headers()).get('x-tenant-slug');
  if (slug) {
    const t = await getRestaurantBySlug(slug);
    if (t) {
      resolved = t.resolved;
      if (ctx.profile.role === 'SUPER_ADMIN') {
        restaurantId = t.restaurant.id;
        nombre = t.restaurant.name;
        timezone = t.restaurant.timezone ?? timezone;
      }
    }
  }
  if (!restaurantId) redirect('/admin/login');

  const corte = await corteDelRestaurante(restaurantId);
  const hoy = diaDeNegocio(new Date(), timezone, corte);
  const ano = Number(hoy.slice(0, 4));
  const desde = `${ano}-01-01`;

  const [reporte, visitas, { count: clientesNuevos }] = await Promise.all([
    getSalesReport(restaurantId, desde, hoy, timezone, corte),
    countVisitsInRange(restaurantId, desde, hoy, timezone),
    createServiceClient()
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .gte('created_at', inicioDelDia(desde, timezone, corte).toISOString()),
  ]);

  const money = (n: number) => (resolved ? formatPrice(n, resolved.config) : fmtMoney(n));
  const miles = (n: number) => n.toLocaleString('es-GT');

  const mejorDia = reporte.series.reduce<typeof reporte.series[number] | null>(
    (m, d) => (!m || d.revenue > m.revenue ? d : m), null,
  );
  // El plato estrella es el que más se pidió, no el que más dinero dejó.
  const estrella = [...reporte.topByRevenue].sort((a, b) => b.qty - a.qty)[0] ?? null;
  const canal = [...reporte.byChannel].sort((a, b) => b.orders - a.orders)[0] ?? null;
  const pctCanal = canal && reporte.orders > 0 ? Math.round((canal.orders / reporte.orders) * 100) : 0;

  if (reporte.orders === 0) {
    return (
      <div className="anim-fade-up adm-w-overview flex flex-col gap-6">
        <EmptyState
          icon="calendar"
          title={`Tu ${ano} con Leogin empieza con tu primer pedido`}
          desc="Cuando tus clientes empiecen a pedir, aquí verás cuánto vendiste, tu plato estrella y tu mejor día del año."
          action={{ label: 'Comparte tu menú', href: '/admin/qr', icon: null }}
        />
      </div>
    );
  }

  const tarjetas: Array<{ etiqueta: string; valor: string; detalle?: string; rodar?: boolean }> = [
    { etiqueta: 'Vendiste', valor: money(reporte.revenue), detalle: `Ticket promedio ${money(reporte.avgTicket)}`, rodar: true },
    { etiqueta: 'Pedidos', valor: miles(reporte.orders), rodar: true },
    ...(estrella ? [{ etiqueta: 'Tu plato estrella', valor: estrella.name, detalle: `${miles(estrella.qty)} vendidos` }] : []),
    ...(mejorDia ? [{ etiqueta: 'Tu mejor día', valor: fechaLarga(mejorDia.date), detalle: `${money(mejorDia.revenue)} en ${mejorDia.orders} pedidos` }] : []),
    ...(canal && pctCanal > 0 ? [{ etiqueta: 'Así te pidieron', valor: canal.label, detalle: `${pctCanal} % de los pedidos` }] : []),
    ...((clientesNuevos ?? 0) > 0 ? [{ etiqueta: 'Clientes nuevos', valor: miles(clientesNuevos ?? 0), rodar: true }] : []),
    ...(visitas > 0 ? [{ etiqueta: 'Visitas a tu menú', valor: miles(visitas), rodar: true }] : []),
  ];

  const datos: DatosDelAno = {
    ano,
    restaurante: nombre,
    cifras: tarjetas.slice(0, 4).map((t) => ({ etiqueta: t.etiqueta, valor: t.valor })),
  };

  return (
    <div className="anim-fade-up adm-w-overview flex flex-col gap-6">
      <div className="tu-ano-portada">
        <div className="min-w-0">
          <p className="tu-ano-ceja">Tu año con Leogin</p>
          <h1 className="tu-ano-numero">{ano}</h1>
          <p style={{ fontSize: 15, color: 'rgba(251, 246, 238, 0.74)', margin: '6px 0 16px' }}>
            {nombre} · del 1 de enero a hoy
          </p>
          <CompartirAno datos={datos} leoId="tu-ano" />
        </div>
        <div data-leo="tu-ano" className="shrink-0">
          <Leo id="leo-tu-ano" expresion="feliz" size={150} sticker />
        </div>
      </div>

      <div className="tu-ano-cifras">
        {tarjetas.map((t) => (
          <div key={t.etiqueta} className="tu-ano-cifra">
            <span className="tu-ano-etiqueta">{t.etiqueta}</span>
            <strong className={t.rodar ? 't-mono' : undefined}>{t.rodar ? <Rodillo texto={t.valor} /> : t.valor}</strong>
            {t.detalle && <span className="tu-ano-detalle">{t.detalle}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
