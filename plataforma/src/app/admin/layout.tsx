import type { Metadata } from 'next';

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
