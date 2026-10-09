/* ============================================================
   SALUD DE LOS CLIENTES — disparador HTTP (MON-04)
   ------------------------------------------------------------
   Revisa la salud de todos los restaurantes (lib/client-health.ts) y manda
   al celular del Super Admin lo GRAVE — la PC del local caída en horario de
   servicio, muchas comandas sin imprimir — sin repetir el mismo aviso antes
   de HORAS_ENTRE_AVISOS.

   Autenticación: Authorization: Bearer <SALUD_CRON_SECRET>. Sin la variable
   responde 404, como si no existiera.

   El reloj: .github/workflows/salud-clientes.yml (gratis, cada hora), mismo
   patrón que la cola FEL. Un monitor externo o un cron de Render sirven
   igual: el endpoint no sabe quién lo llama.
   ============================================================ */

import { createServiceClient } from '@/lib/supabase/service';
import { getClientHealth } from '@/lib/db/client-health';
import { alertasDeSalud, alertasPorAvisar } from '@/lib/client-health';
import { sendPushToSuperAdmins } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function autorizado(req: Request, esperado: string): boolean {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token.length !== esperado.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ esperado.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: Request) {
  const esperado = process.env.SALUD_CRON_SECRET;
  if (!esperado) return new Response('Not found', { status: 404 });
  if (!autorizado(req, esperado)) return Response.json({ error: 'No autorizado.' }, { status: 401 });

  const salud = await getClientHealth();
  if (salud.faltaMigracion) {
    return Response.json({ ok: true, faltaMigracion: true, avisos: 0 }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const alertas = alertasDeSalud(salud.restaurantes, salud.cuentas);
  const graves = alertas.filter((a) => a.grave);

  const db = createServiceClient();
  const { data: filas } = graves.length
    ? await db.from('super_alertas_enviadas').select('clave, enviada_en').in('clave', graves.map((a) => a.key))
    : { data: [] };
  const enviadas = new Map((filas ?? []).map((f) => [f.clave as string, f.enviada_en as string]));
  const nuevas = alertasPorAvisar(graves, enviadas);

  let aparatos = 0;
  for (const a of nuevas) {
    aparatos += await sendPushToSuperAdmins({
      title: a.title,
      body: a.body,
      url: a.href,
      tag: `super-${a.key}`,
      requireInteraction: true,
    });
  }

  if (nuevas.length) {
    const ahora = new Date().toISOString();
    await db.from('super_alertas_enviadas').upsert(nuevas.map((a) => ({ clave: a.key, enviada_en: ahora })));
  }
  // Limpieza: lo de hace una semana ya no sirve para no repetir nada.
  await db.from('super_alertas_enviadas').delete().lt('enviada_en', new Date(Date.now() - 7 * 86_400_000).toISOString());

  return Response.json(
    { ok: true, alertas: alertas.length, graves: graves.length, avisadas: nuevas.length, aparatos },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
