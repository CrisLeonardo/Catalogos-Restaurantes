/**
 * Migración 191 · precio acordado, contra Postgres real: cambiar los precios
 * globales no mueve la mensualidad de quien ya paga; cambiar de plan sí la
 * vuelve a fijar; el corte mensual cobra lo acordado. Cada caso se deshace.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const url = process.env.DINERO_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54601/postgres';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) throw new Error('Sólo bases locales.');
const sql = new pg.Client({ connectionString: url });

beforeAll(async () => { await sql.connect(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await sql.query('begin'); });
afterEach(async () => { await sql.query('rollback'); });

const precio = (plan: string, valor: number) => sql.query(
  `insert into platform_settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value`,
  [`plan_price_${plan}`, String(valor)],
);

/** Un local recién dado de alta, como lo deja el alta: fila automática y precio fijado. */
async function local(plan: string, auto = true, montoManual = 0) {
  const id = randomUUID();
  await sql.query(`insert into restaurants (id, name, slug, status, plan_actual) values ($1, 'AUD 191', $2, 'active', $3)`,
    [id, `aud-191-${id}`, plan]);
  await sql.query(`insert into restaurant_billing (restaurant_id, auto_price, monthly_fee, active) values ($1, $2, $3, true)`,
    [id, auto, montoManual]);
  await sql.query('select public.leogin_apply_auto_price($1)', [id]);
  return id;
}
const cobro = async (id: string) => (await sql.query(
  `select monthly_fee::float as fee, plan_del_precio as plan, precio_fijado_en is not null as fijado
     from restaurant_billing where restaurant_id = $1`, [id])).rows[0];
const plan = (id: string, p: string) => sql.query('update restaurants set plan_actual = $2 where id = $1', [id, p]);

describe('precio acordado (191)', () => {
  it('el alta fija el precio vigente y anota con qué plan', async () => {
    await precio('EN_LINEA', 99);
    const r = await local('EN_LINEA');
    expect(await cobro(r)).toEqual({ fee: 99, plan: 'EN_LINEA', fijado: true });
  });

  it('subir el precio global no mueve la mensualidad de quien ya paga', async () => {
    await precio('ESTANDAR', 150);
    const r = await local('ESTANDAR');
    await precio('ESTANDAR', 199);
    await sql.query('select public.leogin_apply_auto_price_all()');
    expect((await cobro(r)).fee).toBe(150);
    expect((await sql.query('select public.leogin_apply_auto_price($1)::float as f', [r])).rows[0].f).toBe(150);
  });

  it('el corte mensual cobra lo acordado, no el precio nuevo', async () => {
    await precio('PREMIUM', 299);
    const r = await local('PREMIUM');
    await precio('PREMIUM', 349);
    await sql.query('select public.leogin_generate_monthly_invoices()');
    const { rows } = await sql.query(
      `select amount::float as amount from invoices where restaurant_id = $1 and concept = 'MONTHLY'`, [r]);
    expect(rows).toEqual([{ amount: 299 }]);
  });

  it('cambiar de plan fija el precio vigente del plan nuevo', async () => {
    await precio('EN_LINEA', 99);
    await precio('ESTANDAR', 199);
    const r = await local('EN_LINEA');
    await plan(r, 'ESTANDAR');
    await sql.query('select public.leogin_apply_auto_price($1)', [r]);
    expect(await cobro(r)).toEqual({ fee: 199, plan: 'ESTANDAR', fijado: true });
  });

  it('un cambio de plan que no volvió a fijar el precio lo corrige el corte', async () => {
    await precio('EN_LINEA', 99);
    await precio('PREMIUM', 299);
    const r = await local('EN_LINEA');
    await plan(r, 'PREMIUM');
    await sql.query('select public.leogin_generate_monthly_invoices()');
    expect(await cobro(r)).toMatchObject({ fee: 299, plan: 'PREMIUM' });
    const { rows } = await sql.query(
      `select amount::float as amount from invoices where restaurant_id = $1 and concept = 'MONTHLY'`, [r]);
    expect(rows).toEqual([{ amount: 299 }]);
  });

  it('pasar al precio vigente es una acción explícita', async () => {
    await precio('ESTANDAR', 150);
    const r = await local('ESTANDAR');
    await precio('ESTANDAR', 199);
    const { rows } = await sql.query('select public.leogin_fijar_precio_vigente($1)::float as f', [r]);
    expect(rows[0].f).toBe(199);
    expect((await cobro(r)).fee).toBe(199);
  });

  it('un precio manual no lo toca ni el cambio de plan ni el precio vigente', async () => {
    await precio('PREMIUM', 349);
    const r = await local('ESTANDAR', false, 120);
    await plan(r, 'PREMIUM');
    await sql.query('select public.leogin_apply_auto_price($1)', [r]);
    await sql.query('select public.leogin_apply_auto_price_all()');
    await sql.query('select public.leogin_fijar_precio_vigente($1)', [r]);
    expect((await cobro(r)).fee).toBe(120);
  });

  it('solo el servidor puede fijar precios', async () => {
    const { rows } = await sql.query(`
      select has_function_privilege('authenticated', 'public.leogin_fijar_precio_vigente(uuid)', 'execute') as auth,
             has_function_privilege('anon', 'public.leogin_apply_auto_price(uuid)', 'execute') as anon`);
    expect(rows[0]).toEqual({ auth: false, anon: false });
  });
});
