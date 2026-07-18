// Publica un release del agente para el auto-update (migración 065).
//
//   1. Toma dist/LeoginAgent.exe (corre `npm run build:exe` antes).
//   2. Calcula su sha256.
//   3. Lo sube como asset de un GitHub Release (tag `agent-v<version>`) del
//      repo del proyecto — gratis y sin límite de 50MB (a diferencia de
//      Supabase Storage en el plan free).
//   4. Inserta la fila en agent_releases con la URL del asset → los agentes
//      del canal lo ven en su próximo chequeo (~1h) y se actualizan solos.
//
// Uso:
//   node scripts/publish-release.mjs [--channel stable|beta] [--notes "..."]
//
// Requiere: `gh` (GitHub CLI) autenticado con permiso de escritura sobre el
// repo (`gh auth status`).
//
// Credenciales de Supabase: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
// del entorno, o de ../plataforma/.env.local (dev). Para publicar a PRODUCCIÓN,
// carga las de producción en un .env.local propio (gitignored) y corre:
//   node --env-file=.env.local scripts/publish-release.mjs

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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

const headers = {
  authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
};

// ── 1. Publicar el exe como asset de un GitHub Release ────────────────
// Repo PÚBLICO dedicado solo a binarios (no el monorepo, que es privado —
// los assets de releases privados no se pueden descargar sin token, y el
// agente hace un fetch() simple sin auth).
const RELEASES_REPO = process.env.GITHUB_RELEASES_REPO ?? 'CrisLeonardo/leogin-agente-releases';
const tag = `agent-v${version}`;
console.log(`  destino: GitHub Release ${RELEASES_REPO}@${tag}`);
{
  const exists = (() => {
    try {
      execFileSync('gh', ['release', 'view', tag, '--repo', RELEASES_REPO], { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  })();

  if (exists) {
    // --clobber: sobrescribe el asset si se re-publica la misma versión.
    execFileSync(
      'gh',
      ['release', 'upload', tag, `${exePath}#LeoginAgent-${version}.exe`, '--repo', RELEASES_REPO, '--clobber'],
      { stdio: 'inherit' },
    );
  } else {
    execFileSync(
      'gh',
      [
        'release', 'create', tag,
        `${exePath}#LeoginAgent-${version}.exe`,
        '--repo', RELEASES_REPO,
        '--title', `Agente de impresión v${version}`,
        '--notes', notes ?? `Release automático del agente de impresión v${version}.`,
      ],
      { stdio: 'inherit' },
    );
  }
  console.log('  ✓ exe subido a GitHub Releases.');
}

const url = execFileSync(
  'gh',
  ['release', 'view', tag, '--repo', RELEASES_REPO, '--json', 'assets', '--jq', '.assets[0].url'],
).toString().trim();
if (!url) {
  console.error('✗ No se pudo obtener la URL de descarga del asset publicado.');
  process.exit(1);
}

// ── 2. Registrar el release ───────────────────────────────────────────
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
