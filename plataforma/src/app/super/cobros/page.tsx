import { redirect } from 'next/navigation';

/* Cobros vive ahora dentro de Finanzas (pestaña Cobranza). Este
   redirect mantiene vivos los enlaces y marcadores viejos. */
export default function CobrosRedirect() {
  redirect('/super/finanzas/cobranza');
}
