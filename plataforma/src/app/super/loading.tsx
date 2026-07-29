import PageSkeleton from '@/components/admin/page-skeleton';

/* Mismo problema que el panel admin: /super/finanzas y /super/restaurantes
   tardan y no daban ninguna señal de que la navegación había arrancado. */
export default function SuperLoading() {
  return <PageSkeleton label="el panel" cards={4} />;
}
