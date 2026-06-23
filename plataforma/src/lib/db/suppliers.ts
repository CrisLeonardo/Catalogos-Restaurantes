import { createServiceClient } from '@/lib/supabase/service';

export interface Supplier {
  id: string;
  restaurant_id: string;
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  notes: string;
  active: boolean;
  created_at: string;
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  costo_unitario: number;
  subtotal: number;
}

export interface PurchaseOrder {
  id: string;
  restaurant_id: string;
  supplier_id: string | null;
  folio: number;
  estado: 'BORRADOR' | 'ENVIADA' | 'RECIBIDA' | 'CANCELADA';
  total: number;
  notes: string;
  created_at: string;
  sent_at: string | null;
  received_at: string | null;
  supplier_name?: string | null;
  items?: PurchaseOrderItem[];
}

export async function getSuppliers(restaurantId: string): Promise<Supplier[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('suppliers')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('name');
  return (data ?? []) as Supplier[];
}

export async function getPurchaseOrders(restaurantId: string, limit = 50): Promise<PurchaseOrder[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('purchase_orders')
    .select('*, items:purchase_order_items(*), supplier:suppliers(name)')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const { supplier, ...po } = row as Record<string, unknown> & { supplier?: { name: string } | null };
    return { ...po, supplier_name: supplier?.name ?? null } as PurchaseOrder;
  });
}

export interface SupplierSummary {
  suppliers: number;
  ordenesAbiertas: number;
  gastoMes: number;
}

export async function getSupplierSummary(restaurantId: string): Promise<SupplierSummary> {
  const db = createServiceClient();
  const [{ count: supCount }, orders] = await Promise.all([
    db.from('suppliers').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId).eq('active', true),
    getPurchaseOrders(restaurantId, 200),
  ]);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const gastoMes = orders
    .filter((o) => o.estado === 'RECIBIDA' && o.received_at && new Date(o.received_at) >= monthStart)
    .reduce((a, o) => a + Number(o.total), 0);

  return {
    suppliers: supCount ?? 0,
    ordenesAbiertas: orders.filter((o) => o.estado === 'BORRADOR' || o.estado === 'ENVIADA').length,
    gastoMes,
  };
}
