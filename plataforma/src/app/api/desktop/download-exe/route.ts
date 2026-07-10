/* ============================================================
   GET /api/desktop/download-exe
   Sirve el instalador de Leogin Desktop (leogin-desktop/, el shell
   instalable — distinto del Agente de impresión).

   A diferencia de /api/agent/download-exe, este instalador es genérico
   (no lleva token ni código de restaurante embebido): la app pregunta
   la dirección del panel la primera vez que abre. Por eso no hace
   falta generar nada por restaurante — solo proxear el binario.

   Público a propósito (sin getAdminContext()): el release de GitHub del
   que sale el binario YA es público (repo público de binarios, ver
   publish-release.mjs), así que exigir sesión aquí no protegía nada, solo
   le ponía fricción a quien quiere instalar la app ANTES de tener sesión
   (el caso de /descargas, la página pública en leogin.online). Lo usan
   ambos puntos de entrada: /admin/escritorio (con sesión) y /descargas
   (sin sesión) — mismo endpoint, misma versión siempre vigente.

   Origen del binario:
     - Se resuelve SIEMPRE la versión vigente desde el manifest rodante
       del auto-updater (`desktop-latest/latest.json`, mismo release
       público que consultan las apps ya instaladas) — así este botón
       nunca queda apuntando a una versión vieja cuando se publica una
       nueva, sin tocar código ni variables de entorno.
     - `LEOGIN_DESKTOP_MANIFEST_URL` permite apuntar a otro manifest
       (staging, fork) si algún día hace falta.
     - Desarrollo: si `LEOGIN_DESKTOP_EXE_PATH` apunta a un .exe en
       disco, se sirve directo (sin salir a internet).
   ============================================================ */

import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

export const runtime = 'nodejs';

const DEFAULT_MANIFEST_URL =
  'https://github.com/CrisLeonardo/leogin-agente-releases/releases/download/desktop-latest/latest.json';

interface UpdaterManifest {
  version?: string;
  platforms?: { 'windows-x86_64'?: { url?: string } };
}

export async function GET() {
  // Desarrollo: exe local sin salir a internet.
  const localPath = process.env.LEOGIN_DESKTOP_EXE_PATH;
  if (localPath && existsSync(localPath)) {
    const buffer = await readFile(localPath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="Leogin-Desktop-Setup.exe"',
        'Content-Length': String(buffer.byteLength),
      },
    });
  }

  const manifestUrl = process.env.LEOGIN_DESKTOP_MANIFEST_URL ?? DEFAULT_MANIFEST_URL;
  let manifest: UpdaterManifest;
  try {
    const res = await fetch(manifestUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    manifest = (await res.json()) as UpdaterManifest;
  } catch {
    return new NextResponse(
      'No se pudo consultar la versión más reciente de Leogin Desktop. Intenta de nuevo en unos minutos.',
      { status: 502 },
    );
  }

  const exeUrl = manifest.platforms?.['windows-x86_64']?.url;
  if (!exeUrl) {
    return new NextResponse('El instalador de Leogin Desktop no está disponible en este momento.', { status: 502 });
  }

  const upstream = await fetch(exeUrl);
  if (!upstream.ok || !upstream.body) {
    return new NextResponse('No se pudo descargar el instalador de Leogin Desktop.', { status: 502 });
  }

  const version = manifest.version ? `-v${manifest.version}` : '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="Leogin-Desktop-Setup${version}.exe"`,
  };
  const len = upstream.headers.get('content-length');
  if (len) headers['Content-Length'] = len;

  return new NextResponse(upstream.body, { status: 200, headers });
}
