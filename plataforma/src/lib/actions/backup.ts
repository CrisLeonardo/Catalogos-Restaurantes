'use server';
import { identidadReciente } from '@/lib/auth/reauth';
import { STATUS_LABEL } from '@/lib/order-status';
import { reauthRequerida } from '@/lib/auth/reauth-policy';

/* ============================================================
   RESPALDO COMPLETO — exportación self-service de un restaurante
   ------------------------------------------------------------
   Un solo .xlsx con Catálogo, Categorías, Clientes, Pedidos, Cobros y,
   si las hay, Facturas FEL — a diferencia de los exports por sección que ya
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
import { labelOf } from '@/lib/payment-method';
import { todasLasFilas } from '@/lib/db/todas-las-filas';

const UUID_RE = /^[0-9a-f-]{36}$/i;

/* Auditoría de lanzamiento 2026-11-23 (LZ-08 y LZ-10): el respaldo cortaba
   en los últimos 5,000 pedidos sin decirlo en el archivo, y no traía los
   cobros ni las facturas FEL. Es lo que el dueño necesita llevarse antes
   de cancelar o de pedir que se borre el local (el borrado se lleva en
   cascada sus FEL). Ahora se lee todo por páginas (`todasLasFilas`), con
   un tope de seguridad muy por encima de lo que vende un local en años. */
const TOPE_FILAS = 200_000;

const COBRO_LABEL: Record<string, string> = {
  PAYMENT: 'Cobro',
  TABLE_CLOSE: 'Cierre de mesa',
  REFUND: 'Devolución',
  REOPEN: 'Reapertura',
  METHOD_FIX: 'Cambio de forma de pago',
};

const FEL_ESTADO_LABEL: Record<string, string> = {
  CERTIFICADO: 'Certificada',
  PENDIENTE: 'Pendiente',
  ERROR: 'Con error',
  ANULADO: 'Anulada',
};

/** Fecha y hora del local, con respaldo si la zona no se reconoce. */
function fechaHora(iso: string | null | undefined, tz: string): [string, string] {
  if (!iso) return ['', ''];
  const d = new Date(iso);
  try {
    return [
      d.toLocaleDateString('es-GT', { timeZone: tz }),
      d.toLocaleTimeString('es-GT', { timeZone: tz, hour: '2-digit', minute: '2-digit' }),
    ];
  } catch {
    return [d.toLocaleDateString('es-GT'), d.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })];
  }
}

/** Número de pedido de una relación embebida (objeto o arreglo de uno). */
function numeroDe(rel: unknown): string {
  const o = Array.isArray(rel) ? rel[0] : rel;
  return o && typeof o === 'object' && 'order_number' in o ? String((o as { order_number: unknown }).order_number ?? '') : '';
}

