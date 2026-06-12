/* ============================================================
   API /api/push/subscribe
   POST  → suscribe este dispositivo al restaurante del admin
   DELETE → elimina la suscripción de este endpoint
   ============================================================ */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

async function getRestaurantId(req: NextRequest): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id, role')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  // El Super Admin puede suscribirse pasando un restaurantId en el body.
  if (profile.role === 'SUPER_ADMIN') {
    const body = await req.clone().json().catch(() => ({})) as { restaurantId?: string };
    return body.restaurantId ?? null;
  }

  return profile.restaurant_id as string | null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      restaurantId?: string;
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };

    const { endpoint, keys } = body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Suscripción inválida.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('restaurant_id, role')
      .eq('id', user.id)
      .single();

    if (!profile) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

    let restaurantId = profile.restaurant_id as string | null;
    if (profile.role === 'SUPER_ADMIN') {
      restaurantId = body.restaurantId ?? null;
    }

    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante no encontrado.' }, { status: 400 });
    }

    const db = createServiceClient();
    const { error } = await db.from('push_subscriptions').upsert(
      { restaurant_id: restaurantId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: 'restaurant_id,endpoint' },
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json() as { endpoint: string };
    const { endpoint } = body;
    if (!endpoint) return NextResponse.json({ error: 'Endpoint requerido.' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

    const db = createServiceClient();
    await db.from('push_subscriptions').delete().eq('endpoint', endpoint);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 });
  }
}
