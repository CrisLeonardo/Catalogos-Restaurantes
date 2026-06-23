import { redirect } from 'next/navigation';
import { resolveModuleContext } from '@/lib/modules-server';
import { getSuppliers, getPurchaseOrders, getSupplierSummary } from '@/lib/db/suppliers';
import ProveedoresPanel from '@/components/admin/proveedores-panel';

export const metadata = { title: 'Proveedores – Panel admin' };

export default async function ProveedoresPage() {
  const mc = await resolveModuleContext('proveedores');
  if (!mc.ok) redirect('/admin/modulos');

  const [suppliers, orders, summary] = await Promise.all([
    getSuppliers(mc.restaurantId),
    getPurchaseOrders(mc.restaurantId),
    getSupplierSummary(mc.restaurantId),
  ]);

  return (
    <div className="anim-fade-up">
      <ProveedoresPanel restaurantId={mc.restaurantId} suppliers={suppliers} orders={orders} summary={summary} />
    </div>
  );
}
