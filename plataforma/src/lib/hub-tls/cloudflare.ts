/* ============================================================
   Cliente mínimo de la API de Cloudflare (solo DNS).
   ------------------------------------------------------------
   Lo usa la capa hub-tls para: (1) publicar el reto TXT del
   desafío ACME DNS-01, y (2) mantener el registro A de cada hub
   (<id>.hub.<dominio> → IP LAN del restaurante).

   Requiere CLOUDFLARE_API_TOKEN con permiso "Zone → DNS → Edit"
   sobre la zona del dominio raíz (ver GUIA_CLOUDFLARE.md).
   ============================================================ */

const API = 'https://api.cloudflare.com/client/v4';

interface CfRecord {
  id: string;
  type: string;
  name: string;
  content: string;
}

function apiToken(): string {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!token) throw new Error('Falta CLOUDFLARE_API_TOKEN en el entorno.');
  return token;
}

async function cf<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiToken()}`,
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json()) as { success: boolean; result: T; errors?: { message: string }[] };
  if (!res.ok || !body.success) {
    throw new Error(`Cloudflare ${path}: ${body.errors?.[0]?.message ?? `HTTP ${res.status}`}`);
  }
  return body.result;
}

/** El id de zona se resuelve una vez por dominio raíz y se cachea en memoria. */
const zoneCache = new Map<string, string>();

export async function getZoneId(rootDomain: string): Promise<string> {
  const cached = zoneCache.get(rootDomain);
  if (cached) return cached;
  const zones = await cf<{ id: string; name: string }[]>(`/zones?name=${encodeURIComponent(rootDomain)}`);
  const zone = zones[0];
  if (!zone) throw new Error(`La zona ${rootDomain} no existe en esta cuenta de Cloudflare.`);
  zoneCache.set(rootDomain, zone.id);
  return zone.id;
}

async function findRecords(zoneId: string, type: string, name: string): Promise<CfRecord[]> {
  return cf<CfRecord[]>(`/zones/${zoneId}/dns_records?type=${type}&name=${encodeURIComponent(name)}&per_page=100`);
}

/** Crea/actualiza un registro A (DNS only — apunta a IP privada, el proxy no aplica). */
export async function upsertARecord(zoneId: string, name: string, ip: string): Promise<void> {
  const existing = await findRecords(zoneId, 'A', name);
  const payload = { type: 'A', name, content: ip, ttl: 3600, proxied: false };
  if (existing[0]) {
    if (existing[0].content === ip) return;
    await cf(`/zones/${zoneId}/dns_records/${existing[0].id}`, { method: 'PUT', body: JSON.stringify(payload) });
  } else {
    await cf(`/zones/${zoneId}/dns_records`, { method: 'POST', body: JSON.stringify(payload) });
  }
}

/** Publica el TXT del reto ACME (reemplaza cualquier valor previo del mismo nombre). */
export async function setTxtRecord(zoneId: string, name: string, value: string): Promise<void> {
  const existing = await findRecords(zoneId, 'TXT', name);
  for (const rec of existing) {
    await cf(`/zones/${zoneId}/dns_records/${rec.id}`, { method: 'DELETE' });
  }
  await cf(`/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify({ type: 'TXT', name, content: value, ttl: 60 }),
  });
}

export async function deleteTxtRecord(zoneId: string, name: string): Promise<void> {
  const existing = await findRecords(zoneId, 'TXT', name);
  for (const rec of existing) {
    await cf(`/zones/${zoneId}/dns_records/${rec.id}`, { method: 'DELETE' });
  }
}
