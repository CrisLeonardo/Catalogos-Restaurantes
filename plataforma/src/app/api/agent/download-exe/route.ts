/* ============================================================
   GET /api/agent/download-exe
   Sirve LeoginAgent.exe para descarga desde el panel admin.
   En producción redirige a LEOGIN_AGENT_DOWNLOAD_URL (GitHub Releases u otro CDN).
   En desarrollo sirve el exe desde disco si existe.
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

export async function GET() {
  const ctx = await getAdminContext();
  if (!ctx) {
    return new NextResponse('No autorizado.', { status: 401 });
  }

  // Producción: redirige a la URL configurada (GitHub Releases, CDN, etc.)
  const downloadUrl = process.env.LEOGIN_AGENT_DOWNLOAD_URL;
  if (downloadUrl) {
    return NextResponse.redirect(downloadUrl, { status: 302 });
  }

  // Desarrollo: intenta servir el exe desde disco.
  const exePath = EXE_CANDIDATES.find((p) => existsSync(p));
  if (!exePath) {
    return new NextResponse(
      'LeoginAgent.exe no disponible. Configura la variable de entorno ' +
      'LEOGIN_AGENT_DOWNLOAD_URL apuntando a la URL de descarga del agente.',
      { status: 404 },
    );
  }

  const buffer = await readFile(exePath);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="LeoginAgent.exe"',
      'Content-Length': String(buffer.byteLength),
    },
  });
}
