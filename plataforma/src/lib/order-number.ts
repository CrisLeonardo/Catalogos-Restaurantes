/* ============================================================
   NÚMERO DE PEDIDO CORTO (auditoría 2026-10-02, PED-03)
   ------------------------------------------------------------
   Convivían «H-7» (pedidos del hub sin internet) y «ORD-2026-00057»,
   que en Cocina, a tamaño grande, se cortaba. En las pantallas de
   OPERACIÓN —donde se dice en voz alta y se busca de un vistazo— va
   la forma corta «#57». La completa se queda donde sirve como
   referencia en el tiempo: recibo, historial del cliente, facturación.
   ============================================================ */

const ORD = /^ORD-\d{4}-0*(\d+)$/;

/** «ORD-2026-00057» → «#57». Lo que no siga ese formato (p. ej. «H-7») queda igual. */
export function shortOrderNumber(orderNumber: string | null | undefined): string {
  if (!orderNumber) return '';
  const m = ORD.exec(orderNumber.trim());
  return m ? `#${m[1]}` : orderNumber;
}
