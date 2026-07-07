// Publica un release del agente para el auto-update (migración 065).
//
//   1. Toma dist/LeoginAgent.exe (corre `npm run build:exe` antes).
//   2. Calcula su sha256.
//   3. Lo sube a Supabase Storage (bucket público `agent-releases`).
//   4. Inserta la fila en agent_releases → los agentes del canal lo ven en
//      su próximo chequeo (~1h) y se actualizan solos.
//
// Uso:
//   node scripts/publish-release.mjs [--channel stable|beta] [--notes "..."]
//
// Credenciales: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY del
// entorno, o de ../plataforma/.env.local (dev). Para publicar a PRODUCCIÓN,
// exporta las de producción antes de correr:
//   $env:NEXT_PUBLIC_SUPABASE_URL = "https://xxxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "..."
//   npm run release

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Args ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const channel = argOf('--channel', 'stable');
const notes = argOf('--notes', null);
if (!['stable', 'beta'].includes(channel)) {
  console.error(`✗ Canal inválido: ${channel} (usa stable o beta).`);
  process.exit(1);
}

// ── Credenciales (env o ../plataforma/.env.local) ────────────────────
function loadEnvLocal() {
  try {
    const raw = readFileSync(join(ROOT, '..', 'plataforma', '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      if (!(k in process.env)) process.env[k] = t.slice(eq + 1).trim();
    }
  } catch { /* sin .env.local: solo variables del sistema */ }
}
loadEnvLocal();

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('✗ Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

// ── Versión (única fuente: src/version.ts) y binario ─────────────────
const versionSrc = readFileSync(join(ROOT, 'src', 'version.ts'), 'utf8');
const version = versionSrc.match(/AGENT_VERSION\s*=\s*'([^']+)'/)?.[1];
if (!version) {
  console.error('✗ No se pudo leer AGENT_VERSION de src/version.ts');
  process.exit(1);
}

const exePath = join(ROOT, 'dist', 'LeoginAgent.exe');
if (!existsSync(exePath)) {
  console.error('✗ No existe dist/LeoginAgent.exe — corre `npm run build:exe` primero.');
  process.exit(1);
}
const bytes = readFileSync(exePath);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const objectPath = `LeoginAgent-${version}.exe`;

console.log(`Publicando v${version} (${(bytes.length / 1024 / 1024).toFixed(1)} MB, canal ${channel})`);
console.log(`  sha256: ${sha256}`);
console.log(`  destino: ${SUPABASE_URL} → agent-releases/${objectPath}`);

const headers = {
  authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
};

// ── 1. Bucket público (idempotente) ──────────────────────────────────
{
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'agent-releases', name: 'agent-releases', public: true }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (!/already exists|Duplicate/i.test(body)) {
      console.error('✗ No se pudo crear el bucket:', body);
      process.exit(1);
    }
  } else {
    console.log('  bucket agent-releases creado.');
  }
}

// ── 2. Subir el exe (upsert por si se re-publica la misma versión) ────
{
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/agent-releases/${objectPath}`, {
    method: 'POST',
    headers: {
      ...headers,
      'content-type': 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: bytes,
  });
  if (!res.ok) {
    console.error('✗ Fallo la subida:', await res.text());
    process.exit(1);
  }
  console.log('  ✓ exe subido.');
}

const url = `${SUPABASE_URL}/storage/v1/object/public/agent-releases/${objectPath}`;

// ── 3. Registrar el release ───────────────────────────────────────────
{
  const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_releases`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json', prefer: 'return=representation' },
    body: JSON.stringify({ version, channel, url, sha256, notes }),
  });
  if (!res.ok) {
    console.error('✗ No se pudo registrar el release:', await res.text());
    process.exit(1);
  }
  console.log('  ✓ release registrado.');
}

console.log(`\n✓ v${version} publicada en el canal "${channel}".`);
console.log('  Los agentes la instalarán solos en su próximo chequeo (~1 h).');
console.log('  Kill switch: UPDATE agent_releases SET enabled=false WHERE version=\'' + version + "';");
