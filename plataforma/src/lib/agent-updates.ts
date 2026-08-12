/* ============================================================
   DE DÓNDE SALE "LA ÚLTIMA VERSIÓN DEL AGENTE"
   ------------------------------------------------------------
   Hasta ahora el auto-update del agente (migración 065) dependía de una fila
   escrita a mano en `agent_releases` con la clave de servicio de producción.
   Publicar el .exe en GitHub no bastaba: si a alguien se le olvidaba el
   INSERT, los agentes del campo se quedaban en la versión vieja para siempre
   y nadie se enteraba.

   Leogin Desktop nunca tuvo ese problema porque pregunta directamente a la
   API de GitHub (`latest_agent_release` en leogin-desktop/src-tauri/src/main.rs).
   Esto es lo mismo para el agente: la nube lee el release más nuevo de
   `agent-v*` y lo sirve, con dos condiciones que no se negocian:

   · **Sin hash no se sirve.** El agente verifica el sha256 antes de
     intercambiarse (updater.ts); servirle un release sin hash sería pedirle
     que ejecute lo que baje. GitHub publica el digest del asset
     (`assets[].digest = "sha256:…"`), así que el hash sale de la misma
     respuesta firmada por GitHub y no de nadie más.
   · **El interruptor de emergencia manda.** Si en `agent_releases` hay una
     fila de esa versión con `enabled = false`, GitHub NO la resucita — ese
     es el rollback cuando un release sale malo (ver 065).

   La fila en `agent_releases` sigue existiendo y sigue ganando cuando está:
   esto solo cubre el hueco de "está publicado en GitHub pero nadie lo
   registró".
   ============================================================ */

export interface AgentRelease {
  version: string;
  url: string;
  sha256: string;
  notes?: string | null;
}

/** Lo que ya se sabe de una versión en `agent_releases` (para el kill switch). */
export interface KnownRelease {
  version: string;
  enabled: boolean;
}

/** true si `candidate` es estrictamente mayor que `current` (x.y.z numérico).
    Misma semántica que isNewerVersion en agente-impresion/src/updater.ts. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = candidate.split('.').map((n) => parseInt(n, 10) || 0);
  const b = current.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

export type ReleaseChoice = {
  release: AgentRelease | null;
  /** 'github' = descubierto, conviene registrarlo en agent_releases. */
  source: 'db' | 'github' | 'none';
};

/**
 * Qué release se le sirve al agente. Función pura: es la parte que decide, y
 * la que hay que poder probar sin red ni base de datos.
 */
export function pickAgentRelease(
  fromDb: AgentRelease | null,
  fromGitHub: AgentRelease | null,
  known: KnownRelease[] = [],
): ReleaseChoice {
  if (!fromGitHub) return { release: fromDb, source: fromDb ? 'db' : 'none' };

  // Kill switch: una versión apagada a mano no vuelve por la puerta de atrás.
  const row = known.find((k) => k.version === fromGitHub.version);
  if (row && !row.enabled) return { release: fromDb, source: fromDb ? 'db' : 'none' };

  if (!fromDb) return { release: fromGitHub, source: 'github' };
  return isNewerVersion(fromGitHub.version, fromDb.version)
    ? { release: fromGitHub, source: 'github' }
    : { release: fromDb, source: 'db' };
}

/* ── Lectura de la API de GitHub ────────────────────────────── */

interface GhAsset { name?: string; digest?: string | null; browser_download_url?: string }
interface GhRelease {
  tag_name?: string;
  draft?: boolean;
  prerelease?: boolean;
  body?: string | null;
  assets?: GhAsset[];
}

/**
 * Convierte la lista de releases de GitHub en el agente más nuevo publicado.
 * Pura y exportada: el formato de GitHub es lo que más fácil cambia de sitio,
 * así que conviene tenerlo fijado en una prueba.
 */
export function pickFromGitHubFeed(feed: unknown): AgentRelease | null {
  if (!Array.isArray(feed)) return null;
  let best: AgentRelease | null = null;

  for (const raw of feed as GhRelease[]) {
    const tag = typeof raw?.tag_name === 'string' ? raw.tag_name : '';
    if (!tag.startsWith('agent-v') || raw.draft || raw.prerelease) continue;
    const version = tag.slice('agent-v'.length).trim();
    if (!/^\d+(\.\d+)*$/.test(version)) continue;

    const asset = (raw.assets ?? []).find(
      (a) => typeof a?.name === 'string' && a.name.toLowerCase().endsWith('.exe'),
    );
    const digest = typeof asset?.digest === 'string' ? asset.digest : '';
    const sha256 = digest.startsWith('sha256:') ? digest.slice('sha256:'.length) : '';
    // Sin hash no hay actualización: el agente la rechazaría igual, y servirla
    // sería enseñarle a bajar binarios sin verificar.
    if (!asset?.browser_download_url || !/^[a-f0-9]{64}$/i.test(sha256)) continue;

    const candidate: AgentRelease = {
      version,
      url: asset.browser_download_url,
      sha256: sha256.toLowerCase(),
      notes: typeof raw.body === 'string' && raw.body.trim() ? raw.body.trim().slice(0, 500) : null,
    };
    if (!best || isNewerVersion(candidate.version, best.version)) best = candidate;
  }
  return best;
}

const RELEASES_REPO = process.env.GITHUB_RELEASES_REPO ?? 'CrisLeonardo/leogin-agente-releases';
const FEED_URL = `https://api.github.com/repos/${RELEASES_REPO}/releases?per_page=20`;
/** La API sin autenticar da 60 peticiones/hora POR IP, y todos los agentes
    salen por la misma IP de Render. Con 15 min de caché son 4 a la hora. */
const TTL_MS = 15 * 60_000;

let cache: { at: number; value: AgentRelease | null } | null = null;

/**
 * El agente más nuevo publicado en GitHub. Best-effort absoluto: si GitHub no
 * responde devuelve null y quien llama se queda con lo que diga la base — el
 * camino de actualización nunca debe romperse por un tercero.
 */
export async function latestAgentFromGitHub(): Promise<AgentRelease | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const res = await fetch(FEED_URL, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'leogin-platform',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`GitHub respondió HTTP ${res.status}`);
    const value = pickFromGitHubFeed(await res.json());
    cache = { at: Date.now(), value };
    return value;
  } catch (e) {
    console.error('[agent-updates] no se pudo leer los releases de GitHub:', (e as Error).message);
    // Caché negativa corta: si GitHub está caído no conviene insistir en cada
    // poll de cada agente.
    cache = { at: Date.now() - TTL_MS + 60_000, value: cache?.value ?? null };
    return cache.value;
  }
}
