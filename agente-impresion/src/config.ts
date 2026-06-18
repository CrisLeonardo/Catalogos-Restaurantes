// Configuración del agente. Lee de variables de entorno o de un archivo
// config.local.json (junto al .exe en producción, o en la carpeta del agente en
// dev). El agente solo necesita la URL de tu API y su token — ninguna llave de
// base de datos vive aquí.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface AgentConfig {
  apiUrl: string;
  token: string;
  pollMs: number;
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
