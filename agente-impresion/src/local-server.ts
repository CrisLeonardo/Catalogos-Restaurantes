// Servidor local en 127.0.0.1. Cumple tres funciones:
//   1) Candado de instancia única: si el puerto ya está ocupado, otro agente
//      corre en esta PC → la nueva instancia se cierra (evita doble impresión).
//   2) Endpoint de salud para que el panel detecte "agente activo en esta PC".
//   3) POST /print: imprime directo sin pasar por la nube (latencia mínima en la
//      misma PC; base para impresión LAN sin internet).

import http from 'node:http';
import { parseTarget, printRaw } from './printer/index.ts';
import { getHubInfo } from './hub.ts';
import { AGENT_VERSION } from './version.ts';
import { logger } from './logger.ts';

export const LOCAL_PORT = 47100;

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => resolve(body));
  });
}

async function handlePrint(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    const { target, payloadB64 } = JSON.parse((await readBody(req)) || '{}');
    if (!target || !payloadB64) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Faltan target o payloadB64.' }));
      return;
    }
    const bytes = new Uint8Array(Buffer.from(payloadB64, 'base64'));
    await printRaw(parseTarget(target), bytes);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: (e as Error).message }));
  }
}

/** Intenta tomar el puerto. true = somos la única instancia; false = ya hay otra. */
export function startLocalServer(): Promise<boolean> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/health') {
        res.setHeader('content-type', 'application/json');
        // hubUrl: punto de emergencia en la LAN (el panel lo muestra al dueño).
        const hub = getHubInfo();
        res.end(JSON.stringify({
          ok: true, agent: 'leogin', version: AGENT_VERSION,
          hubUrl: hub.url, hubQueued: hub.queued,
        }));
        return;
      }
      if (req.method === 'POST' && req.url === '/print') {
        void handlePrint(req, res);
        return;
      }
      res.statusCode = 404;
      res.end();
    });

    server.once('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'EADDRINUSE') {
        resolve(false); // ya hay un agente en esta PC
      } else {
        logger.warn('Servidor local:', e.message);
        resolve(true); // un error distinto no debe impedir imprimir
      }
    });

    server.listen(LOCAL_PORT, '127.0.0.1', () => {
      logger.info(`Servidor local en http://127.0.0.1:${LOCAL_PORT}/health`);
      resolve(true);
    });
  });
}
