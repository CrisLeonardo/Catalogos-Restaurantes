/* ============================================================
   GET /api/agent/hub-cert
   El agente descarga el certificado wildcard del hub (migración 064)
   cuando el poll le anuncia un certSha256 distinto al que tiene.
   Autenticación: Authorization: Bearer <token-del-agente> — el mismo
   canal por el que viajan los trabajos de impresión.
   ============================================================ */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { authenticateAgent } from '@/lib/print-agent';
import { getActiveHubCert, hubTlsConfig, hostnameForAgent, HUB_TLS_PORT } from '@/lib/hub-tls';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const agent = await authenticateAgent(req);
  if (!agent) return new NextResponse('Token de agente inválido.', { status: 401 });

  const cfg = hubTlsConfig();
  if (!cfg) return new NextResponse('HTTPS del hub no configurado.', { status: 404 });

  const db = createServiceClient();
  const cert = await getActiveHubCert(db);
  if (!cert) return new NextResponse('Aún no hay certificado emitido.', { status: 404 });

  const { data } = await db
    .from('print_agents')
    .select('hub_hostname')
    .eq('id', agent.agentId)
    .single();
  const hostname = (data?.hub_hostname as string | null) ?? hostnameForAgent(agent.agentId, cfg.hubDomain);

  return NextResponse.json({
    hostname,
    port: HUB_TLS_PORT,
    certPem: cert.certPem,
    keyPem: cert.keyPem,
    expiresAt: cert.expiresAt,
    certSha256: cert.sha256,
  });
}
