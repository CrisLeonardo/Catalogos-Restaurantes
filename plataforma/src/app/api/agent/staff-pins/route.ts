/* ============================================================
   GET /api/agent/staff-pins
   El hub local lo sondea junto con /api/agent/menu (mismo ciclo, ver
   syncMenu en agente-impresion/src/agent.ts) para poder validar el PIN de
   un operador SIN conexión. Nunca el PIN en claro — solo hash+salt, mismo
   algoritmo (crypto.scrypt) que valida el lado nube en verifyStaffPin().
   Autenticación: Authorization: Bearer <token-del-agente> (igual que /menu).
   ============================================================ */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { authenticateAgent } from '@/lib/print-agent';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const agent = await authenticateAgent(req);
  if (!agent) return new NextResponse('Token de agente inválido.', { status: 401 });

  const db = createServiceClient();
  const { data } = await db
    .from('staff_pins')
    .select('profile_id, pin_hash, pin_salt, profiles(full_name, permissions)')
    .eq('restaurant_id', agent.restaurantId);

  const staffPins = (data ?? []).map((r) => {
    const profile = r.profiles as unknown as { full_name: string | null; permissions: string[] | null } | null;
    return {
      profileId: r.profile_id as string,
      fullName: profile?.full_name ?? null,
      permissions: profile?.permissions ?? null,
      pinHash: r.pin_hash as string,
      pinSalt: r.pin_salt as string,
    };
  });

  return NextResponse.json({ staffPins });
}
