// Publica un release de Leogin Desktop para el auto-update (Tauri updater).
//
// Modelo (mismo repo público de binarios que el agente, tags separados):
//   - Tag desktop-v<version>  → assets: Leogin_<v>_x64-setup.exe (+ .sig)
//   - Tag desktop-latest      → asset:  latest.json (RODANTE: se sobrescribe
//     en cada publicación; es el endpoint fijo que consulta el updater de la
//     app — ver plugins.updater.endpoints en src-tauri/tauri.conf.json).
//
//   No se usa "releases/latest" de GitHub porque el repo mezcla releases del
//   agente (agent-v*) y del escritorio (desktop-v*): el tag rodante hace de
//   "latest" solo para el escritorio.
//
// Uso:
//   npm run build      (con TAURI_SIGNING_PRIVATE_KEY apuntando a la llave
//                       de %USERPROFILE%\.tauri\leogin-desktop.key y
//                       TAURI_SIGNING_PRIVATE_KEY_PASSWORD con el contenido
//                       de leogin-desktop.key.pass — OJO: el sufijo _PATH no
//                       existe en Tauri v2; con él la CLI ignora la llave y
//                       el bundle sale SIN .sig, comprobado 2026-07-11)
//   npm run release -- [--notes "qué cambió"]
//
// Requiere: `gh` (GitHub CLI) autenticado con escritura sobre el repo.
// A diferencia del agente, aquí NO interviene Supabase: el ciclo de update
// del escritorio vive completo en GitHub Releases.

import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const RELEASES_REPO = process.env.GITHUB_RELEASES_REPO ?? 'CrisLeonardo/leogin-agente-releases';

// ── Args ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const notes = argOf('--notes', null);

// ── Versión (única fuente: tauri.conf.json) y artefactos del build ────
const conf = JSON.parse(readFileSync(join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const version = conf.version;
if (!version) {
  console.error('✗ No se pudo leer la versión de src-tauri/tauri.conf.json');
  process.exit(1);
}

const bundleDir = join(ROOT, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const exeName = `Leogin_${version}_x64-setup.exe`;
const exePath = join(bundleDir, exeName);
const sigPath = `${exePath}.sig`;

if (!existsSync(exePath)) {
  console.error(`✗ No existe ${exePath} — corre \`npm run build\` primero.`);
  process.exit(1);
}
if (!existsSync(sigPath)) {
  console.error(
    `✗ No existe ${sigPath} — el build corrió SIN la llave del updater.\n` +
      '  Define TAURI_SIGNING_PRIVATE_KEY=%USERPROFILE%\\.tauri\\leogin-desktop.key (y\n' +
      '  TAURI_SIGNING_PRIVATE_KEY_PASSWORD con el contenido del .key.pass) y recompila.',
  );
  process.exit(1);
}
const signature = readFileSync(sigPath, 'utf8').trim();
const sizeMb = (readFileSync(exePath).length / 1024 / 1024).toFixed(1);

const tag = `desktop-v${version}`;
console.log(`Publicando Leogin Desktop v${version} (${sizeMb} MB)`);
console.log(`  destino: GitHub Release ${RELEASES_REPO}@${tag}`);

// Con stdio:'inherit' execFileSync devuelve null — no hay stdout que capturar.
const gh = (ghArgs, opts = {}) => {
  const out = execFileSync('gh', ghArgs, { stdio: 'pipe', ...opts });
  return out ? out.toString() : '';
};
const releaseExists = (t) => {
  try {
    gh(['release', 'view', t, '--repo', RELEASES_REPO]);
    return true;
  } catch {
    return false;
  }
};

// ── 1. Release versionado con el instalador (+ .sig de referencia) ────
if (releaseExists(tag)) {
  gh(['release', 'upload', tag, exePath, sigPath, '--repo', RELEASES_REPO, '--clobber'], { stdio: 'inherit' });
} else {
  gh(
    [
      'release', 'create', tag,
      exePath, sigPath,
      '--repo', RELEASES_REPO,
      '--title', `Leogin Desktop v${version}`,
      '--notes', notes ?? `Release de Leogin para escritorio v${version}.`,
      '--latest=false',
    ],
    { stdio: 'inherit' },
  );
}
console.log('  ✓ instalador subido.');

// ── 2. Manifest del updater (formato del plugin updater de Tauri v2) ──
const manifest = {
  version,
  notes: notes ?? `Leogin para escritorio v${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature,
      url: `https://github.com/${RELEASES_REPO}/releases/download/${tag}/${exeName}`,
    },
  },
};
const tmp = mkdtempSync(join(tmpdir(), 'leogin-desktop-'));
const manifestPath = join(tmp, 'latest.json');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// ── 3. Tag rodante desktop-latest (endpoint fijo del updater) ─────────
if (!releaseExists('desktop-latest')) {
  gh(
    [
      'release', 'create', 'desktop-latest',
      '--repo', RELEASES_REPO,
      '--title', 'Leogin Desktop — canal estable',
      '--notes',
      'Release RODANTE: su asset latest.json siempre apunta a la última versión de Leogin Desktop. ' +
        'Es el endpoint del auto-update de la app; no descargues desde aquí — usa el release desktop-v* más reciente.',
      '--latest=false',
    ],
    { stdio: 'inherit' },
  );
}
gh(['release', 'upload', 'desktop-latest', manifestPath, '--repo', RELEASES_REPO, '--clobber'], { stdio: 'inherit' });
console.log('  ✓ latest.json actualizado (canal estable).');

console.log(`\n✓ Leogin Desktop v${version} publicada.`);
console.log('  Las apps instaladas la descargarán solas en su próximo chequeo (~1 h)');
console.log('  y mostrarán el toast "Reiniciar ahora" — nada se instala sin ese clic.');
console.log('  Rollback: vuelve a correr este script desde el commit de la versión anterior');
console.log('  (regenera latest.json apuntando a la versión previa).');
