// Configuración del agente. Lee de variables de entorno o de un archivo
// config.local.json (junto al .exe en producción, o en la carpeta del agente en
// dev). El agente solo necesita la URL de tu API y su token — ninguna llave de
// base de datos vive aquí.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';

export interface AgentConfig {
  apiUrl: string;
  token: string;
  pollMs: number;
}

export interface InstallParams {
  apiUrl: string;
  token: string;
}

// Esquema NUEVO (v0.6+, migración 066): el nombre solo lleva el dominio del
// panel + un código corto de un solo uso — el token real se resuelve con una
// llamada a /api/agent/resolve-install en el momento de instalar:
//   LeoginAgent-<restaurante>~LG2~<dominio>~<código>~.exe
const FILENAME_MARKER_V2 = /~LG2~([a-zA-Z0-9.-]+)~([A-Za-z0-9]+)~/;

// Esquema VIEJO (hasta v0.5.x): URL + token embebidos en base64 directo en el
// nombre — se mantiene por compatibilidad con instaladores ya descargados:
//   LeoginAgent~LG1~<base64url({"u":apiUrl,"t":token})>~.exe
const FILENAME_MARKER_V1 = /~LG1~([A-Za-z0-9_-]+)~/;

function extractInstallParamsV1(execPath: string): InstallParams | null {
  const match = basename(execPath).match(FILENAME_MARKER_V1);
  if (!match) return null;
  try {
    const b64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(b64, 'base64').toString('utf8');
    const obj = JSON.parse(json) as { u?: unknown; t?: unknown };
    if (typeof obj.u === 'string' && typeof obj.t === 'string' && obj.u && obj.t) {
      return { apiUrl: obj.u.replace(/\/+$/, ''), token: obj.t };
    }
  } catch {
    /* nombre malformado → se ignora */
  }
  return null;
}

/**
 * Lee los parámetros de instalación (apiUrl + token) a partir del nombre del
 * propio ejecutable: intenta el esquema nuevo (código corto → resuelto contra
 * el panel) y cae al viejo (base64 directo) por compatibilidad. Devuelve null
 * si el nombre no trae ninguno (ej. ya instalado o corriendo en desarrollo).
 */
export async function resolveInstallParams(execPath = process.execPath): Promise<InstallParams | null> {
  const matchV2 = basename(execPath).match(FILENAME_MARKER_V2);
  if (matchV2) {
    const apiUrl = `https://${matchV2[1]}`;
    const code = matchV2[2];
    try {
      const res = await fetch(`${apiUrl}/api/agent/resolve-install?code=${encodeURIComponent(code)}`);
      if (res.ok) {
        const data = (await res.json()) as { token?: string };
        if (data.token) return { apiUrl, token: data.token };
      }
    } catch {
      /* sin red al momento de instalar → cae al esquema viejo / otros planes */
    }
  }
  return extractInstallParamsV1(execPath);
}

interface FileConfig {
  apiUrl?: string;
  token?: string;
  pollMs?: number;
}

function readFileConfig(): FileConfig {
  const candidates = [
    join(dirname(process.execPath), 'config.local.json'), // empaquetado: junto al exe
    join(process.cwd(), 'config.local.json'),             // dev / cwd
    join(process.cwd(), 'agente-impresion', 'config.local.json'),
  ];
  for (const path of candidates) {
    try {
      if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')) as FileConfig;
    } catch {
      /* archivo inválido → se ignora y se intenta el siguiente */
    }
  }
  return {};
}

export function loadConfig(): AgentConfig {
  const file = readFileConfig();

  const apiUrl = (process.env.LEOGIN_API_URL ?? file.apiUrl ?? '').trim();
  const token = (process.env.LEOGIN_AGENT_TOKEN ?? file.token ?? '').trim();
  const pollRaw = process.env.LEOGIN_POLL_MS ?? (file.pollMs != null ? String(file.pollMs) : '');
  const pollMs = Number(pollRaw) || 3000;

  if (!apiUrl || !token) {
    throw new Error(
      'Falta configuración. Define LEOGIN_API_URL y LEOGIN_AGENT_TOKEN ' +
        '(o crea config.local.json con { "apiUrl": "...", "token": "..." }).',
    );
  }

  return { apiUrl: apiUrl.replace(/\/+$/, ''), token, pollMs };
}
