/**
 * Migración 194 y lib/archivos-del-local.ts, contra Supabase local real
 * (base y almacenamiento): al borrar un local se van sus comprobantes y las
 * fotos que nadie más usa; se conservan las que nombra una copia del local
 * o una plantilla (LZ-10). Crea sus propias filas y archivos y los quita.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { borrarArchivosDelLocal, listarCarpeta, BUCKET_COMPROBANTES, BUCKET_FOTOS } from '@/lib/archivos-del-local';

const local = (v: string | undefined, nombre: string) => {
  if (!v || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(v).hostname)) throw new Error(`${nombre} debe ser local.`);
  return v;
};
const api = local(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL');
const sql = new pg.Client({ connectionString: local(process.env.DINERO_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54601/postgres', 'DINERO_DATABASE_URL') });
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY local.');
const db = createClient(api, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const A = randomUUID();          // el local que se borra
const B = randomUUID();          // su copia («Duplicar restaurante»)
const plantilla = randomUUID();
const url = (ruta: string) => `${api}/storage/v1/object/public/${BUCKET_FOTOS}/${ruta}`;
const RUTAS = {
  compartida: `${A}/products/compartida.webp`,   // la usa la copia
  dePlantilla: `${A}/theme/fondo.webp`,          // la usa una plantilla, dentro de su config
  suelta: `${A}/products/suelta.webp`,           // ya no la usa nadie
  honda: `${A}/products/2026/vieja.webp`,        // en una subcarpeta, tampoco
};
const COMPROBANTE = `${A}/pago.pdf`;

async function subir(bucket: string, ruta: string, tipo: string) {
  const { error } = await db.storage.from(bucket).upload(ruta, new Blob([new Uint8Array([1, 2, 3])], { type: tipo }), { contentType: tipo, upsert: true });
  if (error) throw new Error(`${bucket}/${ruta}: ${error.message}`);
}

beforeAll(async () => {
  await sql.connect();
  await sql.query(`insert into restaurants (id, name, slug, status) values ($1, 'AUD 194 A', $3, 'active'), ($2, 'AUD 194 B', $4, 'active')`,
    [A, B, `aud-194-a-${A}`, `aud-194-b-${B}`]);
  await sql.query(`insert into products (restaurant_id, name, price, image_url) values ($1, 'Copia', 10, $2), ($3, 'Original', 10, $4)`,
    [B, url(RUTAS.compartida), A, url(RUTAS.suelta)]);
  await sql.query(`insert into theme_templates (id, name, config) values ($1, 'AUD 194', $2)`,
    [plantilla, JSON.stringify({ background: { image: url(RUTAS.dePlantilla) } })]);
  for (const ruta of Object.values(RUTAS)) await subir(BUCKET_FOTOS, ruta, 'image/webp');
  await subir(BUCKET_COMPROBANTES, COMPROBANTE, 'application/pdf');
});

afterAll(async () => {
  await db.storage.from(BUCKET_FOTOS).remove(Object.values(RUTAS));
  await db.storage.from(BUCKET_COMPROBANTES).remove([COMPROBANTE]);
  await sql.query('delete from theme_templates where id = $1', [plantilla]);
  await sql.query('delete from restaurants where id = any($1)', [[A, B]]);
  await sql.end();
});

describe('archivos de un local borrado (194)', () => {
  it('mientras existe, sus propias filas no cuentan como «en uso por otro»', async () => {
    const { rows } = await sql.query('select public.leogin_archivos_en_uso($1) as ruta', [A]);
    expect(rows.map((r) => r.ruta).sort()).toEqual([RUTAS.compartida, RUTAS.dePlantilla].sort());
  });

  it('al borrarlo se van sus comprobantes y las fotos que nadie usa', async () => {
    await sql.query('delete from restaurants where id = $1', [A]);
    expect(await borrarArchivosDelLocal(db, A)).toEqual({ fotosBorradas: 2, fotosConservadas: 2, comprobantesBorrados: 1 });
    expect((await listarCarpeta(db, BUCKET_FOTOS, A)).sort()).toEqual([RUTAS.compartida, RUTAS.dePlantilla].sort());
    expect(await listarCarpeta(db, BUCKET_COMPROBANTES, A)).toEqual([]);
  });

  it('repetirlo no hace nada más', async () => {
    expect(await borrarArchivosDelLocal(db, A)).toEqual({ fotosBorradas: 0, fotosConservadas: 2, comprobantesBorrados: 0 });
  });

  it('sin un id válido no toca el almacenamiento', async () => {
    expect(await borrarArchivosDelLocal(db, '')).toMatchObject({ fotosBorradas: 0, error: 'id de restaurante inválido' });
    expect(await borrarArchivosDelLocal(db, '../otro')).toMatchObject({ error: 'id de restaurante inválido' });
  });

  it('nadie la puede llamar desde el navegador', async () => {
    const { rows } = await sql.query(
      `select r.rolname from pg_roles r where r.rolname in ('anon', 'authenticated')
          and has_function_privilege(r.rolname, 'public.leogin_archivos_en_uso(uuid)', 'execute')`);
    expect(rows).toEqual([]);
  });
});
