// Servidor del hub local, visible en la LAN del restaurante (no solo
// 127.0.0.1). Cumple cuatro funciones:
//   1) Candado de instancia única: si el puerto ya está ocupado, otro agente
//      corre en esta PC → la nueva instancia se cierra (evita doble impresión).
//   2) Endpoint de salud para que el panel detecte "agente activo en esta PC".
//   3) POST /print: imprime directo sin pasar por la nube (latencia mínima en la
//      misma PC; base para impresión LAN sin internet). Exige x-hub-token igual
//      que /orders — al estar el puerto abierto a la LAN, sin token cualquiera
//      en el WiFi podría mandar bytes a las impresoras (spam de papel, tickets
//      falsos).
//   4) POST /orders: acepta pedidos tomados sin conexión (Fase 2 offline) —
//      el navegador del comensal o del mesero le habla directo cuando la nube
//      no responde. Exige el header x-hub-token (migración 063) con el mismo
//      token que este hub generó y reporta al cloud en su heartbeat — así se
//      cierra el riesgo aceptado en la v1 (cualquiera en el WiFi podía crear
//      pedidos falsos a ciegas). Todo pedido se re-valida además contra el
//      snapshot local de precios, nunca se confía en el monto que manda el
//      cliente — ver order-intake.ts.

//   5) KDS local de respaldo (/kds): pantalla de cocina servida por el propio
//      hub — cocina la abre en la LAN y ve los pedidos capturados sin nube,
//      incluso durante el corte. Ver kds.ts.

import http from 'node:http';
import https from 'node:https';
import { parseTarget, printRaw } from './printer/index.ts';
import { acceptOfflineOrder } from './order-intake.ts';
import { getHubOrderToken, getHubTls } from './store.ts';
import { kdsOrdersPayload, kdsMarkDone, sendKdsPage } from './kds.ts';
import { loadConfig } from './config.ts';
import { AGENT_VERSION } from './version.ts';
import { logger } from './logger.ts';

/** Página de estado (GET /). El apiUrl se resuelve perezoso y tolerante: si
    el agente corre sin configuración, la página igual abre (sin ese enlace). */
function statusPageHtml(): string {
  let panelUrl: string | null = null;
  try {
    panelUrl = `${loadConfig().apiUrl}/admin/impresion`;
  } catch {
    /* sin config → sin enlace al panel */
  }
  const kdsUrl = `/kds?t=${encodeURIComponent(getHubOrderToken())}`;
  return `<!doctype html>
<html lang="es">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agente Leogin</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; }
  body { background: #0d1017; color: #e7eaf0; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
         min-height: 100vh; display: grid; place-items: center; padding: 24px; }
  main { max-width: 430px; width: 100%; background: #151a26; border: 1px solid #262d40; border-radius: 16px; padding: 26px; }
  h1 { font-size: 19px; display: flex; align-items: center; gap: 10px; }
  .dot { width: 10px; height: 10px; border-radius: 99px; background: #4ade80; box-shadow: 0 0 10px #4ade80; }
  .ver { font-size: 12px; color: #8b93a7; margin-top: 4px; }
  p { font-size: 13px; color: #aab2c5; margin-top: 14px; }
  .links { display: flex; flex-direction: column; gap: 9px; margin-top: 18px; }
  a { display: block; text-align: center; padding: 11px; border-radius: 10px; background: #233049;
      color: #e7eaf0; text-decoration: none; font-weight: 700; font-size: 13.5px; }
  a.sec { background: transparent; border: 1px solid #262d40; color: #aab2c5; font-weight: 600; }
</style>
<main>
  <h1><span class="dot"></span> Agente Leogin</h1>
  <div class="ver">v${AGENT_VERSION} · funcionando en esta PC</div>
  <p>Este programa imprime las comandas y recibos de tu restaurante y lo mantiene
  operando aunque se corte el internet. No necesitas hacer nada aquí — si ves
  esta página, todo está bien.</p>
  <div class="links">
    ${panelUrl ? `<a href="${panelUrl}" target="_blank" rel="noopener">Abrir mi panel (Impresión)</a>` : ''}
    <a class="sec" href="${kdsUrl}">Pantalla de cocina de respaldo</a>
  </div>
</main>
</html>`;
}

