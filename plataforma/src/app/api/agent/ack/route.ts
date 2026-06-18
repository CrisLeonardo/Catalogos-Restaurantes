/* ============================================================
   POST /api/agent/ack
   El agente confirma el resultado de un trabajo.
   Autenticación: Authorization: Bearer <token-del-agente>.
   Body: { jobId: string, ok: boolean, error?: string }
   ============================================================ */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { authenticateAgent } from '@/lib/print-agent';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const agent = await authenticateAgent(req);
  if (!agent) return new NextResponse('Token de agente inválido.', { status: 401 });

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const jobId = typeof body.jobId === 'string' ? body.jobId : '';
  if (!jobId) return new NextResponse('Falta jobId.', { status: 400 });

  const ok = body.ok === true;
  const db = createServiceClient();
  const { error } = await db
    .from('print_jobs')
    .update({
      status: ok ? 'done' : 'failed',
      error: ok ? null : (typeof body.error === 'string' ? body.error : 'Error desconocido'),
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('restaurant_id', agent.restaurantId); // un agente solo cierra sus propios trabajos

  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json({ ok: true });
}
