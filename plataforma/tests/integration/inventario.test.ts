/**
 * Migración 180 · inventario y agotados con intención, contra Postgres real.
 * Casi todo corre dentro de una transacción que se deshace; las pruebas de
 * concurrencia usan dos conexiones reales y limpian lo que crean.
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

async function local(db: pg.Client = sql) {
  const id = randomUUID();
  await db.query(`insert into restaurants (id, name, slug, status, timezone, day_cutoff_minutes)
                  values ($1, 'AUD 180', $2, 'active', 'America/Guatemala', 300)`, [id, `aud-180-${id}`]);
  return id;
}
async function platillo(r: string, nombre: string, extra: { track?: boolean; stock?: number } = {}, db: pg.Client = sql) {
  const { rows } = await db.query(
    `insert into products (restaurant_id, name, price, track_stock, stock) values ($1, $2, 10, $3, $4) returning id`,
    [r, nombre, extra.track ?? false, extra.stock ?? null]);
  return rows[0].id as string;
}
const fila = async (id: string) =>
  (await sql.query('select is_available, agotado_motivo, vuelve_at, stock from products where id = $1', [id])).rows[0];

describe('agotados con intención (180)', () => {
  beforeEach(async () => { await sql.query('begin'); });
  afterEach(async () => { await sql.query('rollback'); });

  it('«hasta mañana» vuelve a la hora de corte del siguiente día de negocio', async () => {
    const r = await local();
    // 16:47 en Guatemala → mañana 05:00 (11:00 UTC); 02:00 en Guatemala → hoy 05:00.
    const { rows } = await sql.query(`select public.leogin_inicio_proximo_dia($1, '2026-11-09 22:47:00+00') as a,
                                             public.leogin_inicio_proximo_dia($1, '2026-11-10 08:00:00+00') as b`, [r]);
    expect(new Date(rows[0].a).toISOString()).toBe('2026-11-10T11:00:00.000Z');
    expect(new Date(rows[0].b).toISOString()).toBe('2026-11-10T11:00:00.000Z');
    const id = await platillo(r, 'Horchata');
    await sql.query('select public.leogin_marcar_agotado($1, $2, $3, $4)', [r, [id], 'manana', ACTOR]);
    const f = await fila(id);
    expect(f.is_available).toBe(false);
    expect(f.agotado_motivo).toBe('manana');
    expect(f.vuelve_at).not.toBeNull();
  });

  it('quien agota sin decir hasta cuándo deja «hasta mañana»; marcar disponible lo limpia', async () => {
    const r = await local();
    const id = await platillo(r, 'Tamal');
    await sql.query('update products set is_available = false where id = $1', [id]);
    expect(await fila(id)).toMatchObject({ is_available: false, agotado_motivo: 'manana' });
    await sql.query('update products set is_available = true where id = $1', [id]);
    expect(await fila(id)).toMatchObject({ is_available: true, agotado_motivo: null, vuelve_at: null });
  });

  it('sin existencias queda «hasta reponer» y vuelve al reponer', async () => {
    const r = await local();
    const id = await platillo(r, 'Ravioles', { track: true, stock: 1 });
    await sql.query('update products set stock = 0, is_available = false where id = $1', [id]);
    expect(await fila(id)).toMatchObject({ agotado_motivo: 'reponer', vuelve_at: null });
    await sql.query(`select public.leogin_ajustar_existencias($1, $2, 'sumar', 5, null, null, $3)`, [r, id, ACTOR]);
    expect(await fila(id)).toMatchObject({ is_available: true, agotado_motivo: null, stock: 5 });
  });

  it('«hasta reponer» con existencias vuelve al registrar más', async () => {
    const r = await local();
    const id = await platillo(r, 'Agua', { track: true, stock: 24 });
    await sql.query('select public.leogin_marcar_agotado($1, $2, $3, $4)', [r, [id], 'reponer', ACTOR]);
    expect(await fila(id)).toMatchObject({ is_available: false, agotado_motivo: 'reponer' });
    await sql.query(`select public.leogin_ajustar_existencias($1, $2, 'sumar', 6, null, null, $3)`, [r, id, ACTOR]);
    expect(await fila(id)).toMatchObject({ is_available: true, agotado_motivo: null, stock: 30 });
  });

  it('«hasta que lo active» no vuelve aunque haya existencias', async () => {
    const r = await local();
    const id = await platillo(r, 'Pescado', { track: true, stock: 3 });
    await sql.query('select public.leogin_marcar_agotado($1, $2, $3, $4)', [r, [id], 'manual', ACTOR]);
    await sql.query(`select public.leogin_ajustar_existencias($1, $2, 'sumar', 2, null, null, $3)`, [r, id, ACTOR]);
    expect(await fila(id)).toMatchObject({ is_available: false, agotado_motivo: 'manual', stock: 5 });
  });
});

describe('agotar por ingrediente (180)', () => {
  beforeEach(async () => { await sql.query('begin'); });
  afterEach(async () => { await sql.query('rollback'); });

  it('apaga lo que lo lleva y devuelve sólo lo que ya no espera otro ingrediente', async () => {
    const r = await local();
    const ing = async (n: string) => (await sql.query('insert into ingredients (restaurant_id, name, unit) values ($1, $2, $3) returning id', [r, n, 'g'])).rows[0].id as string;
    const aguacate = await ing('Aguacate');
    const tomate = await ing('Tomate');
    const guacamole = await platillo(r, 'Guacamole');
    const tacos = await platillo(r, 'Tacos');
    const ensalada = await platillo(r, 'Ensalada');
    const receta = (p: string, i: string) => sql.query('insert into recipe_items (product_id, ingredient_id, quantity) values ($1, $2, 1)', [p, i]);
    await receta(guacamole, aguacate);
    await receta(tacos, aguacate); await receta(tacos, tomate);
    await receta(ensalada, aguacate);
    await sql.query('select public.leogin_marcar_agotado($1, $2, $3, $4)', [r, [ensalada], 'manual', ACTOR]);

    const agotar = (i: string, a: boolean) =>
      sql.query('select public.leogin_agotar_ingrediente($1, $2, $3, $4) as res', [r, i, a, ACTOR]).then((x) => x.rows[0].res);
    expect(await agotar(aguacate, true)).toMatchObject({ platillos: 2 });
    await agotar(tomate, true);
    expect(await agotar(aguacate, false)).toMatchObject({ platillos: 1 });

    expect(await fila(guacamole)).toMatchObject({ is_available: true });
    expect(await fila(tacos)).toMatchObject({ is_available: false, agotado_motivo: 'ingrediente' });
    expect(await fila(ensalada)).toMatchObject({ is_available: false, agotado_motivo: 'manual' });
  });
});

describe('ajustes y activación (180)', () => {
  beforeEach(async () => { await sql.query('begin'); });
  afterEach(async () => { await sql.query('rollback'); });

  const ajustar = (r: string, id: string, modo: string, n: number, motivo: string | null, nota: string | null = null) =>
    sql.query('select public.leogin_ajustar_existencias($1, $2, $3, $4, $5, $6, $7) as res', [r, id, modo, n, motivo, nota, ACTOR]).then((x) => x.rows[0].res);

  it('restar o fijar exige motivo; no deja negativos; deja movimiento con nota y responsable', async () => {
    const r = await local();
    const id = await platillo(r, 'Pepián', { track: true, stock: 3 });
    await sql.query('savepoint a');
    await expect(ajustar(r, id, 'restar', 1, null)).rejects.toThrow(/motivo/);
    await sql.query('rollback to savepoint a');
    await expect(ajustar(r, id, 'restar', 5, 'merma')).rejects.toThrow(/Sólo quedan 3/);
    await sql.query('rollback to savepoint a');
    expect(await ajustar(r, id, 'restar', 2, 'merma', 'se quemó una olla')).toMatchObject({ antes: 3, despues: 1 });
    const { rows } = await sql.query('select reason, nota, created_by from stock_movements where product_id = $1', [id]);
    expect(rows).toEqual([{ reason: 'merma', nota: 'se quemó una olla', created_by: ACTOR }]);
    expect(await ajustar(r, id, 'fijar', 0, 'conteo')).toMatchObject({ despues: 0 });
    expect(await fila(id)).toMatchObject({ is_available: false, agotado_motivo: 'reponer' });
  });

  it('activar varios es todo o nada', async () => {
    const r = await local();
    const a = await platillo(r, 'Agua');
    const b = await platillo(r, 'Horchata');
    const activar = (filas: unknown) =>
      sql.query('select public.leogin_activar_control($1, $2::jsonb, $3) as res', [r, JSON.stringify(filas), ACTOR]).then((x) => x.rows[0].res);
    await sql.query('savepoint a');
    await expect(activar([{ id: a, stock: '24', minimo: '6' }, { id: b, stock: '-1', minimo: '6' }])).rejects.toThrow(/enteros/);
    await sql.query('rollback to savepoint a');
    expect((await sql.query('select count(*)::int as n from products where id = any($1) and track_stock', [[a, b]])).rows[0].n).toBe(0);
    expect(await activar([{ id: a, stock: '24', minimo: '6' }, { id: b, stock: '0', minimo: '6' }])).toMatchObject({ activados: 2 });
    expect(await fila(a)).toMatchObject({ is_available: true, stock: 24 });
    expect(await fila(b)).toMatchObject({ is_available: false, agotado_motivo: 'reponer' });
  });
});

describe('concurrencia real (180, matriz M§8)', () => {
  it('dos aparatos por la última unidad: sólo uno vende', async () => {
    const otro = new pg.Client({ connectionString: url });
    await otro.connect();
    const r = await local();
    try {
      const id = await platillo(r, 'Último pastel', { track: true, stock: 1 });
      const pedir = (db: pg.Client) => db.query(
        `select public.place_order(p_restaurant_id => $1, p_customer_name => 'AUD 180', p_customer_phone => '00000000',
           p_order_type => 'PICKUP', p_address => null, p_delivery_zone => null, p_delivery_lat => null, p_delivery_lng => null,
           p_customer_id => null, p_subtotal => 10, p_delivery_fee => 0, p_total => 10, p_notes => null,
           p_items => $2::jsonb, p_payment_method => 'CASH', p_cash_amount => null, p_tip => 0, p_waiter_id => null, p_client_id => null)`,
        [r, JSON.stringify([{ product_id: id, name_snapshot: 'Último pastel', price_snapshot: 10, quantity: 1, subtotal: 10 }])]);
      const res = await Promise.allSettled([pedir(sql), pedir(otro)]);
      expect(res.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(String((res.find((x) => x.status === 'rejected') as PromiseRejectedResult).reason)).toMatch(/Sin stock suficiente/);
      expect(await fila(id)).toMatchObject({ stock: 0, is_available: false, agotado_motivo: 'reponer' });
    } finally {
      await sql.query('delete from orders where restaurant_id = $1', [r]);
      await sql.query('delete from stock_movements where restaurant_id = $1', [r]);
      await sql.query('delete from activity_log where restaurant_id = $1', [r]);
      await sql.query('delete from products where restaurant_id = $1', [r]);
      await sql.query('delete from restaurants where id = $1', [r]);
      await otro.end();
    }
  });

  it('dos ajustes simultáneos no se pierden', async () => {
    const otro = new pg.Client({ connectionString: url });
    await otro.connect();
    const r = await local();
    try {
      const id = await platillo(r, 'Agua', { track: true, stock: 10 });
      const sumar = (db: pg.Client) =>
        db.query(`select public.leogin_ajustar_existencias($1, $2, 'sumar', 1, null, null, $3)`, [r, id, ACTOR]);
      await Promise.all([sumar(sql), sumar(otro), sumar(sql), sumar(otro)]);
      expect((await fila(id)).stock).toBe(14);
    } finally {
      await sql.query('delete from stock_movements where restaurant_id = $1', [r]);
      await sql.query('delete from activity_log where restaurant_id = $1', [r]);
      await sql.query('delete from products where restaurant_id = $1', [r]);
      await sql.query('delete from restaurants where id = $1', [r]);
      await otro.end();
    }
  });
});
