import { redirect } from 'next/navigation';

/* Fusionada en /admin/mi-pc: la app de escritorio y "la PC del local" son la
   misma decisión para el dueño, y tenerlas separadas obligaba a leer dos
   pantallas para entender una. Se conserva la ruta por los enlaces viejos
   (incluida la guía de instalación impresa). */
export default function AdminEscritorioPage() {
  redirect('/admin/mi-pc');
}
