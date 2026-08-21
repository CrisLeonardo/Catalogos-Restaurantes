import { permanentRedirect } from 'next/navigation';
import { rootDomainForUrls } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

/* ============================================================
   /central — el panel del grupo, que se mudó a Mi cuenta
   ------------------------------------------------------------
   Vivía aquí, en `grupo-central.dominio`, con su propio inicio de sesión,
   porque nació cuando los grupos los creaba Leogin a mano y le entregaba al
   jefe una credencial aparte. Con los restaurantes en manos del dueño, eso
   dejó de tener sentido: hoy el consolidado es una sección de Mi cuenta.

   Esta ruta se queda para siempre como reenvío: hay enlaces guardados,
   marcadores y accesos directos apuntando al subdominio, y romperlos sería
   dejar fuera justo a los clientes que más usan el panel.
   ============================================================ */

const DESTINO: Record<string, string> = {
  '': '/mi-cuenta/resumen',
  sucursales: '/mi-cuenta',
  comparativa: '/mi-cuenta/comparativa',
  finanzas: '/mi-cuenta/finanzas',
  // Sin sesión, Mi cuenta ya manda al login que corresponde.
  login: '/mi-cuenta',
};

export default async function CentralRedirectPage({
  params,
}: { params: Promise<{ ruta?: string[] }> }) {
  const { ruta } = await params;
  const destino = DESTINO[(ruta ?? [])[0] ?? ''] ?? '/mi-cuenta';

  // Absoluto al dominio raíz: quien llega aquí suele venir del subdominio
  // del grupo, y Mi cuenta es de la persona, no de un subdominio.
  const root = rootDomainForUrls();
  const proto = root.includes('localhost') || root.startsWith('127.') ? 'http' : 'https';
  const url = `${proto}://${root}${destino}`;

  permanentRedirect(url);
}
