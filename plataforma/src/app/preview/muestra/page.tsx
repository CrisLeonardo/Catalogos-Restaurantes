import type { Metadata } from 'next';
import MuestraClient from '@/components/muestra-client';

/* ============================================================
   /preview/muestra — el menú de la vitrina de diseños
   ------------------------------------------------------------
   Pública y sin base de datos: la carta de Rincón 502 (lib/demo-menu.ts)
   pintada con el estilo que pida la portada. La portada la abre en un
   iframe del mismo origen y le cambia el estilo y el nombre por
   postMessage (components/landing-disenos.tsx).

   Vive bajo /preview a propósito: el proxy y el layout ya tratan esa ruta
   como un MENÚ (tema del restaurante, no el de la web de Leogin) y el iframe
   de la vista previa del editor ya es del mismo origen. Al ser un segmento
   fijo, Next la elige antes que /preview/[id], que pide sesión.
   ============================================================ */

export const metadata: Metadata = {
  title: 'Rincón 502 · Muestra de diseños de Leogin',
  robots: { index: false, follow: false },
};

export default async function MuestraPage({
  searchParams,
}: {
  searchParams: Promise<{ estilo?: string | string[]; nombre?: string | string[] }>;
}) {
  const { estilo, nombre } = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  return <MuestraClient estiloInicial={uno(estilo) || null} nombreInicial={uno(nombre).slice(0, 40)} />;
}
