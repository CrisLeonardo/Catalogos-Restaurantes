// Empaqueta el agente en un único ejecutable LeoginAgent.exe (Node SEA).
// Pasos: bundle con esbuild → blob SEA → copia node.exe → inyecta con postject
//        → copia la carpeta scripts/ al lado del exe.
//
//   npm run build:exe
//
// Requiere Windows (genera un .exe). El ejecutable resultante NO está firmado:
// Windows SmartScreen puede advertir la primera vez (ver README, fase de firma).

import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { writeFileSync, copyFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

function step(msg) { console.log(`\n▸ ${msg}`); }

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// 1. Bundle a un solo .js (CommonJS) — esbuild quita los tipos de TS.
step('Empaquetando con esbuild…');
await esbuild.build({
  entryPoints: [join(root, 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: join(dist, 'agent.cjs'),
  legalComments: 'none',
});

// 2. Configuración SEA + blob.
step('Generando blob SEA…');
const seaConfig = {
  main: join(dist, 'agent.cjs'),
  output: join(dist, 'sea-prep.blob'),
  disableExperimentalSEAWarning: true,
};
writeFileSync(join(dist, 'sea-config.json'), JSON.stringify(seaConfig));
execFileSync(process.execPath, ['--experimental-sea-config', join(dist, 'sea-config.json')], { stdio: 'inherit' });

// 3. Copia el binario de Node y renómbralo.
step('Creando LeoginAgent.exe…');
const exe = join(dist, 'LeoginAgent.exe');
copyFileSync(process.execPath, exe);

// 4. Inyecta el blob en el exe (postject).
step('Inyectando el código (postject)…');
const postject = join(root, 'node_modules', 'postject', 'dist', 'cli.js');
execFileSync(process.execPath, [postject, exe, 'NODE_SEA_BLOB', join(dist, 'sea-prep.blob'), '--sentinel-fuse', FUSE], { stdio: 'inherit' });

// 5. Copia scripts/ e instalador al lado del exe SOLO como referencia/fallback.
//    El exe ya es AUTOCONTENIDO: lleva los .ps1 incrustados (src/ps-scripts.ts)
//    y se autoinstala al doble clic. Para el cliente basta el ÚNICO archivo
//    LeoginAgent.exe — la carpeta dist/ completa es solo para instalación avanzada.
step('Copiando scripts e instalador (referencia)…');
cpSync(join(root, 'scripts'), join(dist, 'scripts'), { recursive: true });
cpSync(join(root, 'installer'), join(dist, 'installer'), { recursive: true });

console.log(`\n✓ Listo → ${exe}`);
console.log('  Para el cliente: sube SOLO LeoginAgent.exe (es autocontenido y se');
console.log('  autoinstala). El panel lo sirve con el token embebido en el nombre.');
