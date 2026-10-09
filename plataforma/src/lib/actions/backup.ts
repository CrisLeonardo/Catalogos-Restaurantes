'use server';
import { identidadReciente } from '@/lib/auth/reauth';
import { reauthRequerida } from '@/lib/auth/reauth-policy';

/* ============================================================
   RESPALDO COMPLETO — exportación self-service de un restaurante
   ------------------------------------------------------------
   Un solo .xlsx con 4 hojas (Catálogo, Categorías, Clientes,
   Pedidos) — a diferencia de los exports por sección que ya
   existían (Productos, Clientes, Pedidos, Finanzas), este junta
   TODO en un solo archivo pensado para respaldo/portabilidad, no
   para leer en el panel. Reutiliza los mismos helpers de marca
   que el resto de documentos (lib/documents/).
   ============================================================ */

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { canActOnGroupBranch, getAdminMenu } from '@/lib/db/admin';
import { resolveEffectiveRole } from '@/lib/db/membership';
import { can } from '@/lib/permissions';
import { getAllCustomersForExport } from '@/lib/db/customers';
import { loyaltyActive } from '@/lib/db/loyalty';
import { resolveRestaurantBranding } from '@/lib/documents/branding';
import {
  createBrandedWorkbook, addBrandedHeader, writeStyledTable, freezeHeaderRow, autoFitColumns, workbookToBase64,
} from '@/lib/documents/excel';
import { longDate } from '@/lib/documents/format';

const UUID_RE = /^[0-9a-f-]{36}$/i;

const ORDER_STATUS_LABEL: Record<string, string> = {
  NEW: 'Nuevo', PREP: 'En preparación', READY: 'Listo', TRANSIT: 'En camino',
  SERVED: 'Servido', DELIVERED: 'Entregado', CANCEL: 'Cancelado',
};
const ORDER_TYPE_LABEL: Record<string, string> = {
  PICKUP: 'Para llevar', DINE_IN: 'En local', DELIVERY: 'Domicilio',
};

async function authRestaurant(restaurantId: string): Promise<{ error: string } | { role: string }> {
  if (!UUID_RE.test(restaurantId)) return { error: 'Restaurante inválido.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autorizado.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, restaurant_id, permissions')
    .eq('id', user.id)
    .single();

  // Qué es esta persona EN ESTE restaurante. El perfil solo sabe de uno —y
  // desde el modelo de membresías el dueño lo tiene en null— así que
  // preguntárselo a él dejaba fuera al dueño de su propio negocio.
  const efectivo = await resolveEffectiveRole(
    { role: profile?.role ?? null, permissions: (profile?.permissions as string[] | null) ?? null },
    restaurantId,
  );

  const belongs =
    profile?.role === 'SUPER_ADMIN' ||
    efectivo.isMember ||
    (['RESTAURANT_OWNER', 'RESTAURANT_STAFF'].includes(profile?.role ?? '') &&
      profile?.restaurant_id === restaurantId) ||
    (await canActOnGroupBranch(restaurantId));
  if (!belongs) return { error: 'No autorizado.' };
  if (!can(efectivo.role, efectivo.permissions, 'respaldo')) {
    return { error: 'No autorizado.' };
  }
  return { role: efectivo.role };
}

