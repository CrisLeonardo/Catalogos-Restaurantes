'use server';

/* ============================================================
   CLIENTES — export a PDF/Excel
   ------------------------------------------------------------
   Los datos viven en lib/db/customers.ts; aquí solo autorización
   (mismo patrón que authRestaurant en actions/finanzas.ts) + el
   armado de marca/columnas para el documento.
   ============================================================ */

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { canActOnGroupBranch } from '@/lib/db/admin';
import { resolveEffectiveRole } from '@/lib/db/membership';
import { can } from '@/lib/permissions';
import { getAllCustomersForExport, type CustomerExportRow } from '@/lib/db/customers';
import { loyaltyActive } from '@/lib/db/loyalty';
import { resolveRestaurantBranding } from '@/lib/documents/branding';
import {
  createBrandedWorkbook, addBrandedHeader, writeStyledTable, freezeHeaderRow, autoFitColumns, workbookToBase64,
} from '@/lib/documents/excel';
import { longDate } from '@/lib/documents/format';
import type { DocumentBranding } from '@/lib/documents/types';

const UUID_RE = /^[0-9a-f-]{36}$/i;

type CustomersExportData = {
  rows: CustomerExportRow[];
  branding: DocumentBranding;
  includeLoyalty: boolean;
  slug: string;
};

async function authAndFetch(restaurantId: string): Promise<CustomersExportData | { error: string }> {
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
  if (!can(efectivo.role, efectivo.permissions, 'clientes')) {
    return { error: 'No autorizado.' };
  }

  const db = createServiceClient();
  const [{ data: rest }, includeLoyalty] = await Promise.all([
    db.from('restaurants').select('slug').eq('id', restaurantId).single(),
    loyaltyActive(restaurantId),
  ]);

  const [rows, branding] = await Promise.all([
    getAllCustomersForExport(restaurantId, includeLoyalty),
    resolveRestaurantBranding(restaurantId),
  ]);

  return { rows, branding, includeLoyalty, slug: (rest?.slug as string) ?? 'restaurante' };
}

/** Datos ya armados (numéricos + marca) para dibujar el PDF de clientes en el cliente. */
export async function getCustomersPdfData(restaurantId: string): Promise<CustomersExportData | { error: string }> {
  return authAndFetch(restaurantId);
}

/** Genera el listado de clientes como .xlsx real, con marca del restaurante. */
export async function exportCustomersXlsx(
  restaurantId: string,
): Promise<{ xlsx?: string; filename?: string; error?: string }> {
  const data = await authAndFetch(restaurantId);
  if ('error' in data) return data;
  const { rows, branding, includeLoyalty, slug } = data;

  const subtitle = `${rows.length} cliente${rows.length === 1 ? '' : 's'} · Generado el ${longDate(new Date().toISOString())}`;
  const wb = await createBrandedWorkbook();
  const ws = wb.addWorksheet('Clientes');

  const headers = ['Nombre', 'Teléfono', 'Email', 'Dirección', 'Zona', 'Pedidos', 'Total gastado', 'Primer pedido', 'Último pedido'];
  if (includeLoyalty) headers.push('Puntos');
  addBrandedHeader(ws, { branding, title: 'Listado de clientes', subtitle, columnsSpan: headers.length });

  const { headerRow } = writeStyledTable(
    ws, branding, headers,
    rows.map((c) => {
      const base: (string | number | null)[] = [
        c.name, c.phone, c.email ?? '', c.default_address ?? '', c.default_zone ?? '',
        c.total_orders, c.total_spent, c.first_order_at?.slice(0, 10) ?? '', c.last_order_at?.slice(0, 10) ?? '',
      ];
      if (includeLoyalty) base.push(c.pointsBalance ?? 0);
      return base;
    }),
    { currencyCols: [7] },
  );
  freezeHeaderRow(ws, headerRow);
  autoFitColumns(ws);

  const xlsx = await workbookToBase64(wb);
  return { xlsx, filename: `clientes-${slug}-${new Date().toISOString().slice(0, 10)}.xlsx` };
}
