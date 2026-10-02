import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { fmtMoney } from '@/lib/money';
/* `Link` es aqui `PanelLink`: traduce las rutas del panel al origen desde el
   que se sirve la pagina. Lo que no es del panel pasa de largo sin tocarse.
   Ver components/admin/panel-link.tsx. */
import Link from '@/components/admin/panel-link';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getCustomers, getCustomersSummary, getCustomerOrders } from '@/lib/db/customers';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Section, SectionNote } from '@/components/ui/section';
import { Stat, StatGroup } from '@/components/ui/stat';
import { EmptyState } from '@/components/ui/empty-state';
import ClientesExportButton from '@/components/admin/clientes-export-button';
import type { Customer, Order } from '@/types';

export const metadata = { title: 'Clientes – Panel admin' };

/* ============================================================
   /admin/clientes — registro de clientes del restaurante
   ------------------------------------------------------------
   Los clientes se crean SOLOS cuando alguien hace un pedido
   (clave: teléfono). El dueño ve quiénes son, cuánto piden,
   cada cuánto vuelven y su historial al seleccionar uno.
   ============================================================ */

function fmtQ(n: number): string {
  return fmtMoney(Number(n));
}

function fmtDate(iso: string | null, tz: string): string {
  if (!iso) return '–';
  try {
    return new Date(iso).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: '2-digit', timeZone: tz });
  } catch {
    return '–';
  }
}

/** "Pide cada N días" a partir del primer y último pedido. */
function frequencyLabel(c: Customer): string {
  if (c.total_orders <= 1 || !c.first_order_at || !c.last_order_at) return 'Primera vez';
  const days =
    (new Date(c.last_order_at).getTime() - new Date(c.first_order_at).getTime()) /
    (1000 * 60 * 60 * 24) /
    (c.total_orders - 1);
  if (days < 1.5) return 'Casi a diario';
  if (days < 10) return `Cada ${Math.round(days)} días`;
  if (days < 45) return `Cada ${Math.round(days / 7)} semanas`;
  return `Cada ${Math.round(days / 30)} meses`;
}

const STATUS_ES: Record<string, string> = {
  NEW: 'Recibido', PREP: 'En preparación', READY: 'Listo',
  TRANSIT: 'En camino', DELIVERED: 'Entregado', CANCEL: 'Cancelado',
};

