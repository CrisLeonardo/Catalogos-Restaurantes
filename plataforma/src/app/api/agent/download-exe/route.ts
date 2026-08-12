/* ============================================================
   GET /api/agent/download-exe?token=...
   Sirve el instalador del agente para descarga desde el panel admin.

   "Un solo botón": el nombre del archivo lleva el dominio del panel + un
   código corto de un solo uso (migración 066:
   LeoginAgent-<restaurante>~LG2~<dominio>~<código>~.exe). El cliente solo
   hace doble clic — el exe llama a /api/agent/resolve-install para
   resolver el código al token real y se autoinstala, sin copiar/pegar nada
   (ver agente src/setup.ts y src/config.ts). El código expira a las 24h y
   se invalida tras el primer uso.

   Origen del binario:
     - Producción: el último release publicado en GitHub (ver
       lib/agent-updates.ts), o LEOGIN_AGENT_DOWNLOAD_URL si se quiere fijar
       una versión concreta. Se hace proxy del binario para poder renombrarlo
       con el código.
     - Desarrollo: se sirve el exe desde disco si existe.
   ============================================================ */

import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { getAdminContext } from '@/lib/db/admin';
import { createServiceClient } from '@/lib/supabase/service';
import { latestAgentFromGitHub } from '@/lib/agent-updates';

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

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // sin 0/O/1/l/I ambiguos

/** Código corto de un solo uso — se resuelve a apiUrl+token vía /api/agent/resolve-install. */
function randomCode(len = 8): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/** Guarda el token tras un código corto (reintenta si el código ya existía). */
async function createInstallCode(apiUrl: string, token: string): Promise<string> {
  const db = createServiceClient();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const { error } = await db.from('agent_install_codes').insert({ code, api_url: apiUrl, token });
    if (!error) return code;
  }
  throw new Error('No se pudo generar un código de instalación.');
}

/** Prefijo cosmético con el nombre del restaurante (solo legible, no tiene función). */
function sanitizeSlug(slug: string): string {
  return slug
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Construye el nombre con el código embebido, o el genérico si no hay token. */
function installerFilename(host: string, code: string | null, restaurantSlug: string | null): string {
  if (!code) return 'LeoginAgent.exe';
  const prefix = restaurantSlug ? `-${sanitizeSlug(restaurantSlug)}` : '';
  return `LeoginAgent${prefix}~LG2~${host}~${code}~.exe`;
}

export async function GET(req: Request) {
  const ctx = await getAdminContext();
  if (!ctx) {
    return new NextResponse('No autorizado.', { status: 401 });
  }

  const token = new URL(req.url).searchParams.get('token');
  const origin = resolvePublicOrigin(req);
  const code = token ? await createInstallCode(origin, token) : null;
  const host = new URL(origin).host;
  const filename = installerFilename(host, code, ctx.restaurant?.slug ?? null);
  const disposition = `attachment; filename="${filename}"`;

  // Producción: proxy del binario desde el CDN/Release con el nombre personalizado.
  //
  // La variable de entorno es un OVERRIDE explícito (fijar una versión, o
  // servir desde otro CDN). Sin ella se sirve el último release publicado en
  // GitHub — así una versión nueva del agente no obliga a ir a tocar la
  // configuración de Render, que es justo el paso que se olvida.
  const downloadUrl =
    process.env.LEOGIN_AGENT_DOWNLOAD_URL || (await latestAgentFromGitHub())?.url;
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
