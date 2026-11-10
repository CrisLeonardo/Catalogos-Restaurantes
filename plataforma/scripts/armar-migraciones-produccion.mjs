#!/usr/bin/env node
/**
 * Junta un rango de migraciones en UN script para pegar en el SQL Editor de
 * Supabase (o correr con psql), en vez de cargarlas una por una.
 *
 *   node scripts/armar-migraciones-produccion.mjs 155 180
 *   node scripts/armar-migraciones-produccion.mjs 155 180 --previa=153
 *   node scripts/armar-migraciones-produccion.mjs 154 154 --sin-guarda
 *
 * - Una sola transacción: si una migración falla, no queda ninguna a medias.
 *   Por eso se quitan los `begin;` / `commit;` propios de cada archivo (solo
 *   las líneas que son exactamente eso; el `begin` de un bloque plpgsql no
 *   lleva punto y coma y no se toca).
 * - Guarda inicial: se niega a correr si la migración anterior al rango no
 *   está aplicada o si la primera del rango ya lo está (según las huellas de
 *   `supabase/verificar_migraciones.sql`).
 * - El resultado va a `supabase/.produccion/` (ignorado por git): es un
 *   derivado de los archivos versionados, no una fuente nueva.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase');
const [desde, hasta] = process.argv.slice(2, 4).map(Number);
const sinGuarda = process.argv.includes('--sin-guarda');
/* La que debe estar aplicada antes del rango. Por omisión, la anterior; se
   cambia cuando una migración del medio va DESPUÉS del código (la 154). */
const argPrevia = process.argv.find((a) => a.startsWith('--previa='));
const nPrevia = argPrevia ? Number(argPrevia.split('=')[1]) : desde - 1;
if (!Number.isInteger(desde) || !Number.isInteger(hasta) || desde > hasta) {
  console.error('Uso: node scripts/armar-migraciones-produccion.mjs <desde> <hasta> [--sin-guarda]');
  process.exit(1);
}

const archivos = readdirSync(join(raiz, 'migrations'))
  .filter((f) => /^\d{3}_.*\.sql$/.test(f))
  .map((f) => ({ n: Number(f.slice(0, 3)), f }))
  .filter(({ n }) => n >= desde && n <= hasta)
  .sort((a, b) => a.n - b.n);

const numeros = archivos.map((a) => a.n);
for (let n = desde; n <= hasta; n++) {
  if (!numeros.includes(n)) { console.error(`Falta la migración ${n} en el rango.`); process.exit(1); }
}

/** La condición «aplicada» de una migración, tomada del verificador. */
function huella(n) {
  const sql = readFileSync(join(raiz, 'verificar_migraciones.sql'), 'utf8').replace(/\r\n/g, '\n');
  const partes = sql.split(/\n(?=  \('\d{3}')/);
  const parte = partes.find((p) => p.startsWith(`  ('${String(n).padStart(3, '0')}'`));
  if (!parte) return null;
  // ('NNN', 'qué', <condición>, 'cuándo')
  const cuerpo = parte.replace(/^ {2}\('\d{3}',\s*'(?:[^']|'')*',\s*/, '');
  const fin = cuerpo.lastIndexOf(',\n');
  return fin > 0 ? cuerpo.slice(0, fin).trim() : null;
}

const quitarTransaccion = (sql) => sql
  .replace(/\r\n/g, '\n')
  .split('\n')
  .filter((l) => !/^\s*(begin|commit)\s*;\s*(--.*)?$/i.test(l))
  .join('\n');

const salida = [];
salida.push(`-- Migraciones ${desde}–${hasta} en una sola transacción.`);
salida.push(`-- Generado por scripts/armar-migraciones-produccion.mjs el ${new Date().toISOString()}.`);
salida.push('-- Si algo falla, Postgres deshace TODO el bloque: se corrige y se vuelve a correr.');
salida.push('');
salida.push('begin;');
salida.push('');

if (!sinGuarda) {
  const previa = huella(nPrevia);
  const primera = huella(desde);
  if (!previa || !primera) {
    console.error(`No encontré la huella de ${nPrevia} o ${desde} en verificar_migraciones.sql; usa --sin-guarda si es a propósito.`);
    process.exit(1);
  }
  salida.push('-- Guarda: la base debe estar justo antes de este rango.');
  salida.push('do $guarda$');
  salida.push('begin');
  salida.push(`  if not coalesce((${previa}), false) then`);
  salida.push(`    raise exception 'Falta aplicar la migración ${nPrevia}: este script empieza en la ${desde}.';`);
  salida.push('  end if;');
  salida.push(`  if coalesce((${primera}), false) then`);
  salida.push(`    raise exception 'La migración ${desde} ya está aplicada: no vuelvas a correr este script.';`);
  salida.push('  end if;');
  salida.push('end');
  salida.push('$guarda$;');
  salida.push('');
}

for (const { n, f } of archivos) {
  const sql = quitarTransaccion(readFileSync(join(raiz, 'migrations', f), 'utf8')).trim();
  salida.push(`-- ════════════════════════════════════════════════════════════`);
  salida.push(`-- ${f}`);
  salida.push(`-- ════════════════════════════════════════════════════════════`);
  salida.push(sql);
  salida.push(`select 'aplicada ${n}' as avance;`);
  salida.push('');
}

salida.push('commit;');
salida.push('');

const dir = join(raiz, '.produccion');
mkdirSync(dir, { recursive: true });
const destino = join(dir, `migraciones_${desde}_a_${hasta}.sql`);
writeFileSync(destino, salida.join('\n'), 'utf8');
console.log(`Listo: ${destino} (${archivos.length} migraciones)`);