export default async function AdminClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; page?: string }>;
}) {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');

  let restaurantId: string | null = null;
  let timezone = 'America/Guatemala';

  if (ctx.profile.role === 'SUPER_ADMIN') {
    const headersList = await headers();
    const slug = headersList.get('x-tenant-slug');
    if (slug) {
      const tenantData = await getRestaurantBySlug(slug);
      restaurantId = tenantData?.restaurant.id ?? null;
      timezone = tenantData?.restaurant.timezone ?? timezone;
    }
  } else {
    restaurantId = ctx.profile.restaurant_id;
    timezone = ctx.restaurant?.timezone ?? timezone;
  }

  if (!restaurantId) redirect('/admin/login');

  const sp = await searchParams;
  const pageNum = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const [{ customers, page, totalPages, total }, summary] = await Promise.all([
    getCustomers(restaurantId, pageNum),
    getCustomersSummary(restaurantId),
  ]);
  const selected = sp.c ? customers.find((c) => c.id === sp.c) ?? null : null;
  const selectedOrders: Order[] = selected
    ? await getCustomerOrders(restaurantId, selected.id)
    : [];

  const totalSpent = summary.totalSpent;
  const recurrent = summary.recurrentCount;

  /* Cuántos vuelven, en porcentaje, y cuánto más gasta el que vuelve.
     El denominador son los que HAN PEDIDO, no los registrados: quien se dio
     de alta y nunca pidió no decidió no volver — todavía no ha venido, y
     meterlo en el reparto hunde el porcentaje sin querer decir nada.
     Y por debajo de cinco compradores no se enseña: "vuelve el 0%" calculado
     sobre una persona no es un dato, es una coincidencia con forma de dato. */
  const vuelvenPct = summary.buyersCount >= 5
    ? Math.round((recurrent / summary.buyersCount) * 100)
    : null;
  const { avgTicketRecurrent, avgTicketOneTime } = summary;
  const pageHref = (p: number) => `/admin/clientes?page=${p}`;

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {total > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <ClientesExportButton restaurantId={restaurantId} />
        </div>
      )}

      <Section title="Resumen">
        <StatGroup>
          <Stat label="Clientes registrados" value={String(total)} />
          <Stat label="Recurrentes (2+ pedidos)" value={String(recurrent)} />
          {vuelvenPct !== null && <Stat label="De los que piden, vuelven" value={`${vuelvenPct}%`} />}
          <Stat label="Total histórico" value={fmtQ(totalSpent)} />
        </StatGroup>
        {avgTicketRecurrent !== null && avgTicketOneTime !== null && (
          <SectionNote>
            Quien vuelve gasta {fmtQ(avgTicketRecurrent)} por pedido; quien vino una sola vez,{' '}
            {fmtQ(avgTicketOneTime)}.
          </SectionNote>
        )}
      </Section>

      {customers.length === 0 ? (
        <EmptyState
          icon="users"
          title="Aún no tenés clientes"
          desc="Se registran solos cuando alguien hace su primer pedido — no hace falta darlos de alta a mano."
          action={{ href: '/admin/qr', label: 'Comparte tu código QR' }}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          {/* Header */}
          <div className="customers-head" style={{ padding: '10px 18px', borderBottom: '1px solid var(--u-hair)' }}>
            {['Cliente', 'Pedidos', 'Total', 'Frecuencia', 'Último'].map((h) => (
              <div key={h} className="adm-label">{h}</div>
            ))}
          </div>

          {customers.map((c, i) => {
            const isSel = selected?.id === c.id;
            return (
              <div key={c.id} style={{ borderBottom: i < customers.length - 1 ? '1px solid var(--u-hair)' : 'none' }}>
                <Link
                  href={isSel ? '/admin/clientes' : `/admin/clientes?c=${c.id}`}
                  className="customers-row press"
                  style={{
                    padding: '13px 18px', textDecoration: 'none',
                    background: isSel ? 'color-mix(in srgb, var(--u-text) 5%, transparent)' : 'transparent',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--u-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.name}
                    </div>
                    <div className="t-mono" style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 2 }}>{c.phone}</div>
                  </div>
                  <div className="t-mono" style={{ fontSize: 13.5, color: 'var(--u-text)' }}>{c.total_orders}</div>
                  <div className="t-mono" style={{ fontSize: 13.5, color: 'var(--u-text)' }}>{fmtQ(Number(c.total_spent))}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--u-text-2)' }}>{frequencyLabel(c)}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--u-text-3)' }}>{fmtDate(c.last_order_at, timezone)}</div>
                </Link>

                {/* Detalle: historial del cliente seleccionado */}
                {isSel && (
                  <div style={{ padding: '4px 18px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {c.default_address && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--u-text-3)' }}>
                        <Icon name="mapPin" size={13} />
                        {c.default_address}{c.default_zone ? ` · ${c.default_zone}` : ''}
                      </div>
                    )}
                    {selectedOrders.length === 0 ? (
                      <div style={{ fontSize: 12.5, color: 'var(--u-text-4)' }}>
                        Sin pedidos enlazados aún (los anteriores a esta función no se enlazan).
                      </div>
                    ) : (
                      selectedOrders.map((o) => (
                        <Card key={o.id} className="flex flex-wrap items-center gap-3 p-3">
                          <span className="t-mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--u-text)' }}>{o.order_number}</span>
                          <span style={{ fontSize: 11.5, color: 'var(--u-text-3)' }}>{fmtDate(o.created_at, timezone)}</span>
                          <span style={{ fontSize: 11.5, color: 'var(--u-text-3)' }}>
                            {o.order_type === 'DELIVERY' ? `A domicilio${o.delivery_zone ? ` · ${o.delivery_zone}` : ''}` : 'Para llevar'}
                          </span>
                          <span
                            style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                              background: o.status === 'CANCEL' ? 'var(--c-danger-bg)' : 'color-mix(in srgb, var(--u-text) 6%, transparent)',
                              color: o.status === 'CANCEL' ? 'var(--c-danger)' : 'var(--u-text-3)',
                            }}
                          >
                            {STATUS_ES[o.status] ?? o.status}
                          </span>
                          <span className="t-mono" style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, color: 'var(--u-text)' }}>
                            {fmtQ(Number(o.total))}
                          </span>
                        </Card>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, paddingTop: 4 }}>
          {page > 1 ? (
            <Button render={<Link href={pageHref(page - 1)} />} variant="secondary" size="sm" className="rounded-adm-full">← Anteriores</Button>
          ) : (
            <Button variant="secondary" size="sm" className="rounded-adm-full" disabled>← Anteriores</Button>
          )}
          <span style={{ fontSize: 12.5, color: 'var(--u-text-3)' }}>Página {page} de {totalPages}</span>
          {page < totalPages ? (
            <Button render={<Link href={pageHref(page + 1)} />} variant="secondary" size="sm" className="rounded-adm-full">Siguientes →</Button>
          ) : (
            <Button variant="secondary" size="sm" className="rounded-adm-full" disabled>Siguientes →</Button>
          )}
        </div>
      )}
    </div>
  );
}
