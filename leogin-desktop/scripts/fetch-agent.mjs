#!/usr/bin/env node
/* Baja el LeoginAgent.exe del último release `agent-v*` a
   src-tauri/resources/ para que `tauri build` lo empaquete DENTRO del
   instalador (bundle.resources en tauri.conf.json).

   Por qué existe: el agente pesa ~87 MB y no tiene por qué vivir en git.
   Se descarga en cada build y queda ignorado por el repo. El resultado es
   que instalar Leogin Desktop ya trae todo lo necesario para convertir esa
   PC en la principal del local — sin una segunda descarga justo cuando el
   dueño está configurando su restaurante con el WiFi del local.

   Uso:
     node scripts/fetch-agent.mjs            # último release publicado
     node scripts/fetch-agent.mjs --local    # usa ../agente-impresion/dist
     node scripts/fetch-agent.mjs --skip     # no empaqueta agente (dev)

   Si falla, el build NO se rompe: el exe sale sin agente y la app cae al
   camino de siempre (descargarlo de GitHub al pulsar el interruptor). */

import { mkdirSync, copyFileSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RESOURCES = join(ROOT, 'src-tauri', 'resources');
const EXE = join(RESOURCES, 'LeoginAgent.exe');
const VERSION_FILE = join(RESOURCES, 'agent-version.txt');
const RELEASES = 'https://api.github.com/repos/CrisLeonardo/leogin-agente-releases/releases';

const args = new Set(process.argv.slice(2));

function clean() {
  rmSync(EXE, { force: true });
  rmSync(VERSION_FILE, { force: true });
}

async function fromGitHub() {
  const res = await fetch(RELEASES, {
    headers: {
      accept: 'application/vnd.github+json',
      ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub respondió HTTP ${res.status}`);

  const releases = await res.json();
  const rel = releases.find((r) => !r.draft && r.tag_name.startsWith('agent-v'));
  if (!rel) throw new Error('No hay ningún release agent-v* publicado.');

  const asset = rel.assets.find((a) => a.name.toLowerCase().endsWith('.exe'));
  if (!asset) throw new Error(`El release ${rel.tag_name} no trae ningún .exe.`);

  const version = rel.tag_name.replace(/^agent-v/, '');
  console.log(`· Descargando agente v${version} (${(asset.size / 1e6).toFixed(1)} MB)…`);

  const bin = await fetch(asset.browser_download_url);
  if (!bin.ok) throw new Error(`La descarga respondió HTTP ${bin.status}`);
  await writeFile(EXE, Buffer.from(await bin.arrayBuffer()));
  return version;
}

function fromLocalDist() {
  const src = join(ROOT, '..', 'agente-impresion', 'dist', 'LeoginAgent.exe');
  if (!existsSync(src)) throw new Error(`No existe ${src} — corre "npm run build:exe" en agente-impresion.`);
  copyFileSync(src, EXE);
  const pkg = JSON.parse(readFileSync(join(ROOT, '..', 'agente-impresion', 'package.json'), 'utf8'));
  return pkg.version;
}

async function main() {
  mkdirSync(RESOURCES, { recursive: true });

  if (args.has('--skip')) {
    clean();
    console.log('· Agente NO empaquetado (--skip): la app lo descargará al vincular.');
    return;
  }

  try {
    const version = args.has('--local') ? fromLocalDist() : await fromGitHub();
    writeFileSync(VERSION_FILE, `${version}\n`, 'utf8');
    console.log(`✓ Agente v${version} listo para empaquetarse.`);
  } catch (e) {
    clean();
    console.warn(`⚠ No se pudo preparar el agente: ${e.message}`);
    console.warn('  El instalador saldrá SIN el agente incluido; la app lo bajará de GitHub al vincular.');
  }
}

await main();
