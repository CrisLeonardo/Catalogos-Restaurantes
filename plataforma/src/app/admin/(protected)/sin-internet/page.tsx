import { redirect } from 'next/navigation';

/* Fusionada en /admin/mi-pc (paso 3, "Si se cae el internet"): el respaldo
   local no es un producto aparte, es lo que hace la misma PC que imprime.
   Se conserva la ruta por los enlaces ya publicados. */
export default function AdminSinInternetPage() {
  redirect('/admin/mi-pc');
}
