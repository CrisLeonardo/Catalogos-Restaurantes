/* ============================================================
   POST /api/agent/poll
   El agente local consulta trabajos pendientes (cada ~3s).
   Autenticación: Authorization: Bearer <token-del-agente>.
   Body opcional: { printers: DiscoveredPrinter[] }  → heartbeat + lista.
   Respuesta: { jobs: [{ id, role, target, payload_b64 }] }
   ============================================================ */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { authenticateAgent } from '@/lib/print-agent';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const agent = await authenticateAgent(req);
  if (!agent) return new NextResponse('Token de agente inválido.', { status: 401 });

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const db = createServiceClient();

  // Heartbeat: última conexión + lista de impresoras reportadas.
  const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
  if (Array.isArray(body.printers)) patch.reported_printers = body.printers;
  if (typeof body.version === 'string') patch.agent_version = body.version;
  await db.from('print_agents').update(patch).eq('id', agent.agentId);

  // Reclamo atómico de trabajos pendientes para este restaurante.
  const { data, error } = await db.rpc('claim_print_jobs', {
    p_restaurant_id: agent.restaurantId,
    p_limit: 10,
  });
  if (error) return new NextResponse(error.message, { status: 500 });

  const jobs = (data ?? []).map((j: Record<string, unknown>) => ({
    id: j.id,
    role: j.role,
    target: j.target,
    payload_b64: j.payload_b64,
  }));

  return NextResponse.json({ jobs });
}
