// Daemon del agente: consulta trabajos a tu API, los imprime y confirma.
//
//   navegador → API → tabla print_jobs → (poll) → ESTE agente → impresora
//
// El servidor genera los bytes ESC/POS; el agente solo obedece el destino.

import { networkInterfaces } from 'node:os';
import { loadConfig, type AgentConfig } from './config.ts';
import { discoverPrinters, parseTarget, printRaw } from './printer/index.ts';
import type { DiscoveredPrinter } from './printer/types.ts';
import { LOCAL_PORT, startTlsServer } from './local-server.ts';
import { saveMenuSnapshot, getPendingOrders, markPendingOrderSynced, markPendingOrderFailed, getHubOrderToken, getHubTls, saveHubTls, type MenuSnapshot, type HubTls } from './store.ts';
import { checkForUpdate } from './updater.ts';
import { AGENT_VERSION } from './version.ts';
import { logger } from './logger.ts';

interface Job {
  id: string;
  role: string;
  target: string;
  payload_b64: string;
}

/** Anuncio TLS que llega en el poll (migración 064): si el certSha256 difiere
    del guardado, hay que bajar el certificado nuevo por /api/agent/hub-cert. */
interface HubTlsAd {
  hostname: string;
  certSha256: string;
  port: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Primera IP LAN (IPv4, no interna) de esta PC — es lo que el registro DNS
    del hub necesita, y lo que usa el navegador para el fallback HTTP. */
function localLanIp(): string | null {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

function localLanUrl(): string | null {
  const ip = localLanIp();
  return ip ? `http://${ip}:${LOCAL_PORT}` : null;
}

async function safeDiscover(): Promise<DiscoveredPrinter[]> {
  try {
    return await discoverPrinters();
  } catch (e) {
    logger.warn('No se pudieron listar impresoras:', (e as Error).message);
    return [];
  }
}

async function poll(cfg: AgentConfig, printers: DiscoveredPrinter[]): Promise<{ jobs: Job[]; hubTls: HubTlsAd | null }> {
  const res = await fetch(`${cfg.apiUrl}/api/agent/poll`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      printers,
      version: AGENT_VERSION,
      hubUrl: localLanUrl(),
      lanIp: localLanIp(),
      hubOrderToken: getHubOrderToken(),
    }),
  });
  if (!res.ok) throw new Error(`poll respondió HTTP ${res.status}`);
  const data = (await res.json()) as { jobs?: Job[]; hubTls?: HubTlsAd | null };
  return { jobs: data.jobs ?? [], hubTls: data.hubTls ?? null };
}

// ── Certificado HTTPS del hub (migración 064) ────────────────────────────────
let lastCertFetch = 0;

/** Si la nube anuncia un certificado distinto al guardado, se baja y se
    (re)inicia el servidor HTTPS en caliente. Throttle de 60s para no
    martillar si la descarga falla. */
async function syncHubTls(cfg: AgentConfig, ad: HubTlsAd | null): Promise<void> {
  if (!ad) return;
  const current = getHubTls();
  if (current?.certSha256 === ad.certSha256 && current?.hostname === ad.hostname) return;
  if (Date.now() - lastCertFetch < 60_000) return;
  lastCertFetch = Date.now();

  try {
    const res = await fetch(`${cfg.apiUrl}/api/agent/hub-cert`, {
      headers: { authorization: `Bearer ${cfg.token}` },
    });
    if (!res.ok) throw new Error(`hub-cert respondió HTTP ${res.status}`);
    const tls = (await res.json()) as HubTls;
    if (!tls.certPem || !tls.keyPem || !tls.hostname) throw new Error('respuesta incompleta');
    saveHubTls(tls);
    startTlsServer();
    logger.info(`Certificado del hub actualizado (${tls.hostname}, expira ${tls.expiresAt}).`);
  } catch (e) {
    logger.warn('No se pudo bajar el certificado del hub:', (e as Error).message);
  }
}

/** Refresca el snapshot local de menú (Fase 2 offline) — best-effort, un
    fallo acá no debe interrumpir el poll de impresión. */
async function syncMenu(cfg: AgentConfig): Promise<void> {
  try {
    const res = await fetch(`${cfg.apiUrl}/api/agent/menu`, {
      headers: { authorization: `Bearer ${cfg.token}` },
    });
    if (!res.ok) throw new Error(`menu respondió HTTP ${res.status}`);
    const data = (await res.json()) as MenuSnapshot;
    saveMenuSnapshot(data);
  } catch (e) {
    logger.warn('No se pudo refrescar el menú del hub:', (e as Error).message);
  }
}

/** Sincroniza los pedidos tomados sin conexión (Fase 2 offline). Best-effort:
    si sigue sin haber internet, simplemente quedan en cola para el próximo
    intento. */
