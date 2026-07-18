/* ============================================================
   POST /api/agent/shell-heartbeat
   Telemetría mínima de Leogin Desktop (roadmap §8.5, migración 067):
   la propia página del panel — cuando corre DENTRO de la app instalable,
   ver SHELL_TELEMETRY_JS_TEMPLATE en leogin-desktop/src-tauri/src/main.rs —
   hace este fetch autenticado por su misma sesión (cookie), sin pasar por
   IPC ni exponer un comando nuevo al shell. Solo ACTUALIZA una fila
   print_agents ya existente (nunca crea una: token_hash es NOT NULL y
   "vinculado" debe seguir significando "el agente de impresión se instaló").
   ============================================================ */

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

async function resolveRestaurantId(
  ctx: NonNullable<Awaited<ReturnType<typeof getAdminContext>>>,
): Promise<string | null> {
  if (ctx.restaurant) return ctx.restaurant.id as string;
  if (ctx.profile.role === 'SUPER_ADMIN') {
    const slug = (await headers()).get('x-tenant-slug');
    if (!slug) return null;
    const tenantData = await getRestaurantBySlug(slug);
    return (tenantData?.restaurant.id as string) ?? null;
  }
  return null;
}

export async function POST(req: Request) {
  const ctx = await getAdminContext();
  if (!ctx) return new NextResponse('No autorizado.', { status: 401 });

  const restaurantId = await resolveRestaurantId(ctx);
  if (!restaurantId) return new NextResponse('No autorizado.', { status: 401 });

  let version: string | null = null;
  try {
    const body = (await req.json()) as { version?: unknown };
    if (typeof body.version === 'string' && body.version.trim()) version = body.version.trim().slice(0, 40);
  } catch {
    /* cuerpo inválido → se ignora, no hay nada que guardar */
  }
  if (!version) return NextResponse.json({ ok: false });

  const db = createServiceClient();
  // UPDATE, no upsert: si el restaurante nunca vinculó el agente de impresión
  // no existe fila (token_hash es not null) — no hay dónde reportar todavía.
  await db
    .from('print_agents')
    .update({ shell_version: version, shell_last_seen_at: new Date().toISOString() })
    .eq('restaurant_id', restaurantId);

  return NextResponse.json({ ok: true });
}
