/* ============================================================
   API /api/push/super — avisos al celular del SUPER ADMIN (MON-04)
   POST   → este aparato quiere recibir los avisos graves
   DELETE → deja de recibirlos
   Las suscripciones de los restaurantes viven en /api/push/subscribe; estas
   no son de ningún restaurante (tabla super_push_subscriptions, mig 138).
   ============================================================ */

import { NextRequest, NextResponse } from 'next/server';
import { currentSuperAdmin } from '@/lib/auth/super-admin-guard';

export const runtime = 'nodejs';

type Cuerpo = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

export async function POST(req: NextRequest) {
  const sesion = await currentSuperAdmin();
  if (!sesion) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Cuerpo;
  const endpoint = body.endpoint;
  const { p256dh, auth } = body.keys ?? {};
  if (!endpoint?.startsWith('https://') || !p256dh || !auth) {
    return NextResponse.json({ error: 'Suscripción inválida.' }, { status: 400 });
  }

  const { error } = await sesion.db.from('super_push_subscriptions').upsert(
    { user_id: sesion.actorId, endpoint, p256dh, auth },
    { onConflict: 'endpoint' },
  );
  if (error) return NextResponse.json({ error: 'No se pudo guardar. ¿Falta la migración 138?' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const sesion = await currentSuperAdmin();
  if (!sesion) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Cuerpo;
  if (body.endpoint) {
    await sesion.db.from('super_push_subscriptions').delete().eq('endpoint', body.endpoint);
  }
  return NextResponse.json({ ok: true });
}
