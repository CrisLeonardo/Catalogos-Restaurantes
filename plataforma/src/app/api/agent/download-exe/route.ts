/* ============================================================
   GET /api/agent/download-exe?token=...
   Sirve el instalador del agente para descarga desde el panel admin.

   "Un solo botón": el token + la URL del panel viajan EMBEBIDOS en el nombre
   del archivo (LeoginAgent~LG1~<base64url>~.exe). Así el cliente solo hace
   doble clic — el exe se autoinstala sin copiar/pegar nada (ver agente
   src/setup.ts).

   Origen del binario:
     - Producción: LEOGIN_AGENT_DOWNLOAD_URL (GitHub Releases / CDN). Se hace
       proxy del binario para poder renombrarlo con el token.
     - Desarrollo: se sirve el exe desde disco si existe.
   ============================================================ */

import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { getAdminContext } from '@/lib/db/admin';

export const runtime = 'nodejs';

// Rutas donde buscar el exe en desarrollo local.
const EXE_CANDIDATES = [
  process.env.LEOGIN_AGENT_EXE_PATH,
  path.resolve(process.cwd(), '..', 'agente-impresion', 'dist', 'LeoginAgent.exe'),
  path.resolve(process.cwd(), 'agent', 'LeoginAgent.exe'),
  path.resolve(process.cwd(), 'public', 'agent-installer', 'LeoginAgent.exe'),
].filter(Boolean) as string[];

/** URL pública del panel (la que el agente consultará). */
function resolvePublicOrigin(req: Request): string {
  if (process.env.LEOGIN_PUBLIC_URL) return process.env.LEOGIN_PUBLIC_URL.replace(/\/+$/, '');
  const url = new URL(req.url);
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
  return `${proto}://${host}`.replace(/\/+$/, '');
}

/** Construye el nombre con el token embebido, o el genérico si no hay token. */
function installerFilename(origin: string, token: string | null): string {
  if (!token) return 'LeoginAgent.exe';
  const payload = Buffer.from(JSON.stringify({ u: origin, t: token }), 'utf8').toString('base64url');
  return `LeoginAgent~LG1~${payload}~.exe`;
}

export async function GET(req: Request) {
  const ctx = await getAdminContext();
  if (!ctx) {
    return new NextResponse('No autorizado.', { status: 401 });
  }

  const token = new URL(req.url).searchParams.get('token');
  const origin = resolvePublicOrigin(req);
  const filename = installerFilename(origin, token);
  const disposition = `attachment; filename="${filename}"`;

  // Producción: proxy del binario desde el CDN/Release con el nombre personalizado.
  const downloadUrl = process.env.LEOGIN_AGENT_DOWNLOAD_URL;
  if (downloadUrl) {
    const upstream = await fetch(downloadUrl);
    if (!upstream.ok || !upstream.body) {
      return new NextResponse('No se pudo obtener el instalador del agente.', { status: 502 });
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': disposition,
    };
    const len = upstream.headers.get('content-length');
    if (len) headers['Content-Length'] = len;
    return new NextResponse(upstream.body, { status: 200, headers });
  }

  // Desarrollo: sirve el exe desde disco.
  const exePath = EXE_CANDIDATES.find((p) => existsSync(p));
  if (!exePath) {
    return new NextResponse(
      'LeoginAgent.exe no disponible. Configura LEOGIN_AGENT_DOWNLOAD_URL ' +
        'apuntando a la URL de descarga del agente.',
      { status: 404 },
    );
  }

  const buffer = await readFile(exePath);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': disposition,
      'Content-Length': String(buffer.byteLength),
    },
  });
}
