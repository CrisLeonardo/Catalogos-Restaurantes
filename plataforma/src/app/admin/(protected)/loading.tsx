import PageSkeleton from '@/components/admin/page-skeleton';

/* Límite de carga por defecto de TODO el panel admin. Cubre cualquier
   pantalla que no traiga su propio loading.tsx, así que ninguna navegación
   se queda sin respuesta visible. El menú lateral y la cabecera NO se
   redibujan: están en el layout, se quedan fijos y solo cambia el contenido
   — que es justo la sensación de "app" que se buscaba. */
export default function AdminLoading() {
  return <PageSkeleton label="la sección" cards={3} />;
}
