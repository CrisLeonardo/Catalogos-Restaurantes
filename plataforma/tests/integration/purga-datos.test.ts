/**
 * Migración 195 · plazos de los datos personales, contra Postgres real
 * (LZ-10): lo vencido pierde el nombre y el contacto, lo reciente queda
 * intacto, y los totales, las facturas y los puntos por canjear se quedan.
 * Cada caso se deshace.
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

const uno = async <T = Record<string, unknown>>(q: string, p: unknown[] = []) => (await sql.query(q, p)).rows[0] as T;
const purgar = () => sql.query('select public.leogin_purgar_datos_vencidos()');

async function local() {
  const id = randomUUID();
  await sql.query(`insert into restaurants (id, name, slug, status) values ($1, 'AUD 195', $2, 'active')`, [id, `aud-195-${id}`]);
  return id;
}

let n = 0;
/** Un pedido de Ana hecho hace `meses` meses. */
async function pedido(r: string, meses: number, o: { estado?: string; tipo?: string } = {}) {
  const id = randomUUID();
  await sql.query(
    `insert into orders (id, restaurant_id, order_number, customer_name, customer_phone, order_type, status,
                         subtotal, total, address, notes, delivery_lat, delivery_lng, created_at)
     values ($1, $2, $3, 'Ana Pérez', '55551234', $4, $5, 50, 50, '5a avenida 10-20', 'Casa azul', 14.6, -90.5,
             now() - make_interval(months => $6))`,
    [id, r, `P-${++n}`, o.tipo ?? 'DELIVERY', o.estado ?? 'DELIVERED', meses],
  );
  return id;
}
const elPedido = (id: string) => uno(
  `select customer_name, customer_phone, notes, address, delivery_lat, total::text as total from orders where id = $1`, [id]);
const cuantos = async (q: string, p: unknown[]) => Number((await uno<{ c: string }>(q, p)).c);

