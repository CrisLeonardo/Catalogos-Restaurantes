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
import { writeFileSync, readFileSync, copyFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

// Runtime PINEADO del ejecutable: Node 22 LTS oficial, descargado y cacheado.
// Dos motivos: (1) builds reproducibles — el exe no depende de qué Node tenga
// instalada la máquina que compila; (2) postject (LIEF/WASM) muere con
// "Fatal process out of memory: Zone" al procesar el node.exe de Node 24
// (~90 MB) — el binario de Node 22 sí lo procesa bien.
const NODE_BASE_URL = 'https://nodejs.org/dist/latest-v22.x/win-x64/node.exe';
const NODE_BASE_DIR = join(root, '.node-base');
const NODE_BASE = join(NODE_BASE_DIR, 'node.exe');

function step(msg) { console.log(`\n▸ ${msg}`); }

async function ensureBaseNode() {
  if (existsSync(NODE_BASE)) return;
  step(`Descargando el runtime base (${NODE_BASE_URL})…`);
  mkdirSync(NODE_BASE_DIR, { recursive: true });
  const res = await fetch(NODE_BASE_URL);
  if (!res.ok) throw new Error(`Descarga del runtime falló: HTTP ${res.status}`);
  writeFileSync(NODE_BASE, Buffer.from(await res.arrayBuffer()));
  const v = execFileSync(NODE_BASE, ['--version']).toString().trim();
  console.log(`  runtime base listo: Node ${v}`);
}

await ensureBaseNode();

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

// 2. Configuración SEA + blob — generado por el MISMO runtime que correrá el
//    exe (requisito de Node SEA: blob y binario de la misma versión).
step('Generando blob SEA…');
const seaConfig = {
  main: join(dist, 'agent.cjs'),
  output: join(dist, 'sea-prep.blob'),
  disableExperimentalSEAWarning: true,
};
writeFileSync(join(dist, 'sea-config.json'), JSON.stringify(seaConfig));
execFileSync(NODE_BASE, ['--experimental-sea-config', join(dist, 'sea-config.json')], { stdio: 'inherit' });

// 3. Copia el runtime base y renómbralo.
step('Creando LeoginAgent.exe…');
const exe = join(dist, 'LeoginAgent.exe');
copyFileSync(NODE_BASE, exe);

// 4. Inyecta el blob en el exe (postject), corriendo también sobre el runtime base.
step('Inyectando el código (postject)…');
const postject = join(root, 'node_modules', 'postject', 'dist', 'cli.js');
execFileSync(
  NODE_BASE,
  [postject, exe, 'NODE_SEA_BLOB', join(dist, 'sea-prep.blob'), '--sentinel-fuse', FUSE],
  { stdio: 'inherit' },
);

// 4b. Convierte el exe en binario de VENTANA (sin consola).
//
//     node.exe es un binario de CONSOLA, así que LeoginAgent.exe abría una
//     ventana negra cada vez que arrancaba. Para taparla, el instalador
//     escribía un VBScript con `WScript.Shell.Run(..., 0)` y registraba una
//     tarea que lo ejecutaba con wscript.exe. Ese truco es justo el patrón que
//     Windows Defender puntúa como `Behavior:Win32/Execution.A!ml` — se llevó
//     por delante la app el 2026-07-29.
//
//     Cambiando el subsistema en la cabecera PE el proceso ya nace sin
//     consola, el VBScript sobra y el arranque puede apuntar directo al exe.
//     Va DESPUÉS de postject: la inyección reescribe secciones del binario.
step('Quitando la consola del ejecutable (subsistema PE)…');
patchSubsystemToGui(exe);

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

/* ── Cabecera PE: CONSOLE → WINDOWS ───────────────────────────────────────
   Mapa de lo que se toca (formato PE, docs de Microsoft):
     0x3C            e_lfanew → desplazamiento de la firma "PE\0\0"
     e_lfanew + 24   inicio del Optional Header
     Optional + 64   CheckSum   (4 bytes)
     Optional + 68   Subsystem  (2 bytes) — 3 = consola, 2 = ventana
   El desplazamiento de Subsystem es el mismo en PE32 y PE32+.

   El CheckSum se recalcula a propósito: dejarlo mal es otra señal que algunos
   antivirus puntúan, y aquí el objetivo entero es dejar de parecer sospechoso. */
function patchSubsystemToGui(file) {
  const buf = readFileSync(file);

  if (buf.readUInt16LE(0) !== 0x5a4d) throw new Error('No parece un ejecutable de Windows (falta "MZ").');
  const peOff = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(peOff) !== 0x00004550) throw new Error('No se encontró la firma "PE" en la cabecera.');

  const optOff = peOff + 24;
  const magic = buf.readUInt16LE(optOff);
  if (magic !== 0x10b && magic !== 0x20b) throw new Error(`Optional Header desconocido (magic 0x${magic.toString(16)}).`);

  const subsystemOff = optOff + 68;
  const actual = buf.readUInt16LE(subsystemOff);
  if (actual === 2) {
    console.log('  ya era binario de ventana, nada que hacer');
    return;
  }
  if (actual !== 3) throw new Error(`Subsistema inesperado (${actual}); se aborta para no corromper el exe.`);

  buf.writeUInt16LE(2, subsystemOff);            // IMAGE_SUBSYSTEM_WINDOWS_GUI

  const checksumOff = optOff + 64;
  buf.writeUInt32LE(peChecksum(buf, checksumOff), checksumOff);

  writeFileSync(file, buf);
  console.log('  consola eliminada (subsistema 3 → 2) y checksum recalculado');
}

/** Checksum de imagen PE: suma de palabras de 16 bits omitiendo el propio
    campo, con acarreo plegado, más el tamaño del archivo. */
function peChecksum(buf, checksumOff) {
  let sum = 0;
  for (let i = 0; i + 1 < buf.length; i += 2) {
    if (i === checksumOff || i === checksumOff + 2) continue; // el campo no se suma
    sum += buf.readUInt16LE(i);
    sum = (sum & 0xffff) + (sum >>> 16);
  }
  if (buf.length % 2) {
    sum += buf[buf.length - 1];
    sum = (sum & 0xffff) + (sum >>> 16);
  }
  sum = (sum & 0xffff) + (sum >>> 16);
  return (sum + buf.length) >>> 0;
}