export const LOCAL_PORT = 47100;
/** Puerto HTTPS (migración 064) — debe coincidir con HUB_TLS_PORT de la nube. */
export const TLS_PORT = 47443;

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => resolve(body));
  });
}

async function handlePrint(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  res.setHeader('content-type', 'application/json');

  const provided = req.headers['x-hub-token'];
  if (provided !== getHubOrderToken()) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'Token del hub inválido o faltante.' }));
    return;
  }

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

  const provided = req.headers['x-hub-token'];
  if (provided !== getHubOrderToken()) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'Token del hub inválido o faltante.' }));
    return;
  }

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

/** Handler compartido por el servidor HTTP (:47100) y el HTTPS (:47443) —
    mismas rutas, misma seguridad; solo cambia el transporte. */
function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  // CORS: /orders lo llama el navegador del comensal desde el origen del
  // catálogo (otro puerto/dominio), no desde este servidor — sin esto el
  // navegador bloquea la respuesta aunque el pedido ya se haya procesado.
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type, x-hub-token');
  // Local Network Access (Chrome): respuesta al preflight de red privada.
  res.setHeader('access-control-allow-private-network', 'true');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method === 'GET' && req.url === '/health') {
    res.setHeader('content-type', 'application/json');
    // kdsPath (migración desktop 0.2.0): forma programática y estable de
    // resolver el KDS de respaldo — el modo kiosco de Leogin Desktop lo lee
    // de aquí en vez de scrapear la página de estado (GET /), que no todas
    // las versiones del agente sirven.
    res.end(JSON.stringify({
      ok: true,
      agent: 'leogin',
      version: AGENT_VERSION,
      kdsPath: `/kds?t=${encodeURIComponent(getHubOrderToken())}`,
    }));
    return;
  }
  // Página de estado amigable — destino del acceso directo del menú Inicio
  // ("Agente Leogin"): si esta página abre, el agente está vivo.
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(statusPageHtml());
    return;
  }

  // ── KDS local (/kds, /kds/orders, /kds/done) ──────────────────────
  // El token viaja como query (?t=) porque /kds es una NAVEGACIÓN (no un
  // fetch con headers): el panel genera el enlace completo.
  const url = new URL(req.url ?? '/', 'http://hub.local');
  if (url.pathname === '/kds' || url.pathname.startsWith('/kds/')) {
    if (url.searchParams.get('t') !== getHubOrderToken()) {
      res.statusCode = 401;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end('Enlace inválido. Abre la pantalla de respaldo desde el panel (sección Impresión).');
      return;
    }
    if (req.method === 'GET' && url.pathname === '/kds') {
      sendKdsPage(res);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/kds/orders') {
      res.setHeader('content-type', 'application/json');
      res.end(kdsOrdersPayload());
      return;
    }
    if (req.method === 'POST' && url.pathname === '/kds/done') {
      void (async () => {
        try {
          const { clientId } = JSON.parse((await readBody(req)) || '{}') as { clientId?: unknown };
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: kdsMarkDone(clientId) }));
        } catch {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'JSON inválido.' }));
        }
      })();
      return;
    }
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
}

// ── Servidor HTTPS del hub (migración 064) ──────────────────────────────────
// Usa el certificado wildcard que la nube entrega por /api/agent/hub-cert.
// Se puede (re)iniciar en caliente cuando el certificado rota.
let tlsServer: https.Server | null = null;

export function startTlsServer(): void {
  const tls = getHubTls();
  if (!tls) return;
  stopTlsServer();
  try {
    const server = https.createServer({ cert: tls.certPem, key: tls.keyPem }, handleRequest);
    server.once('error', (e: NodeJS.ErrnoException) => {
      logger.warn('Hub HTTPS:', e.message);
      tlsServer = null;
    });
    server.listen(tls.port || TLS_PORT, '0.0.0.0', () => {
      logger.info(`Hub HTTPS escuchando en ${tls.port || TLS_PORT} (${tls.hostname}).`);
    });
    tlsServer = server;
  } catch (e) {
    logger.warn('No se pudo iniciar el hub HTTPS:', (e as Error).message);
  }
}

export function stopTlsServer(): void {
  if (tlsServer) {
    tlsServer.close();
    tlsServer = null;
  }
}

/** Intenta tomar el puerto. true = somos la única instancia; false = ya hay otra. */
export function startLocalServer(): Promise<boolean> {
  return new Promise((resolve) => {
    const server = http.createServer(handleRequest);

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