async function syncPendingOrders(cfg: AgentConfig): Promise<void> {
  // Solo los 'pending': los 'failed' ya fueron rechazados definitivamente por
  // el servidor — sin este filtro se reenviaban cada 60s para siempre (el
  // estado failed era cosmético).
  const pending = getPendingOrders().filter((p) => p.status === 'pending');
  if (pending.length === 0) return;

  try {
    const res = await fetch(`${cfg.apiUrl}/api/agent/offline-orders`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ orders: pending.map((p) => p.payload) }),
    });
    if (!res.ok) throw new Error(`offline-orders respondió HTTP ${res.status}`);
    const data = (await res.json()) as {
      results?: { clientId: string | null; ok: boolean; orderNumber?: string; error?: string }[];
    };
    (data.results ?? []).forEach((r, i) => {
      // El servidor procesa el lote en el mismo orden en que se envió; si el
      // resultado no trae clientId (payload que ni siquiera pasó el schema),
      // se resuelve por posición — sin esto, un pedido malformado quedaría
      // reintentándose cada 60s para siempre.
      const clientId = r.clientId ?? pending[i]?.clientId ?? null;
      if (!clientId) return;
      if (r.ok) {
        markPendingOrderSynced(clientId, r.orderNumber);
        logger.info(`✓ pedido offline ${clientId} sincronizado${r.orderNumber ? ` como ${r.orderNumber}` : ''}.`);
      } else {
        // Rechazo definitivo del servidor (ej. producto ya no existe): no
        // tiene sentido seguir reintentando lo mismo para siempre.
        markPendingOrderFailed(clientId, r.error ?? 'Error desconocido');
        logger.error(`✗ pedido offline ${clientId} rechazado: ${r.error}`);
      }
    });
  } catch (e) {
    logger.warn('No se pudieron sincronizar los pedidos offline:', (e as Error).message);
  }
}

async function ack(cfg: AgentConfig, jobId: string, ok: boolean, error?: string): Promise<void> {
  try {
    await fetch(`${cfg.apiUrl}/api/agent/ack`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ jobId, ok, error }),
    });
  } catch (e) {
    logger.warn(`No se pudo confirmar el job ${jobId}:`, (e as Error).message);
  }
}

async function handleJob(cfg: AgentConfig, job: Job): Promise<void> {
  try {
    const target = parseTarget(job.target);
    const bytes = new Uint8Array(Buffer.from(job.payload_b64, 'base64'));
    logger.info(`Imprimiendo job ${job.id} (${job.role}) → ${job.target}`);
    await printRaw(target, bytes);
    await ack(cfg, job.id, true);
    logger.info(`✓ job ${job.id} impreso.`);
  } catch (e) {
    const msg = (e as Error).message;
    logger.error(`✗ job ${job.id} falló: ${msg}`);
    await ack(cfg, job.id, false, msg);
  }
}

export async function runAgent(opts: { once?: boolean } = {}): Promise<void> {
  const cfg = await loadConfig();
  logger.info(`Agente conectado a ${cfg.apiUrl} (poll cada ${cfg.pollMs} ms).`);

  let printers = await safeDiscover();
  logger.info(`${printers.length} impresora(s) detectada(s) y reportada(s).`);
  let lastDiscover = Date.now();
  let lastHubSync = 0; // fuerza una sincronización de menú/pedidos en el primer ciclo
  let lastUpdateCheck = 0; // fuerza un chequeo de actualización al arrancar

  do {
    try {
      const { jobs, hubTls } = await poll(cfg, printers);
      for (const job of jobs) await handleJob(cfg, job);
      await syncHubTls(cfg, hubTls);
    } catch (e) {
      logger.warn('Fallo al consultar trabajos:', (e as Error).message);
    }

    if (opts.once) break;

    // Refresca la lista de impresoras cada 60s (detecta nuevas o quitadas).
    if (Date.now() - lastDiscover > 60_000) {
      printers = await safeDiscover();
      lastDiscover = Date.now();
    }

    // Fase 2 offline: refresca el snapshot de menú y sincroniza pedidos
    // tomados sin conexión, cada 60s (mismo ritmo que el refresco de
    // impresoras). Ambos son best-effort — si sigue sin haber internet,
    // simplemente no avanzan hasta el próximo ciclo.
    if (Date.now() - lastHubSync > 60_000) {
      await syncMenu(cfg);
      await syncPendingOrders(cfg);
      lastHubSync = Date.now();
    }

    // Auto-update: cada hora (y al arrancar). Va DESPUÉS de sincronizar los
    // pedidos pendientes — si hay versión nueva, este proceso TERMINA aquí y
    // el watchdog relanza el exe nuevo.
    if (Date.now() - lastUpdateCheck > 3_600_000) {
      lastUpdateCheck = Date.now();
      await checkForUpdate(cfg);
    }

    await sleep(cfg.pollMs);
  } while (!opts.once);
}
