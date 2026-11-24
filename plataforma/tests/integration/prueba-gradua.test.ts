/**
 * Migración 194 · al terminar la prueba gratis, el cobro empieza ese día
 * (LZ-01), contra Postgres real. Antes conservaba el día del alta y la
 * mensualidad del mes podía nacer vencida. Cada caso se deshace.
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

/** Un local en prueba, dado de alta el día 1 con el cobro ese día, como lo deja el alta. */
async function enPrueba(terminaHaceHoras: number) {
  const id = randomUUID();
  await sql.query(`insert into restaurants (id, name, slug, status, plan_actual) values ($1, 'AUD 194', $2, 'active', 'EN_LINEA')`,
    [id, `aud-194-${id}`]);
  await sql.query(
    `insert into restaurant_billing (restaurant_id, auto_price, monthly_fee, active, billing_day, started_at, trial_ends_at)
     values ($1, false, 99, false, 1, (now() at time zone 'America/Guatemala')::date - 30, now() - make_interval(hours => $2))`,
    [id, terminaHaceHoras],
  );
  return id;
}
const hoyGT = async () => (await sql.query(
  `select (now() at time zone 'America/Guatemala')::date::text as d,
          least(28, extract(day from (now() at time zone 'America/Guatemala'))::int) as dia`)).rows[0];

describe('graduar la prueba gratis (194)', () => {
  it('pasa a cobro con el día y el inicio de hoy, no los del alta', async () => {
    const r = await enPrueba(1);
    await sql.query('select public.leogin_graduate_trials()');
    const { rows } = await sql.query(
      `select active, billing_day, started_at::text as inicio from restaurant_billing where restaurant_id = $1`, [r]);
    const hoy = await hoyGT();
    expect(rows[0]).toEqual({ active: true, billing_day: hoy.dia, inicio: hoy.d });
  });

  it('la primera mensualidad no nace vencida', async () => {
    const r = await enPrueba(1);
    await sql.query('select public.leogin_graduate_trials()');
    await sql.query('select public.leogin_generate_monthly_invoices()');
    const { rows } = await sql.query(
      `select due_date >= (now() at time zone 'America/Guatemala')::date - 3 as a_tiempo
         from invoices where restaurant_id = $1 and concept = 'MONTHLY'`, [r]);
    // El 29, 30 y 31 se cobra el 28 (como todo el sistema): hasta 3 días antes.
    expect(rows).toEqual([{ a_tiempo: true }]);
  });

  it('no toca a quien sigue en prueba', async () => {
    const r = await enPrueba(-24);
    await sql.query('select public.leogin_graduate_trials()');
    const { rows } = await sql.query(`select active, billing_day from restaurant_billing where restaurant_id = $1`, [r]);
    expect(rows[0]).toEqual({ active: false, billing_day: 1 });
  });
});
