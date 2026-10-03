import { createServiceClient } from '@/lib/supabase/service';
import type { Customer, Order } from '@/types';
import type { CustomerSort } from '@/lib/customer-sort';

/* Lecturas del registro de clientes para el panel del dueño.
   Como el resto de src/lib/db, usa el service role: las páginas
   que llaman ya validaron la sesión y el restaurante del admin. */

export const CUSTOMERS_PAGE_SIZE = 20;

/* Texto de búsqueda listo para un filtro `or=` de PostgREST: fuera las comas,
   paréntesis, comodines y barras, que cambian el sentido del filtro. */
function searchTerms(q: string): { text: string; digits: string } | null {
  const text = q.replace(/[,()*%\\:"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!text) return null;
  return { text, digits: text.replace(/\D/g, '') };
}

export interface CustomersPage {
  customers: Customer[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Clientes del restaurante, PAGINADOS (de 20 en 20 por defecto). Devuelve solo
 * la página pedida + el total para construir los controles. Los totales gastados
 * se calculan únicamente para los clientes de la página (no se traen todos los
 * pedidos), así no se degrada con miles de registros.
 */
export async function getCustomers(
  restaurantId: string,
  page = 1,
  pageSize = CUSTOMERS_PAGE_SIZE,
  opts: { q?: string; sort?: CustomerSort; inactiveDays?: number } = {},
): Promise<CustomersPage> {
  const db = createServiceClient();
  const size = Math.min(Math.max(pageSize, 1), 100);

  /* Buscar por nombre o por teléfono. El teléfono se guarda solo con
     dígitos, así que «5555-1234» o «5555 1234» lo encuentran igual. */
  const terms = opts.q ? searchTerms(opts.q) : null;
  const orFilter = terms
    ? [`name.ilike.*${terms.text}*`, ...(terms.digits.length >= 3 ? [`phone.ilike.*${terms.digits}*`] : [])].join(',')
    : null;

  /* «No vuelven»: su último pedido fue hace más de N días (CLI-06). Quien
     nunca pidió no entra: no es alguien que dejó de venir. */
  const inactiveBefore = opts.inactiveDays
    ? new Date(Date.now() - opts.inactiveDays * 86_400_000).toISOString()
    : null;

  // Total para la paginación.
  let countQuery = db
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId);
  if (orFilter) countQuery = countQuery.or(orFilter);
  if (inactiveBefore) countQuery = countQuery.lt('last_order_at', inactiveBefore);
  const { count } = await countQuery;
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const from = (safePage - 1) * size;

  /* «Más gasto» y «Más pedidos» ordenan por las columnas guardadas de la
     ficha, que pueden contar un pedido que luego se canceló; la cifra que se
     enseña sí sale de los pedidos entregados (abajo). Para ordenar basta. */
  let dataQuery = db
    .from('customers')
    .select('*')
    .eq('restaurant_id', restaurantId);
  if (orFilter) dataQuery = dataQuery.or(orFilter);
  if (inactiveBefore) dataQuery = dataQuery.lt('last_order_at', inactiveBefore);
  const sort = opts.sort ?? 'recientes';
  dataQuery = sort === 'gasto'
    ? dataQuery.order('total_spent', { ascending: false }).order('last_order_at', { ascending: false, nullsFirst: false })
    : sort === 'pedidos'
      ? dataQuery.order('total_orders', { ascending: false }).order('last_order_at', { ascending: false, nullsFirst: false })
      : sort === 'nombre'
        ? dataQuery.order('name', { ascending: true })
        : dataQuery.order('last_order_at', { ascending: false, nullsFirst: false });
  const { data: customers } = await dataQuery.range(from, from + size - 1);

  const ids = (customers ?? []).map((c) => c.id as string);
  // Solo pedidos entregados de ESTA página (cancelados no cuentan).
  const { data: delivered } = ids.length
    ? await db
        .from('orders')
        .select('customer_id, total')
        .eq('restaurant_id', restaurantId)
        .eq('status', 'DELIVERED')
        .in('customer_id', ids)
    : { data: [] };

  const deliveredMap = new Map<string, { orders: number; spent: number }>();
  for (const o of delivered ?? []) {
    const cid = o.customer_id as string;
    const curr = deliveredMap.get(cid) ?? { orders: 0, spent: 0 };
    curr.orders++;
    curr.spent += Number(o.total);
    deliveredMap.set(cid, curr);
  }

  const rows = (customers ?? []).map((c) => {
    const d = deliveredMap.get(c.id as string) ?? { orders: 0, spent: 0 };
    return { ...c, total_orders: d.orders, total_spent: d.spent };
  }) as Customer[];

  return { customers: rows, total, page: safePage, pageSize: size, totalPages };
}

export interface CustomersSummary {
  totalCustomers: number;
  recurrentCount: number;
  totalSpent: number;
  /** Cuántos han pedido alguna vez. Es el denominador honesto de "vuelven":
   *  quien se registró y nunca pidió no decidió no volver, no ha venido. */
  buyersCount: number;
  /** Gasto medio POR PEDIDO de quien ya volvió, y de quien solo vino una vez.
   *  null cuando no hay de ese grupo con qué promediar. */
  avgTicketRecurrent: number | null;
  avgTicketOneTime: number | null;
}

/** KPIs globales (no por página): total de clientes, recurrentes y gasto histórico. */
export async function getCustomersSummary(restaurantId: string): Promise<CustomersSummary> {
  const db = createServiceClient();
  const [{ count }, { data: delivered }] = await Promise.all([
    db.from('customers').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
    db.from('orders').select('customer_id, total')
      .eq('restaurant_id', restaurantId).eq('status', 'DELIVERED').not('customer_id', 'is', null),
  ]);

  const perCustomer = new Map<string, { orders: number; spent: number }>();
  let totalSpent = 0;
  for (const o of delivered ?? []) {
    const cid = o.customer_id as string;
    const curr = perCustomer.get(cid) ?? { orders: 0, spent: 0 };
    curr.orders++;
    curr.spent += Number(o.total);
    perCustomer.set(cid, curr);
    totalSpent += Number(o.total);
  }
  /* Del mismo mapa que ya estaba armado salen tres cifras más, sin una sola
     consulta extra: cuántos han comprado alguna vez, y cuánto gasta POR
     PEDIDO quien vuelve frente a quien vino una sola vez.

     Esa comparación es la que decide si vale la pena montar lealtad, cupones
     o encuestas — y hasta ahora había que deducirla a ojo recorriendo la
     lista de clientes. */
  let recurrentCount = 0;
  let recPedidos = 0, recGasto = 0;
  let unaPedidos = 0, unaGasto = 0;
  for (const v of perCustomer.values()) {
    if (v.orders > 1) {
      recurrentCount++;
      recPedidos += v.orders;
      recGasto += v.spent;
    } else {
      unaPedidos += v.orders;
      unaGasto += v.spent;
    }
  }

  return {
    totalCustomers: count ?? 0,
    recurrentCount,
    totalSpent,
    buyersCount: perCustomer.size,
    avgTicketRecurrent: recPedidos > 0 ? recGasto / recPedidos : null,
    avgTicketOneTime: unaPedidos > 0 ? unaGasto / unaPedidos : null,
  };
}

export async function getCustomerOrders(
  restaurantId: string,
  customerId: string,
): Promise<Order[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('orders')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(50);

  return (data ?? []) as Order[];
}

export interface CustomerExportRow extends Customer {
  /** null cuando el módulo de lealtad no está activo (no se consultó). */
  pointsBalance: number | null;
  lifetimePoints: number | null;
}

/**
 * TODOS los clientes del restaurante, sin paginar — pensado para exportar
 * (a diferencia de getCustomers, que tope a 100/página para la UI). El
 * listado de clientes de un restaurante es de cientos, no millones, así que
 * un solo select() es seguro.
 */
export async function getAllCustomersForExport(
  restaurantId: string,
  includeLoyalty: boolean,
): Promise<CustomerExportRow[]> {
  const db = createServiceClient();

  const { data: customers } = await db
    .from('customers')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('last_order_at', { ascending: false, nullsFirst: false });

  const rows = (customers ?? []) as Customer[];
  const ids = rows.map((c) => c.id);

  const [delivered, loyaltyAccounts] = await Promise.all([
    ids.length
      ? db.from('orders').select('customer_id, total').eq('restaurant_id', restaurantId).eq('status', 'DELIVERED').in('customer_id', ids)
      : Promise.resolve({ data: [] as { customer_id: string; total: number }[] }),
    includeLoyalty && ids.length
      ? db.from('loyalty_accounts').select('customer_id, points_balance, lifetime_points').eq('restaurant_id', restaurantId).in('customer_id', ids)
      : Promise.resolve({ data: [] as { customer_id: string; points_balance: number; lifetime_points: number }[] }),
  ]);

  const deliveredMap = new Map<string, { orders: number; spent: number }>();
  for (const o of delivered.data ?? []) {
    const cid = o.customer_id as string;
    const curr = deliveredMap.get(cid) ?? { orders: 0, spent: 0 };
    curr.orders++;
    curr.spent += Number(o.total);
    deliveredMap.set(cid, curr);
  }

  const loyaltyMap = new Map<string, { balance: number; lifetime: number }>();
  for (const a of loyaltyAccounts.data ?? []) {
    loyaltyMap.set(a.customer_id as string, {
      balance: Number(a.points_balance) || 0,
      lifetime: Number(a.lifetime_points) || 0,
    });
  }

  return rows.map((c) => {
    const d = deliveredMap.get(c.id) ?? { orders: 0, spent: 0 };
    const l = includeLoyalty ? loyaltyMap.get(c.id) : undefined;
    return {
      ...c,
      total_orders: d.orders,
      total_spent: d.spent,
      pointsBalance: l ? l.balance : null,
      lifetimePoints: l ? l.lifetime : null,
    };
  });
}
