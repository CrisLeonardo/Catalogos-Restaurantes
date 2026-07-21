/* ============================================================
   FETCH SEGURO DE ASSETS EXTERNOS (anti-SSRF)
   ------------------------------------------------------------
   Los logos/íconos vienen de un campo editable por el dueño
   (logo_url / pwaIconUrl / organizations.logo_url). Sin esta
   validación, alguien podría apuntarlo a metadata de la nube
   (http://169.254.169.254/…) o servicios internos y leer la
   respuesta desde el servidor. Solo se permite HTTPS hacia el
   Storage de Supabase del proyecto.

   Compartido entre /api/icon/[slug] (ícono de PWA) y
   /api/doc-logo/[kind]/[id] (logo dentro de PDFs de marca).
   ============================================================ */

export function isAllowedAssetUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  let supabaseHost = '';
  try {
    supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname.toLowerCase();
  } catch {
    /* sin configuración → solo el dominio público de Supabase */
  }
  return host === supabaseHost || host.endsWith('.supabase.co');
}
