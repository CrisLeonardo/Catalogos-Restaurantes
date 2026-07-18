/* ============================================================
   HTTPS del hub local — orquestación (patrón Plex).
   ------------------------------------------------------------
   Cada agente recibe un hostname propio (<id-sin-guiones>.hub.<dominio>)
   cuyo registro A apunta a su IP LAN, y todos comparten el certificado
   wildcard emitido en acme.ts. El poll del agente (cada ~3s) llama a
   ensureHubTls(): debe ser BARATO — el trabajo pesado (emisión de
   certificado, sync de DNS) se dispara fire-and-forget con throttles
   en memoria.

   Config (Render / .env.local):
     LEOGIN_HUB_DOMAIN     = hub.leogin.online   (activa todo esto)
     CLOUDFLARE_API_TOKEN  = <token Zone→DNS→Edit de leogin.online>
     LEOGIN_ACME_EMAIL     = opcional (default: contacto de la landing)
     LEOGIN_ACME_DIRECTORY = opcional: 'staging' para pruebas
   ============================================================ */

import { createHash } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { getZoneId, upsertARecord } from './cloudflare';
import { issueWildcardCert } from './acme';

type Db = ReturnType<typeof createServiceClient>;

/** Puerto HTTPS del hub — debe coincidir con TLS_PORT del agente. */
export const HUB_TLS_PORT = 47443;

/** Renovar cuando falten menos de 30 días (Let's Encrypt dura 90). */
const RENEW_BEFORE_MS = 30 * 24 * 60 * 60 * 1000;

export interface HubTlsConfig {
  hubDomain: string;   // hub.leogin.online
  rootDomain: string;  // leogin.online (la zona en Cloudflare)
}

export function hubTlsConfig(): HubTlsConfig | null {
  const hubDomain = process.env.LEOGIN_HUB_DOMAIN?.trim().toLowerCase();
  if (!hubDomain || !process.env.CLOUDFLARE_API_TOKEN) return null;
  return { hubDomain, rootDomain: hubDomain.split('.').slice(-2).join('.') };
}

export function hostnameForAgent(agentId: string, hubDomain: string): string {
  return `${agentId.replace(/-/g, '').toLowerCase()}.${hubDomain}`;
}

export function certSha256(certPem: string): string {
  return createHash('sha256').update(certPem).digest('hex');
}

export interface ActiveHubCert {
  certPem: string;
  keyPem: string;
  expiresAt: string;
  sha256: string;
}

// ── Certificado vigente (cache 5 min — lo consultan el poll y el checkout) ──
let certCache: { value: ActiveHubCert | null; at: number } | null = null;
const CERT_CACHE_MS = 5 * 60_000;

export async function getActiveHubCert(db?: Db): Promise<ActiveHubCert | null> {
  if (certCache && Date.now() - certCache.at < CERT_CACHE_MS) return certCache.value;
  const client = db ?? createServiceClient();
  const { data } = await client
    .from('hub_certificates')
    .select('cert_pem, key_pem, expires_at')
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const value: ActiveHubCert | null = data
    ? {
        certPem: data.cert_pem as string,
        keyPem: data.key_pem as string,
        expiresAt: data.expires_at as string,
        sha256: certSha256(data.cert_pem as string),
      }
    : null;
  certCache = { value, at: Date.now() };
  return value;
}

// ── Renovación (fire-and-forget, con candado y backoff en memoria) ──────────
let renewing = false;
let lastRenewAttempt = 0;
const RENEW_RETRY_MS = 15 * 60_000; // si falló, no reintentar antes de 15 min

function maybeRenewCert(cfg: HubTlsConfig, current: ActiveHubCert | null): void {
  const needs =
    !current || new Date(current.expiresAt).getTime() - Date.now() < RENEW_BEFORE_MS;
  if (!needs || renewing || Date.now() - lastRenewAttempt < RENEW_RETRY_MS) return;
  renewing = true;
  lastRenewAttempt = Date.now();
  void issueWildcardCert(cfg.hubDomain, cfg.rootDomain)
    .then((issued) => {
      certCache = null; // el próximo poll ya anuncia el cert nuevo
      console.log(`[hub-tls] certificado wildcard emitido (expira ${issued.expiresAt}).`);
    })
    .catch((e) => {
      console.error('[hub-tls] fallo al emitir el certificado:', (e as Error).message);
    })
    .finally(() => {
      renewing = false;
    });
}

// ── Sync DNS por agente (fire-and-forget, throttle por agente) ──────────────
const dnsAttemptAt = new Map<string, number>();
const DNS_RETRY_MS = 5 * 60_000;

function maybeSyncDns(
  cfg: HubTlsConfig,
  db: Db,
  agentId: string,
  hostname: string,
  lanIp: string,
  syncedIp: string | null,
): void {
  if (lanIp === syncedIp) return;
  const last = dnsAttemptAt.get(agentId) ?? 0;
  if (Date.now() - last < DNS_RETRY_MS) return;
  dnsAttemptAt.set(agentId, Date.now());
  void (async () => {
    const zoneId = await getZoneId(cfg.rootDomain);
    await upsertARecord(zoneId, hostname, lanIp);
    await db.from('print_agents').update({ hub_dns_synced_ip: lanIp }).eq('id', agentId);
    console.log(`[hub-tls] DNS ${hostname} → ${lanIp}`);
  })().catch((e) => {
    console.error(`[hub-tls] fallo al sincronizar DNS de ${agentId}:`, (e as Error).message);
  });
}

export interface HubTlsAdvertisement {
  hostname: string;
  certSha256: string;
  port: number;
}

/**
 * Llamado en cada poll del agente. Rápido: asigna hostname si falta (una
 * vez), dispara renovación de cert y sync de DNS en segundo plano, y
 * devuelve lo que el agente debe anunciar/comparar.
 */
export async function ensureHubTls(
  db: Db,
  agentId: string,
  row: { hub_hostname: string | null; hub_lan_ip: string | null; hub_dns_synced_ip: string | null } | null,
): Promise<HubTlsAdvertisement | null> {
  const cfg = hubTlsConfig();
  if (!cfg || !row) return null;

  const cert = await getActiveHubCert(db);
  maybeRenewCert(cfg, cert);

  let hostname = row.hub_hostname;
  if (!hostname) {
    hostname = hostnameForAgent(agentId, cfg.hubDomain);
    await db.from('print_agents').update({ hub_hostname: hostname }).eq('id', agentId);
  }

  if (row.hub_lan_ip) {
    maybeSyncDns(cfg, db, agentId, hostname, row.hub_lan_ip, row.hub_dns_synced_ip);
  }

  if (!cert) return null; // aún sin certificado — el agente sigue en HTTP
  return { hostname, certSha256: cert.sha256, port: HUB_TLS_PORT };
}
