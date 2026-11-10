/**
 * Migración 179 · catálogo, contra Postgres real: lote todo o nada,
 * borrar categoría con destino, candado de categoría entre restaurantes,
 * sellos que son dietas y última edición. Cada caso se deshace al terminar.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const url = process.env.DINERO_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54601/postgres';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) throw new Error('Sólo bases locales.');
const sql = new pg.Client({ connectionString: url });
const ACTOR = randomUUID();

beforeAll(async () => { await sql.connect(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await sql.query('begin'); });
afterEach(async () => { await sql.query('rollback'); });

async function local() {
  const id = randomUUID();
  await sql.query(`insert into restaurants (id, name, slug, status) values ($1, 'AUD 179', $2, 'active')`, [id, `aud-179-${id}`]);
  return id;
}
async function categoria(r: string, nombre: string) {
  const { rows } = await sql.query(`insert into categories (restaurant_id, name) values ($1, $2) returning id`, [r, nombre]);
  return rows[0].id as string;
}
async function platillo(r: string, nombre: string, precio: number, cat: string | null = null) {
  const { rows } = await sql.query(`insert into products (restaurant_id, name, price, category_id) values ($1, $2, $3, $4) returning id`,
    [r, nombre, precio, cat]);
  return rows[0].id as string;
}
const lote = (r: string, ids: string[], cambio: unknown) =>
  sql.query('select public.leogin_aplicar_lote_catalogo($1, $2, $3::jsonb, $4) as res', [r, ids, JSON.stringify(cambio), ACTOR]).then((x) => x.rows[0].res);
const precios = async (ids: string[]) =>
  (await sql.query('select name, price::text as price from products where id = any($1) order by name', [ids])).rows;

describe('lote del catálogo (179)', () => {
  it('sube 10 % redondeando a centavos y deja el detalle en la bitácora', async () => {
    const r = await local();
    const ids = [await platillo(r, 'A', 35), await platillo(r, 'B', 65.5)];
    expect(await lote(r, ids, { precio: { modo: 'porcentaje', valor: 10 } })).toMatchObject({ ok: true, cambiados: 2 });
    expect(await precios(ids)).toEqual([{ name: 'A', price: '38.50' }, { name: 'B', price: '72.05' }]);
    const { rows } = await sql.query(`select meta from activity_log where restaurant_id = $1 and action = 'catalogo_lote'`, [r]);
    expect(rows[0].meta.precios).toHaveLength(2);
  });

  it('todo o nada: si un precio quedaría negativo no cambia ninguno y dice cuál', async () => {
    const r = await local();
    const ids = [await platillo(r, 'Caro', 50), await platillo(r, 'Barato', 3)];
    await sql.query('savepoint antes');
    await expect(lote(r, ids, { precio: { modo: 'monto', valor: -5 } })).rejects.toThrow(/«Barato» quedaría negativo/);
    await sql.query('rollback to savepoint antes');
    expect(await precios(ids)).toEqual([{ name: 'Barato', price: '3.00' }, { name: 'Caro', price: '50.00' }]);
  });

  it('no toca platillos de otro restaurante', async () => {
    const a = await local();
    const b = await local();
    const ajeno = await platillo(b, 'Ajeno', 10);
    await expect(lote(a, [ajeno], { disponible: false })).rejects.toThrow(/ya no existe/);
  });

  it('agota, oculta y mueve de categoría', async () => {
    const r = await local();
    const destino = await categoria(r, 'Bebidas');
    const ids = [await platillo(r, 'Limonada', 18)];
    await lote(r, ids, { disponible: false, visible: false, categoria: destino });
    const { rows } = await sql.query('select is_available, is_active, unavailable_at is not null as marcado, category_id from products where id = $1', [ids[0]]);
    expect(rows[0]).toEqual({ is_available: false, is_active: false, marcado: true, category_id: destino });
  });
});

describe('categorías y candados (179)', () => {
  it('borrar una categoría con platillos exige destino y los mueve', async () => {
    const r = await local();
    const vieja = await categoria(r, 'Vieja');
    const nueva = await categoria(r, 'Nueva');
    const id = await platillo(r, 'Pepián', 68, vieja);
    const borrar = (destino: string | null) =>
      sql.query('select public.leogin_borrar_categoria($1, $2, $3, $4) as res', [r, vieja, destino, ACTOR]).then((x) => x.rows[0].res);
    await sql.query('savepoint sin_destino');
    await expect(borrar(null)).rejects.toThrow(/pasan sus 1 platillos/);
    await sql.query('rollback to savepoint sin_destino');
    expect(await borrar(nueva)).toMatchObject({ ok: true, movidos: 1, destino: 'Nueva' });
    const { rows } = await sql.query('select category_id from products where id = $1', [id]);
    expect(rows[0].category_id).toBe(nueva);
  });

  it('un platillo no puede usar la categoría de otro restaurante', async () => {
    const a = await local();
    const b = await local();
    const deB = await categoria(b, 'Ajena');
    await expect(platillo(a, 'Intruso', 10, deB)).rejects.toThrow(/no es de este restaurante/);
  });

  it('un sello que es dieta se reconoce (sin acentos ni mayúsculas)', async () => {
    const { rows } = await sql.query(`select public.leogin_dieta_de_sello('  VEGANO ') as a, public.leogin_dieta_de_sello('Sin Lactosa') as b,
      public.leogin_dieta_de_sello('Bajo en azúcar') as c, public.leogin_dieta_de_sello('Nuevo') as d,
      public.leogin_dieta_de_sello('hot') as e, public.leogin_dieta_de_sello('veg') as f`);
    expect(rows[0]).toEqual({ a: 'vegano', b: 'sin_lactosa', c: 'bajo_en_azucar', d: null, e: 'picante', f: 'vegano' });
  });

  it('editar actualiza la última edición', async () => {
    const r = await local();
    const id = await platillo(r, 'Taco', 10);
    const antes = (await sql.query('select updated_at from products where id = $1', [id])).rows[0].updated_at;
    await new Promise((ok) => setTimeout(ok, 20));
    await sql.query('update products set price = 11 where id = $1', [id]);
    const despues = (await sql.query('select updated_at from products where id = $1', [id])).rows[0].updated_at;
    expect(new Date(despues).getTime()).toBeGreaterThan(new Date(antes).getTime());
  });
});
