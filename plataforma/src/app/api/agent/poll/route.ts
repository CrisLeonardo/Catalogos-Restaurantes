/* ============================================================
   POST /api/agent/poll
   El agente local consulta trabajos pendientes (cada ~3s).
   Autenticación: Authorization: Bearer <token-del-agente>.
   Body opcional: { printers: DiscoveredPrinter[] }  → heartbeat + lista.
   Respuesta: { jobs: [{ id, role, target, payload_b64 }] }
   ============================================================ */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { authenticateAgentResult } from '@/lib/print-agent';
import { ensureHubTls } from '@/lib/hub-tls';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const auth = await authenticateAgentResult(req);
  // Este endpoint —y solo este— distingue "te revocaron" de "no pude
  // comprobarlo". El agente apaga su hub local al ver `revoked`, así que un
  // fallo de base de datos NO puede contarse como revocación: sería apagar
  // todos los hubs del país durante una caída de Supabase.
  if (auth.status === 'unavailable') {
    return NextResponse.json(
      { error: 'No se pudo comprobar el token ahora mismo.' },
      { status: 503 },
    );
  }
  if (auth.status === 'revoked') {
    return NextResponse.json(
      {
        error: 'Esta computadora ya no es la PC principal del local.',
        // Bandera explícita (agente ≥0.7.1): el 401 pelado no bastaba para
        // decidir algo tan serio como dejar de servir pedidos.
        revoked: true,
      },
      { status: 401 },
    );
  }
  const agent = auth.identity;

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const db = createServiceClient();

  // Heartbeat: última conexión + lista de impresoras reportadas.
  const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
  if (Array.isArray(body.printers)) patch.reported_printers = body.printers;
  if (typeof body.version === 'string') patch.agent_version = body.version;
  // URL LAN del hub local (Fase 2 offline) — el navegador del comensal la usa
  // como fallback cuando la nube no responde. Ver migración 062.
  if (typeof body.hubUrl === 'string') patch.hub_url = body.hubUrl;
  // Token que ese hub exige en POST /orders (migración 063) — cierra el
  // riesgo aceptado de que cualquiera en el WiFi cree pedidos falsos a ciegas.
  if (typeof body.hubOrderToken === 'string') patch.hub_order_token = body.hubOrderToken;
  // IP LAN pelada (migración 064) — mantiene el registro A del hostname HTTPS
  // del hub (<id>.hub.<dominio> → esta IP). Agentes v0.4.0+.
  if (typeof body.lanIp === 'string') patch.hub_lan_ip = body.lanIp;
  // Nombre de la PC (migración 094) — para que el panel pueda decir CUÁL de
  // las computadoras del local es la principal, no solo que "hay una".
  if (typeof body.deviceName === 'string' && body.deviceName.length <= 80) {
    patch.device_name = body.deviceName;
  }
  const { data: agentRow } = await db
    .from('print_agents')
    .update(patch)
    .eq('id', agent.agentId)
    .select('hub_hostname, hub_lan_ip, hub_dns_synced_ip')
    .single();

  // HTTPS del hub (migración 064): asigna hostname, mantiene DNS y anuncia el
  // certificado vigente. Best-effort — jamás debe romper la impresión.
  let hubTls = null;
  try {
    hubTls = await ensureHubTls(db, agent.agentId, agentRow ?? null);
  } catch (e) {
    console.error('[hub-tls] ensureHubTls falló:', (e as Error).message);
  }

  // URL del hub de emergencia (mig. 062). Update APARTE y best-effort: si la
  // migración no está aplicada, el fallo no debe romper el heartbeat.
  if (typeof body.hubUrl === 'string' && body.hubUrl.length <= 120) {
    await db.from('print_agents').update({ hub_url: body.hubUrl }).eq('id', agent.agentId);
  }

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

  return NextResponse.json({ jobs, hubTls });
}
