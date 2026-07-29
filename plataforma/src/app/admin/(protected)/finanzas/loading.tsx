import PageSkeleton from '@/components/admin/page-skeleton';

/* Finanzas es de las más lentas del panel: arma el reporte de ventas del
   rango completo. Merece su propio esqueleto con más bloques (KPIs + tabla)
   para que la silueta se parezca a lo que va a llegar. */
export default function FinanzasLoading() {
  return <PageSkeleton label="Finanzas" cards={6} />;
}