/** Respaldo completo: catálogo + clientes + pedidos, en un solo .xlsx con 4 hojas. */
export async function exportBackupXlsx(
  restaurantId: string,
): Promise<{ xlsx?: string; filename?: string; error?: string }> {
  const auth = await authRestaurant(restaurantId);
  if ('error' in auth) return auth;
  // ACC-09: delicado → «confirma que eres tú» si hace más de 10 min.
  if (!(await identidadReciente())) return reauthRequerida();

  const db = createServiceClient();
  const [{ data: rest }, { categories, products }, includeLoyalty] = await Promise.all([
    db.from('restaurants').select('slug, timezone').eq('id', restaurantId).single(),
    getAdminMenu(restaurantId),
    loyaltyActive(restaurantId),
  ]);
  const slug = (rest?.slug as string) ?? 'restaurante';
  const tz = (rest?.timezone as string) || 'America/Guatemala';

  const [customers, { data: orders }, branding] = await Promise.all([
    getAllCustomersForExport(restaurantId, includeLoyalty),
    db
      .from('orders')
      .select('order_number, created_at, customer_name, customer_phone, order_type, status, subtotal, delivery_fee, total, notes, items:order_items(name_snapshot, quantity)')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(5000),
    resolveRestaurantBranding(restaurantId),
  ]);

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const today = new Date().toISOString().slice(0, 10);
  const generated = `Generado el ${longDate(new Date().toISOString())}`;

  const wb = await createBrandedWorkbook();

  // ── Catálogo ─────────────────────────────────────────────
  const wsCat = wb.addWorksheet('Catálogo');
  addBrandedHeader(wsCat, {
    branding, title: 'Catálogo', columnsSpan: 8,
    subtitle: `${products.length} producto${products.length === 1 ? '' : 's'} · ${generated}`,
  });
  const catHeader = writeStyledTable(
    wsCat, branding,
    ['Categoría', 'Producto', 'Precio', 'Costo', 'Stock', 'Con control de stock', 'Activo', 'Disponible'],
    products.map((p) => [
      categoryName.get(p.category_id ?? '') ?? 'Sin categoría', p.name, p.price, p.cost,
      p.track_stock ? p.stock : null, p.track_stock ? 'Sí' : 'No', p.is_active ? 'Sí' : 'No', p.is_available ? 'Sí' : 'No',
    ]),
    { currencyCols: [3, 4] },
  );
  freezeHeaderRow(wsCat, catHeader.headerRow);
  autoFitColumns(wsCat);

  // ── Categorías ───────────────────────────────────────────
  const wsCatg = wb.addWorksheet('Categorías');
  addBrandedHeader(wsCatg, { branding, title: 'Categorías', columnsSpan: 3, subtitle: generated });
  const catgHeader = writeStyledTable(
    wsCatg, branding,
    ['Nombre', 'Orden', 'Activa'],
    categories.map((c) => [c.name, c.sort_order, c.is_active ? 'Sí' : 'No']),
  );
  freezeHeaderRow(wsCatg, catgHeader.headerRow);
  autoFitColumns(wsCatg);

  // ── Clientes ─────────────────────────────────────────────
  const wsCli = wb.addWorksheet('Clientes');
  const cliHeaders = ['Nombre', 'Teléfono', 'Email', 'Dirección', 'Zona', 'Pedidos', 'Total gastado', 'Primer pedido', 'Último pedido'];
  if (includeLoyalty) cliHeaders.push('Puntos');
  addBrandedHeader(wsCli, {
    branding, title: 'Clientes', columnsSpan: cliHeaders.length,
    subtitle: `${customers.length} cliente${customers.length === 1 ? '' : 's'} · ${generated}`,
  });
  const cliHeader = writeStyledTable(
    wsCli, branding, cliHeaders,
    customers.map((c) => {
      const base: (string | number | null)[] = [
        c.name, c.phone, c.email ?? '', c.default_address ?? '', c.default_zone ?? '',
        c.total_orders, c.total_spent, c.first_order_at?.slice(0, 10) ?? '', c.last_order_at?.slice(0, 10) ?? '',
      ];
      if (includeLoyalty) base.push(c.pointsBalance ?? 0);
      return base;
    }),
    { currencyCols: [7] },
  );
  freezeHeaderRow(wsCli, cliHeader.headerRow);
  autoFitColumns(wsCli);

  // ── Pedidos (ventas) ─────────────────────────────────────
  const wsOrd = wb.addWorksheet('Pedidos');
  const ordRows = (orders ?? []).map((o) => {
    const created = new Date(o.created_at as string);
    let fecha = '';
    let hora = '';
    try {
      fecha = created.toLocaleDateString('es-GT', { timeZone: tz });
      hora = created.toLocaleTimeString('es-GT', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
    } catch {
      fecha = created.toLocaleDateString('es-GT');
      hora = created.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });
    }
    const items = ((o.items as { name_snapshot: string; quantity: number }[] | null) ?? [])
      .map((it) => `${it.quantity}x ${it.name_snapshot}`)
      .join(' | ');
    return [
      String(o.order_number), fecha, hora, String(o.customer_name), String(o.customer_phone),
      ORDER_TYPE_LABEL[o.order_type as string] ?? String(o.order_type),
      ORDER_STATUS_LABEL[o.status as string] ?? String(o.status),
      items, Number(o.subtotal), Number(o.delivery_fee), Number(o.total), (o.notes as string | null) ?? '',
    ];
  });
  addBrandedHeader(wsOrd, {
    branding, title: 'Pedidos (ventas)', columnsSpan: 12,
    subtitle: `${ordRows.length} pedido${ordRows.length === 1 ? '' : 's'} (últimos 5000) · ${generated}`,
  });
  const ordHeader = writeStyledTable(
    wsOrd, branding,
    ['Número', 'Fecha', 'Hora', 'Cliente', 'Teléfono', 'Tipo', 'Estado', 'Productos', 'Subtotal', 'Envío', 'Total', 'Notas'],
    ordRows,
    { currencyCols: [9, 10, 11] },
  );
  freezeHeaderRow(wsOrd, ordHeader.headerRow);
  autoFitColumns(wsOrd);

  const xlsx = await workbookToBase64(wb);
  return { xlsx, filename: `respaldo-${slug}-${today}.xlsx` };
}