describe('purga diaria de datos vencidos (195)', () => {
  it('un pedido cerrado de hace más de 24 meses pierde el contacto y conserva el total', async () => {
    const r = await local();
    const viejo = await pedido(r, 25);
    await purgar();
    expect(await elPedido(viejo)).toEqual({
      customer_name: 'Cliente eliminado', customer_phone: '', notes: null, address: null, delivery_lat: null, total: '50.00',
    });
  });

  it('no toca pedidos recientes ni pedidos abiertos', async () => {
    const r = await local();
    const reciente = await pedido(r, 23);
    const abierto = await pedido(r, 30, { estado: 'PREP' });
    await purgar();
    expect((await elPedido(reciente)).customer_name).toBe('Ana Pérez');
    expect((await elPedido(abierto)).customer_name).toBe('Ana Pérez');
  });

  it('la mesa conserva su lugar: solo se van nombre, teléfono y notas', async () => {
    const r = await local();
    const mesa = await pedido(r, 25, { tipo: 'DINE_IN' });
    await purgar();
    expect(await elPedido(mesa)).toMatchObject({ customer_name: 'Cliente eliminado', customer_phone: '', address: '5a avenida 10-20' });
  });

  it('borra la ficha sin pedidos en 24 meses, salvo que tenga puntos por canjear', async () => {
    const r = await local();
    const ficha = async (hace: string) => (await uno<{ id: string }>(
      `insert into customers (restaurant_id, name, phone, last_order_at, created_at)
       values ($1, 'Ana', $3, now() - $2::interval, now() - interval '30 months') returning id`, [r, hace, `5555${++n}`])).id;
    await ficha('25 months');
    const conPuntos = await ficha('25 months');
    const activa = await ficha('2 months');
    await sql.query('insert into loyalty_accounts (restaurant_id, customer_id, points_balance) values ($1, $2, 40)', [r, conPuntos]);
    await purgar();
    const { rows } = await sql.query('select id from customers where restaurant_id = $1', [r]);
    expect(rows.map((x) => x.id).sort()).toEqual([conPuntos, activa].sort());
  });

  it('reseñas, reservas, lista de espera y WhatsApp con sus propios plazos', async () => {
    const r = await local();
    const p = await pedido(r, 25);
    await sql.query(
      `insert into order_ratings (restaurant_id, order_id, rating, comment, customer_name, created_at)
       values ($1, $2, 5, 'Soy Ana', 'Ana', now() - interval '25 months')`, [r, p]);
    await sql.query(
      `insert into reservations (restaurant_id, customer_name, customer_phone, date, time, notes, created_at)
       values ($1, 'Ana', '55551234', current_date - 400, '19:00', 'cumpleaños', now() - interval '14 months'),
              ($1, 'Beto', '44449876', current_date + 3, '19:00', null, now())`, [r]);
    await sql.query(
      `insert into waitlist_entries (restaurant_id, customer_name, phone, created_at)
       values ($1, 'Ana', '55551234', now() - interval '13 months')`, [r]);
    const conv = (await uno<{ id: string }>(
      `insert into whatsapp_conversations (restaurant_id, wa_id, created_at, updated_at)
       values ($1, '50255551234', now() - interval '14 months', now() - interval '14 months') returning id`, [r])).id;
    await sql.query(
      `insert into whatsapp_messages (conversation_id, restaurant_id, direction, payload, created_at)
       values ($1, $2, 'IN', '{"text":"hola"}', now() - interval '14 months')`, [conv, r]);
    await purgar();

    expect(await uno('select rating, comment, customer_name from order_ratings where order_id = $1', [p]))
      .toEqual({ rating: 5, comment: null, customer_name: null });
    const reservas = (await sql.query(
      'select customer_name, customer_phone from reservations where restaurant_id = $1 order by date', [r])).rows;
    expect(reservas).toEqual([
      { customer_name: 'Cliente eliminado', customer_phone: null },
      { customer_name: 'Beto', customer_phone: '44449876' },
    ]);
    expect(await uno('select customer_name, phone from waitlist_entries where restaurant_id = $1', [r]))
      .toEqual({ customer_name: 'Cliente eliminado', phone: null });
    expect(await cuantos('select count(*) c from whatsapp_conversations where id = $1', [conv])).toBe(0);
  });

  it('visitas y embudo de la carta: 13 meses', async () => {
    const r = await local();
    const v = randomUUID();
    await sql.query(
      `insert into page_visits (restaurant_id, visitor_id, created_at)
       values ($1, $2, now() - interval '14 months'), ($1, $2, now() - interval '12 months')`, [r, v]);
    await sql.query(
      `insert into menu_embudo (restaurant_id, visitor_id, canal, paso, created_at)
       values ($1, $2, 'mesa', 'apertura', now() - interval '14 months')`, [r, v]);
    await purgar();
    expect(await cuantos('select count(*) c from page_visits where restaurant_id = $1', [r])).toBe(1);
    expect(await cuantos('select count(*) c from menu_embudo where restaurant_id = $1', [r])).toBe(0);
  });

  it('las facturas FEL se conservan', async () => {
    const r = await local();
    const p = await pedido(r, 30);
    await sql.query(
      `insert into fel_documents (restaurant_id, order_id, receptor_nit, receptor_nombre) values ($1, $2, '1234567', 'Ana Pérez')`, [r, p]);
    await purgar();
    expect(await uno('select receptor_nombre from fel_documents where order_id = $1', [p])).toEqual({ receptor_nombre: 'Ana Pérez' });
  });

  it('nadie fuera del servidor puede correrla', async () => {
    expect(await uno(
      `select has_function_privilege('anon', 'public.leogin_purgar_datos_vencidos()', 'execute') as anon,
              has_function_privilege('authenticated', 'public.leogin_purgar_datos_vencidos()', 'execute') as auth`))
      .toEqual({ anon: false, auth: false });
  });
});
