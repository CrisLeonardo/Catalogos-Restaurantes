import { redirect } from 'next/navigation';

/* Impresión, "Modo sin internet" y "Leogin Desktop" contaban la misma historia
   en tres pantallas distintas (y el interruptor de la PC servidora vivía en
   una cuarta, Ajustes). Todo vive ahora en /admin/mi-pc; esta ruta se queda
   como redirección porque hay enlaces viejos en documentos y correos. */
export default function AdminImpresionPage() {
  redirect('/admin/mi-pc');
}
