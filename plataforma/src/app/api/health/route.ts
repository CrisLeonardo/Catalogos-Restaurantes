/**
 * Ping de conectividad para el modo offline (hook useOnline).
 * `navigator.onLine` devuelve true con WiFi sin internet — este endpoint es
 * la verdad: si responde, hay camino real hasta el servidor.
 */
export const runtime = 'nodejs';

export async function GET() {
  return new Response('ok', {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain',
    },
  });
}
