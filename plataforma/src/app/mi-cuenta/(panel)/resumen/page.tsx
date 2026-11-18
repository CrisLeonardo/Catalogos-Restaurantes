import { redirect } from 'next/navigation';

/* Resumen se fundió en Restaurantes (línea N «nada saturado», 2026-11-18):
   cada fila dice ahora cómo va hoy ese restaurante. La ruta queda como
   reenvío para marcadores y enlaces guardados (también los de /central). */
export default function ResumenPage() {
  redirect('/mi-cuenta');
}
