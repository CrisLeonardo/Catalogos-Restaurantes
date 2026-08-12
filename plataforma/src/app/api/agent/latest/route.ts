/* ============================================================
   GET /api/agent/latest
   El agente pregunta (cada ~1h y al arrancar) cuál es el release
   vigente de su canal. Autenticación: Bearer <token-del-agente> —
   así el canal (stable/beta) se resuelve por restaurante y el
   rollout se controla desde la base (migración 065).

   Desde 2026-08-11 el canal `stable` además DESCUBRE los releases
   publicados en GitHub (ver lib/agent-updates.ts): publicar el .exe
   ya es suficiente para que los agentes se actualicen solos, sin
   depender de que alguien corra el INSERT en `agent_releases` con la
   clave de producción. Cuando lo descubre, registra la fila él mismo
   —así el kill switch de la 065 sigue teniendo de dónde agarrarse—.

   Respuesta: { release: { version, url, sha256, notes } | null }
   ============================================================ */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { authenticateAgent } from '@/lib/print-agent';
import {
  latestAgentFromGitHub, pickAgentRelease,
  type AgentRelease, type KnownRelease,
} from '@/lib/agent-updates';

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

  // Se leen también las apagadas: son el kill switch, y hay que respetarlas
  // aunque el release siga publicado en GitHub.
  const { data: rows } = await db
    .from('agent_releases')
    .select('version, url, sha256, notes, enabled')
    .eq('channel', channel)
    .order('created_at', { ascending: false })
    .limit(20);

  const known: KnownRelease[] = (rows ?? []).map((r) => ({
    version: r.version as string,
    enabled: (r.enabled as boolean) !== false,
  }));
  const fromDb = (rows ?? []).find((r) => (r.enabled as boolean) !== false) ?? null;
  const dbRelease: AgentRelease | null = fromDb
    ? {
        version: fromDb.version as string,
        url: fromDb.url as string,
        sha256: fromDb.sha256 as string,
        notes: (fromDb.notes as string | null) ?? null,
      }
    : null;

  // El descubrimiento es solo del canal estable: `beta` es una decisión
  // deliberada de quien publica, no algo que deba pasar solo.
  const fromGitHub = channel === 'stable' ? await latestAgentFromGitHub() : null;
  const { release, source } = pickAgentRelease(dbRelease, fromGitHub, known);

  // Registrar lo descubierto: deja rastro de qué se está sirviendo y le da al
  // kill switch una fila que apagar. Best-effort — si falla, se sirve igual.
  if (source === 'github' && release && !known.some((k) => k.version === release.version)) {
    const { error } = await db.from('agent_releases').insert({
      version: release.version,
      channel,
      url: release.url,
      sha256: release.sha256,
      notes: release.notes ?? 'Descubierto en GitHub Releases.',
    });
    if (error) console.error('[agent/latest] no se pudo registrar el release descubierto:', error.message);
  }

  return NextResponse.json({ release });
}
