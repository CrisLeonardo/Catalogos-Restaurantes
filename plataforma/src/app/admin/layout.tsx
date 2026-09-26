import type { Metadata } from 'next';
/* Estilos del área de personal: fuera de globals.css para que el menú del
   comensal no los descargue (ver el encabezado de admin.css). */
import '../admin.css';

/**
 * Layout raíz del área /admin/.
 * Solo inyecta el manifest de la PWA admin (id='/admin/', scope='/admin/').
 * El auth check y el AdminShell viven en (protected)/layout.tsx para que
 * /admin/login pueda renderizarse sin auth (evita el bucle de redirect).
 */
export async function generateMetadata(): Promise<Metadata> {
  return { manifest: '/api/admin-manifest' };
}

export default function AdminPublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
