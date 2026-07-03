// Daemon del agente: consulta trabajos a tu API, los imprime y confirma.
//
//   navegador → API → tabla print_jobs → (poll) → ESTE agente → impresora
//
// El servidor genera los bytes ESC/POS; el agente solo obedece el destino.

import { loadConfig, type AgentConfig } from './config.ts';
import { discoverPrinters, parseTarget, printRaw } from './printer/index.ts';
import type { DiscoveredPrinter } from './printer/types.ts';
import { getHubInfo } from './hub.ts';
import { AGENT_VERSION } from './version.ts';
import { logger } from './logger.ts';

interface Job {
  id: string;
  role: string;
  target: string;
  payload_b64: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    // hubUrl: el panel muestra el punto de emergencia LAN al dueño (mig. 062).
    body: JSON.stringify({ printers, version: AGENT_VERSION, hubUrl: getHubInfo().url }),
  });
  if (!res.ok) throw new Error(`poll respondió HTTP ${res.status}`);
  const data = (await res.json()) as { jobs?: Job[] };
  return data.jobs ?? [];
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
    await sleep(cfg.pollMs);
  } while (!opts.once);
}
