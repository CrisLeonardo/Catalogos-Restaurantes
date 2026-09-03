import { redirect } from 'next/navigation';
import { panelLink } from '@/lib/panel-links-server';

/* Fusionada en /admin/mi-pc: la app de escritorio y "la PC del local" son la
   misma decisión para el dueño, y tenerlas separadas obligaba a leer dos
   pantallas para entender una. Se conserva la ruta por los enlaces viejos
   (incluida la guía de instalación impresa). */
export default async function AdminEscritorioPage() {
  redirect(await panelLink('/admin/mi-pc'));
}
