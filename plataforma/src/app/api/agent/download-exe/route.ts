/* ============================================================
   GET /api/agent/download-exe
   Sirve LeoginAgent.exe para descarga desde el panel admin.
   Solo accesible para admins autenticados.
   ============================================================ */

import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { getAdminContext } from '@/lib/db/admin';

export const runtime = 'nodejs';

// Rutas donde puede estar el exe (desarrollo y producción).
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

  const exePath = EXE_CANDIDATES.find((p) => existsSync(p));
  if (!exePath) {
    return new NextResponse(
      'LeoginAgent.exe no encontrado en el servidor. ' +
      'Configura la variable de entorno LEOGIN_AGENT_EXE_PATH o contacta al soporte.',
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
