/* Orden de la lista de clientes (auditoría 2026-10-02, CLI-01).
   Vive aparte de lib/db/customers.ts porque lo usa también el buscador, que
   es un componente de cliente: importar de lib/db metería el cliente de
   Supabase con service role en el código del navegador. */

export type CustomerSort = 'recientes' | 'gasto' | 'pedidos' | 'nombre';

export const CUSTOMER_SORTS: { value: CustomerSort; label: string }[] = [
  { value: 'recientes', label: 'Última visita' },
  { value: 'gasto', label: 'Más gasto' },
  { value: 'pedidos', label: 'Más pedidos' },
  { value: 'nombre', label: 'Nombre' },
];

export function parseCustomerSort(v: string | undefined): CustomerSort {
  return CUSTOMER_SORTS.some((s) => s.value === v) ? (v as CustomerSort) : 'recientes';
}