// Los mismos estados que la pantalla (glosario, ficha 2.12).
const ORDER_STATUS_LABEL: Record<string, string> = STATUS_LABEL;
const ORDER_TYPE_LABEL: Record<string, string> = {
  PICKUP: 'Para llevar', DINE_IN: 'Comer en local', DELIVERY: 'A domicilio',
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

/** Respaldo completo: catálogo, clientes, todos los pedidos, cobros y facturas FEL, en un solo .xlsx. */
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

  type Filas = { filas: Record<string, unknown>[]; truncado: boolean };
  let pedidos: Filas;
  let cobros: Filas;
  let facturas: Filas;
  const [customers, branding] = await Promise.all([
    getAllCustomersForExport(restaurantId, includeLoyalty),
    resolveRestaurantBranding(restaurantId),
  ]);
  try {
    [pedidos, cobros, facturas] = await Promise.all([
      todasLasFilas<Record<string, unknown>>((desde, hasta) => db
        .from('orders')
        .select('order_number, created_at, customer_name, customer_phone, order_type, table_number, status, payment_method, subtotal, discount, loyalty_discount, delivery_fee, tip, total, notes, es_prueba, items:order_items(name_snapshot, quantity)')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(desde, hasta), TOPE_FILAS),
      todasLasFilas<Record<string, unknown>>((desde, hasta) => db
        .from('order_payments')
        .select('created_at, kind, method, amount, cash_received, reason, order:orders(order_number)')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(desde, hasta), TOPE_FILAS),
      todasLasFilas<Record<string, unknown>>((desde, hasta) => db
        .from('fel_documents')
        .select('created_at, fecha_certificacion, tipo, serie, numero, numero_autorizacion, uuid_sat, receptor_nit, receptor_nombre, monto_total, monto_iva, estado, fecha_anulacion, motivo_anulacion, es_fiscal, order:orders(order_number)')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(desde, hasta), TOPE_FILAS),
    ]);
  } catch (e) {
    console.error('[respaldo] no se pudo leer', restaurantId, e instanceof Error ? e.message : e);
    return { error: 'No se pudo leer todo para el respaldo. Intenta de nuevo en un momento.' };
  }

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const today = new Date().toISOString().slice(0, 10);
  const generated = `Generado el ${longDate(new Date().toISOString())}`;

  const wb = await createBrandedWorkbook();

  // ── Catálogo ─────────────────────────────────────────────
  const wsCat = wb.addWorksheet('Catálogo');
  addBrandedHeader(wsCat, {
    branding, title: 'Catálogo', columnsSpan: 8,
    subtitle: `${products.length} platillo${products.length === 1 ? '' : 's'} · ${generated}`,
  });
  const catHeader = writeStyledTable(
    wsCat, branding,
    ['Categoría', 'Platillo', 'Precio', 'Costo', 'Stock', 'Con control de stock', 'Activo', 'Disponible'],
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
  const ordRows = pedidos.filas.map((o) => {
    const [fecha, hora] = fechaHora(o.created_at as string, tz);
    const items = ((o.items as { name_snapshot: string; quantity: number }[] | null) ?? [])
      .map((it) => `${it.quantity}x ${it.name_snapshot}`)
      .join(' | ');
    return [
      String(o.order_number), fecha, hora, String(o.customer_name ?? ''), String(o.customer_phone ?? ''),
      ORDER_TYPE_LABEL[o.order_type as string] ?? String(o.order_type),
      o.table_number == null ? '' : String(o.table_number),
      ORDER_STATUS_LABEL[o.status as string] ?? String(o.status),
      labelOf(o.payment_method as string | null),
      items, Number(o.subtotal), Number(o.discount ?? 0) + Number(o.loyalty_discount ?? 0),
      Number(o.delivery_fee ?? 0), Number(o.tip ?? 0), Number(o.total),
      (o.notes as string | null) ?? '', o.es_prueba ? 'Sí' : '',
    ];
  });
  addBrandedHeader(wsOrd, {
    branding, title: 'Pedidos (ventas)', columnsSpan: 17,
    subtitle: `${ordRows.length} pedido${ordRows.length === 1 ? '' : 's'}${pedidos.truncado ? ' (los más recientes)' : ', todos'} · ${generated}`,
  });
  const ordHeader = writeStyledTable(
    wsOrd, branding,
    ['Número', 'Fecha', 'Hora', 'Cliente', 'Teléfono', 'Tipo', 'Mesa', 'Estado', 'Forma de pago', 'Platillos',
      'Subtotal', 'Descuento', 'Envío', 'Propina', 'Total', 'Notas', 'De práctica'],
    ordRows,
    { currencyCols: [11, 12, 13, 14, 15] },
  );
  freezeHeaderRow(wsOrd, ordHeader.headerRow);
  autoFitColumns(wsOrd);

  // ── Cobros ───────────────────────────────────────────────
  // Cada movimiento de caja de un pedido: cobros, cuentas divididas,
  // devoluciones y cambios de forma de pago, con su motivo.
  const wsCob = wb.addWorksheet('Cobros');
  addBrandedHeader(wsCob, {
    branding, title: 'Cobros', columnsSpan: 8,
    subtitle: `${cobros.filas.length} movimiento${cobros.filas.length === 1 ? '' : 's'}${cobros.truncado ? ' (los más recientes)' : ''} · ${generated}`,
  });
  const cobHeader = writeStyledTable(
    wsCob, branding,
    ['Fecha', 'Hora', 'Pedido', 'Movimiento', 'Forma de pago', 'Monto', 'Efectivo recibido', 'Motivo'],
    cobros.filas.map((c) => {
      const [fecha, hora] = fechaHora(c.created_at as string, tz);
      return [
        fecha, hora, numeroDe(c.order), COBRO_LABEL[c.kind as string] ?? String(c.kind ?? ''),
        labelOf(c.method as string | null), Number(c.amount),
        c.cash_received == null ? null : Number(c.cash_received), (c.reason as string | null) ?? '',
      ];
    }),
    { currencyCols: [6, 7] },
  );
  freezeHeaderRow(wsCob, cobHeader.headerRow);
  autoFitColumns(wsCob);

  // ── Facturas FEL (solo si el local factura) ──────────────
  if (facturas.filas.length > 0) {
    const wsFel = wb.addWorksheet('Facturas FEL');
    addBrandedHeader(wsFel, {
      branding, title: 'Facturas FEL', columnsSpan: 13,
      subtitle: `${facturas.filas.length} documento${facturas.filas.length === 1 ? '' : 's'} · el XML certificado lo guardan la SAT y tu certificador · ${generated}`,
    });
    const felHeader = writeStyledTable(
      wsFel, branding,
      ['Fecha', 'Tipo', 'Serie', 'Número', 'Autorización', 'NIT', 'Nombre', 'Total', 'IVA', 'Estado', 'Pedido', 'Anulada el', 'Motivo de anulación'],
      facturas.filas.map((f) => [
        fechaHora((f.fecha_certificacion ?? f.created_at) as string, tz)[0],
        f.es_fiscal === false ? `${String(f.tipo ?? '')} (no fiscal)` : String(f.tipo ?? ''),
        String(f.serie ?? ''), String(f.numero ?? ''), String(f.numero_autorizacion ?? f.uuid_sat ?? ''),
        String(f.receptor_nit ?? ''), String(f.receptor_nombre ?? ''),
        Number(f.monto_total ?? 0), Number(f.monto_iva ?? 0),
        f.fecha_anulacion ? 'Anulada' : FEL_ESTADO_LABEL[f.estado as string] ?? String(f.estado ?? ''),
        numeroDe(f.order), fechaHora(f.fecha_anulacion as string | null, tz)[0], (f.motivo_anulacion as string | null) ?? '',
      ]),
      { currencyCols: [8, 9] },
    );
    freezeHeaderRow(wsFel, felHeader.headerRow);
    autoFitColumns(wsFel);
  }

  const xlsx = await workbookToBase64(wb);
  // El superadmin la ve antes de borrar el local (LZ-10, migración 195). Si
  // no se puede anotar, el respaldo se entrega igual: es solo un aviso.
  const { error: sinFecha } = await db.from('restaurants')
    .update({ datos_exportados_at: new Date().toISOString() }).eq('id', restaurantId);
  if (sinFecha) console.error('[respaldo] no se anotó la fecha de exportación', restaurantId, sinFecha.message);
  return { xlsx, filename: `respaldo-${slug}-${today}.xlsx` };
}
