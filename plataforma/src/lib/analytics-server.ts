import 'server-only';
import { after } from 'next/server';
import { headers } from 'next/headers';
import { analiticaConfig, type Evento } from '@/lib/analytics';
import { rootDomainForUrls } from '@/lib/tenant';

/* ============================================================
   EVENTOS DEL EMBUDO DESDE EL SERVIDOR (WEB-01)
   ------------------------------------------------------------
   «Cuenta creada», «Restaurante creado» y «Primer platillo» se mandan
   desde la acción que los produce, no desde el navegador: un bloqueador
   de anuncios no los borra y el panel no necesita cargar el script.

   Se mandan con `after()` —cuando la respuesta ya salió— y con 2 s de
   tope: la analítica nunca hace esperar ni tumba un alta. Viajan el
   navegador y la IP del visitante (las dos analíticas los usan para
   contar personas sin cookies) y la ruta, nunca un correo, un nombre
   ni el restaurante.
   ============================================================ */

export async function registrarEvento(evento: Evento, ruta: string): Promise<void> {
  const cfg = analiticaConfig();
  if (!cfg) return;

  let ua = '';
  let ip = '';
  try {
    const h = await headers();
    ua = h.get('user-agent') ?? '';
    ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim();
  } catch {
    return; // fuera de una petición (build, pruebas): nada que contar
  }

  const host = rootDomainForUrls().split(':')[0];
  const url = `https://${host}${ruta.startsWith('/') ? ruta : `/${ruta}`}`;

  after(async () => {
    const hdrs: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': ua || 'Mozilla/5.0' };
    if (ip) hdrs['X-Forwarded-For'] = ip;
    const body = cfg.proveedor === 'umami'
      ? { type: 'event', payload: { website: cfg.id, hostname: host, url: new URL(url).pathname, name: evento, language: 'es-GT' } }
      : { name: evento, domain: cfg.id, url };
    const endpoint = cfg.proveedor === 'umami' ? `${cfg.origen}/api/send` : `${cfg.origen}/api/event`;
    try {
      await fetch(endpoint, { method: 'POST', headers: hdrs, body: JSON.stringify(body), signal: AbortSignal.timeout(2000) });
    } catch {
      /* sin red o analítica caída: se pierde un evento, nada más */
    }
  });
}
