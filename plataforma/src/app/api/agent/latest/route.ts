/* ============================================================
   GET /api/agent/latest
   El agente pregunta (cada ~1h y al arrancar) cuál es el release
   vigente de su canal. Autenticación: Bearer <token-del-agente> —
   así el canal (stable/beta) se resuelve por restaurante y el
   rollout se controla desde la base (migración 065).

   Respuesta: { release: { version, url, sha256, notes } | null }
   ============================================================ */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { authenticateAgent } from '@/lib/print-agent';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const agent = await authenticateAgent(req);
  if (!agent) return new NextResponse('Token de agente inválido.', { status: 401 });

  const db = createServiceClient();
  const { data: row } = await db
    .from('print_agents')
    .select('update_channel')
    .eq('id', agent.agentId)
    .single();
  const channel = (row?.update_channel as string | null) ?? 'stable';

  const { data: release } = await db
    .from('agent_releases')
    .select('version, url, sha256, notes')
    .eq('channel', channel)
    .eq('enabled', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ release: release ?? null });
}
