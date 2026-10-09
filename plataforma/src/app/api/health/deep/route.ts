import { createServiceClient } from '@/lib/supabase/service';

/**
 * Salud DE VERDAD, para un monitor externo (UptimeRobot, Better Stack…).
 * PLAN_ACCESO_Y_MONITOREO_2026-10-08, MON-02.
 *
 * `/api/health` NO sirve para eso y no se toca: contesta «ok» sin mirar nada
 * porque su trabajo es otro —decirle al modo sin internet del panel si hay
 * camino hasta el servidor—. Con Render arriba y Supabase caído respondería
 * «ok» mientras ningún restaurante puede tomar un pedido.
 *
 * Esta pregunta a las dos piezas de las que depende todo: la base de datos
 * (una lectura mínima) y Supabase Auth (sin él nadie entra). Responde 503 si
 * cualquiera falla o tarda más de 5 s, que es lo que el monitor convierte en
 * aviso. No enseña nada interno: solo qué pieza falló.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIMITE_MS = 5_000;

async function conLimite<T>(promesa: PromiseLike<T>): Promise<T> {
  return Promise.race([
    promesa,
    new Promise<never>((_, rechazar) => setTimeout(() => rechazar(new Error('tiempo agotado')), LIMITE_MS)),
  ]);
}

async function baseDeDatos(): Promise<boolean> {
  try {
    const { error } = await conLimite(
      createServiceClient().from('restaurants').select('id', { head: true, count: 'exact' }).limit(1),
    );
    return !error;
  } catch {
    return false;
  }
}

async function auth(): Promise<boolean> {
  try {
    const res = await conLimite(
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' },
        cache: 'no-store',
      }),
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const [db, autenticacion] = await Promise.all([baseDeDatos(), auth()]);
  const ok = db && autenticacion;
  return Response.json(
    { ok, baseDeDatos: db, auth: autenticacion },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
