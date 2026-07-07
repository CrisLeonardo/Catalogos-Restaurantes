// Servidor del hub local, visible en la LAN del restaurante (no solo
// 127.0.0.1). Cumple cuatro funciones:
//   1) Candado de instancia única: si el puerto ya está ocupado, otro agente
//      corre en esta PC → la nueva instancia se cierra (evita doble impresión).
//   2) Endpoint de salud para que el panel detecte "agente activo en esta PC".
//   3) POST /print: imprime directo sin pasar por la nube (latencia mínima en la
//      misma PC; base para impresión LAN sin internet).
//   4) POST /orders: acepta pedidos tomados sin conexión (Fase 2 offline) —
//      el navegador del comensal le habla directo cuando la nube no responde.
//      Sin token: la LAN del restaurante es la única barrera para esta primera
//      versión (todo pedido se re-valida contra el snapshot local de precios,
//      nunca se confía en el monto que manda el cliente — ver order-intake.ts).

import http from 'node:http';
import { parseTarget, printRaw } from './printer/index.ts';
import { acceptOfflineOrder } from './order-intake.ts';
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

/** POST /orders — pedido tomado sin conexión. Responde con la misma forma
    que CreateOrderResult (plataforma/src/lib/actions/orders.ts) para que
    checkout-form.tsx lo consuma sin casos especiales. */
async function handleOrder(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  res.setHeader('content-type', 'application/json');
  let body: unknown;
  try {
    body = JSON.parse((await readBody(req)) || '{}');
  } catch {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'JSON inválido.' }));
    return;
  }

  const result = await acceptOfflineOrder(body);
  if (!result.ok) {
    res.statusCode = result.status;
    res.end(JSON.stringify({ error: result.error }));
    return;
  }
  res.end(JSON.stringify({
    success: true,
    orderId: result.orderId,
    orderNumber: result.orderNumber,
    publicToken: null,
  }));
}

/** Intenta tomar el puerto. true = somos la única instancia; false = ya hay otra. */
export function startLocalServer(): Promise<boolean> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      // CORS: /orders lo llama el navegador del comensal desde el origen del
      // catálogo (otro puerto/dominio), no desde este servidor — sin esto el
      // navegador bloquea la respuesta aunque el pedido ya se haya procesado.
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      res.setHeader('access-control-allow-headers', 'content-type');

      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }
      if (req.method === 'GET' && req.url === '/health') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, agent: 'leogin', version: AGENT_VERSION }));
        return;
      }
      if (req.method === 'POST' && req.url === '/print') {
        void handlePrint(req, res);
        return;
      }
      if (req.method === 'POST' && req.url === '/orders') {
        void handleOrder(req, res);
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

    server.listen(LOCAL_PORT, '0.0.0.0', () => {
      logger.info(`Hub local escuchando en el puerto ${LOCAL_PORT} (LAN).`);
      resolve(true);
    });
  });
}
