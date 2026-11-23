/**
 * Antes de las pruebas de integración: ¿la base está al día y sus funciones
 * críticas son las del repositorio? (auditoría de lanzamiento 2026-11-23,
 * §6). Sin esto, una base atrasada o una función cambiada a mano daban
 * fallos de reparto o redondeo que parecían errores del código.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { compararHuellas, leerEsperadas, leerHuellas } from '../../scripts/huellas-funciones.mjs';

export default async function preflight() {
  const url = process.env.DINERO_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54601/postgres';
  const { host } = new URL(url);
  const delRepo = Math.max(...readdirSync(join(process.cwd(), 'supabase', 'migrations'))
    .map((f) => Number.parseInt(f, 10)).filter(Number.isFinite));

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query('select max(version)::int as v from supabase_migrations.schema_migrations');
    const deLaBase = Number(rows[0]?.v ?? 0);
    if (deLaBase < delRepo) {
      throw new Error(`La base de pruebas (${host}) va en la migración ${deLaBase} y el repositorio en la ${delRepo}. `
        + 'Ponla al día desde plataforma/ (supabase migration up) o apunta DINERO_DATABASE_URL a una base al día.');
    }
    const problemas: string[] = compararHuellas(leerEsperadas(), await leerHuellas(client));
    if (problemas.length) {
      throw new Error(`Las funciones críticas de la base de pruebas (${host}) no son las del repositorio:\n  `
        + `${problemas.join('\n  ')}\nSi tú cambiaste una de ellas en una migración, regenera las huellas con `
        + '`node scripts/huellas-funciones.mjs --escribir` sobre una base recién migrada.');
    }
  } finally {
    await client.end();
  }
}
