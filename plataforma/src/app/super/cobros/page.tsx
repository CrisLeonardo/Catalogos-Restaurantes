import { redirect } from 'next/navigation';

/* Cobros vive ahora dentro de Finanzas (pestaña Cobranza). La redirección
   de verdad está en next.config.ts (antes de pintar: aquí, con el armazón
   ya en camino, daba React #310); esta queda de respaldo. */
export default function CobrosRedirect() {
  redirect('/super/finanzas/cobranza');
}
