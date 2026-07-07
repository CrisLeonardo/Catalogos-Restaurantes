// Daemon del agente: consulta trabajos a tu API, los imprime y confirma.
//
//   navegador → API → tabla print_jobs → (poll) → ESTE agente → impresora
//
// El servidor genera los bytes ESC/POS; el agente solo obedece el destino.

import { networkInterfaces } from 'node:os';
import { loadConfig, type AgentConfig } from './config.ts';
import { discoverPrinters, parseTarget, printRaw } from './printer/index.ts';
import type { DiscoveredPrinter } from './printer/types.ts';
import { LOCAL_PORT } from './local-server.ts';
import { saveMenuSnapshot, getPendingOrders, removePendingOrder, markPendingOrderFailed, type MenuSnapshot } from './store.ts';
import { AGENT_VERSION } from './version.ts';
import { logger } from './logger.ts';

interface Job {
  id: string;
  role: string;
  target: string;
  payload_b64: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Primera IP LAN (IPv4, no interna) de esta PC — es lo que el navegador del
    comensal necesita para hablarle al hub cuando la nube no responde. */
function localLanUrl(): string | null {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return `http://${iface.address}:${LOCAL_PORT}`;
      }
    }
  }
  return null;
}

async function safeDiscover(): Promise<DiscoveredPrinter[]> {
  try {
    return await discoverPrinters();
  } catch (e) {
    logger.warn('No se pudieron listar impresoras:', (e as Error).message);
    return [];
  }
}

async function poll(cfg: AgentConfig, printers: DiscoveredPrinter[]): Promise<Job[]> {
  const res = await fetch(`${cfg.apiUrl}/api/agent/poll`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ printers, version: AGENT_VERSION, hubUrl: localLanUrl() }),
  });
  if (!res.ok) throw new Error(`poll respondió HTTP ${res.status}`);
  const data = (await res.json()) as { jobs?: Job[] };
  return data.jobs ?? [];
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
  const pending = getPendingOrders();
  if (pending.length === 0) return;

  try {
    const res = await fetch(`${cfg.apiUrl}/api/agent/offline-orders`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ orders: pending.map((p) => p.payload) }),
    });
    if (!res.ok) throw new Error(`offline-orders respondió HTTP ${res.status}`);
    const data = (await res.json()) as {
      results?: { clientId: string | null; ok: boolean; error?: string }[];
    };
    for (const r of data.results ?? []) {
      if (!r.clientId) continue;
      if (r.ok) {
        removePendingOrder(r.clientId);
        logger.info(`✓ pedido offline ${r.clientId} sincronizado.`);
      } else {
        // Rechazo definitivo del servidor (ej. producto ya no existe): no
        // tiene sentido seguir reintentando lo mismo para siempre.
        markPendingOrderFailed(r.clientId, r.error ?? 'Error desconocido');
        logger.error(`✗ pedido offline ${r.clientId} rechazado: ${r.error}`);
      }
    }
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

  do {
    try {
      const jobs = await poll(cfg, printers);
      for (const job of jobs) await handleJob(cfg, job);
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

    await sleep(cfg.pollMs);
  } while (!opts.once);
}
