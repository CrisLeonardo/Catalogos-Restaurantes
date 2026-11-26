/**
 * Migración 192 · olvidar a un comensal, contra Postgres real (LZ-10): el
 * ensayo no cambia nada; al confirmar se van sus datos personales del local
 * y quedan los totales, los pedidos abiertos, las facturas y los demás
 * clientes. Cada caso se deshace.
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

async function local() {
  const id = randomUUID();
  await sql.query(`insert into restaurants (id, name, slug, status) values ($1, 'AUD 192', $2, 'active')`, [id, `aud-192-${id}`]);
  return id;
}

let n = 0;
async function pedido(r: string, o: { tel: string; tipo?: string; estado?: string; dir?: string | null; cliente?: string | null }) {
  const id = randomUUID();
  await sql.query(
    `insert into orders (id, restaurant_id, order_number, customer_name, customer_phone, order_type, status,
                         subtotal, total, address, notes, delivery_lat, delivery_lng, customer_id)
     values ($1, $2, $3, 'Ana Pérez', $4, $5, $6, 50, 50, $7, 'Casa azul, timbre 2', 14.6, -90.5, $8)`,
    [id, r, `A-${++n}`, o.tel, o.tipo ?? 'DELIVERY', o.estado ?? 'DELIVERED', o.dir ?? '5a avenida 10-20, zona 1', o.cliente ?? null],
  );
  return id;
}

/** Un local con Ana (la que pide el borrado) y Beto (que no tiene nada que ver). */
async function escena() {
  const r = await local();
  const ana = (await uno<{ id: string }>(
    `insert into customers (restaurant_id, name, phone, email, default_address) values ($1, 'Ana Pérez', '+502 5555-1234', 'ana@ejemplo.test', 'zona 1') returning id`, [r])).id;
  const beto = (await uno<{ id: string }>(
    `insert into customers (restaurant_id, name, phone) values ($1, 'Beto Ruiz', '4444 9876') returning id`, [r])).id;
  await sql.query('insert into loyalty_accounts (restaurant_id, customer_id, points_balance) values ($1, $2, 40)', [r, ana]);
  const domicilio = await pedido(r, { tel: '55551234', cliente: ana });
  const mesa = await pedido(r, { tel: '5555 1234', tipo: 'DINE_IN', dir: 'Mesa 4' });
  const abierto = await pedido(r, { tel: '5555-1234', tipo: 'PICKUP', estado: 'PREP' });
  const deBeto = await pedido(r, { tel: '4444 9876', cliente: beto });
  await sql.query(`insert into order_ratings (restaurant_id, order_id, rating, comment, customer_name) values ($1, $2, 5, 'Soy Ana, vivo cerca', 'Ana')`, [r, domicilio]);
  await sql.query(`insert into reservations (restaurant_id, customer_name, customer_phone, date, time, notes) values ($1, 'Ana Pérez', '55551234', current_date, '19:00', 'cumpleaños')`, [r]);
  await sql.query(`insert into waitlist_entries (restaurant_id, customer_name, phone) values ($1, 'Ana', '+50255551234')`, [r]);
  const conv = (await uno<{ id: string }>(`insert into whatsapp_conversations (restaurant_id, wa_id, customer_id) values ($1, '50255551234', $2) returning id`, [r, ana])).id;
  await sql.query(`insert into whatsapp_messages (conversation_id, restaurant_id, direction, payload) values ($1, $2, 'IN', '{"text":"hola"}')`, [conv, r]);
  await sql.query(`insert into fel_documents (restaurant_id, order_id, receptor_nit, receptor_nombre) values ($1, $2, '1234567', 'Ana Pérez')`, [r, domicilio]);
  return { r, ana, beto, domicilio, mesa, abierto, deBeto };
}

const olvidar = async (r: string, tel: string, confirmar = false) =>
  (await uno<{ x: Record<string, unknown> }>('select public.leogin_olvidar_comensal($1, $2, $3) as x', [r, tel, confirmar])).x;

const RESUMEN = {
  fichas_de_cliente: 1, cuentas_de_puntos: 1, pedidos_cerrados: 2, pedidos_abiertos: 1,
  reservas: 1, lista_de_espera: 1, resenas: 1, conversaciones_whatsapp: 1, facturas_conservadas: 1,
};

describe('olvidar a un comensal (192)', () => {
  it('el ensayo cuenta lo que borraría y no cambia nada', async () => {
    const e = await escena();
    expect(await olvidar(e.r, '5555 1234')).toEqual({ aplicado: false, ...RESUMEN });
    expect(await uno('select count(*)::int as n from customers where id = $1', [e.ana])).toEqual({ n: 1 });
    expect(await uno('select customer_name from orders where id = $1', [e.domicilio])).toEqual({ customer_name: 'Ana Pérez' });
  });

  it('al confirmar se van sus datos personales y quedan los totales', async () => {
    const e = await escena();
    expect(await olvidar(e.r, '+502 5555 1234', true)).toEqual({ aplicado: true, ...RESUMEN });

    expect(await uno('select count(*)::int as n from customers where id = $1', [e.ana])).toEqual({ n: 0 });
    expect(await uno('select count(*)::int as n from loyalty_accounts where customer_id = $1', [e.ana])).toEqual({ n: 0 });
    expect(await uno(
      `select customer_name, customer_phone, address, notes, delivery_lat, customer_id, total::float as total from orders where id = $1`, [e.domicilio],
    )).toEqual({ customer_name: 'Cliente eliminado', customer_phone: '', address: null, notes: null, delivery_lat: null, customer_id: null, total: 50 });
    // En la mesa, «Mesa 4» no es un dato personal y la usa el salón.
    expect(await uno('select customer_name, address, table_number from orders where id = $1', [e.mesa]))
      .toEqual({ customer_name: 'Cliente eliminado', address: 'Mesa 4', table_number: 4 });
    expect(await uno('select customer_name, comment, rating from order_ratings where order_id = $1', [e.domicilio]))
      .toEqual({ customer_name: null, comment: null, rating: 5 });
    expect(await uno('select customer_name, customer_phone, notes from reservations where restaurant_id = $1', [e.r]))
      .toEqual({ customer_name: 'Cliente eliminado', customer_phone: null, notes: null });
    expect(await uno('select customer_name, phone from waitlist_entries where restaurant_id = $1', [e.r]))
      .toEqual({ customer_name: 'Cliente eliminado', phone: null });
    expect(await uno('select count(*)::int as n from whatsapp_messages where restaurant_id = $1', [e.r])).toEqual({ n: 0 });
  });

  it('no toca pedidos abiertos, facturas ni a otros clientes', async () => {
    const e = await escena();
    await olvidar(e.r, '55551234', true);
    expect(await uno('select customer_name, customer_phone from orders where id = $1', [e.abierto]))
      .toEqual({ customer_name: 'Ana Pérez', customer_phone: '5555-1234' });
    expect(await uno('select receptor_nombre, receptor_nit from fel_documents where order_id = $1', [e.domicilio]))
      .toEqual({ receptor_nombre: 'Ana Pérez', receptor_nit: '1234567' });
    expect(await uno('select name, phone from customers where id = $1', [e.beto])).toEqual({ name: 'Beto Ruiz', phone: '4444 9876' });
    expect(await uno('select customer_name, notes from orders where id = $1', [e.deBeto]))
      .toEqual({ customer_name: 'Ana Pérez', notes: 'Casa azul, timbre 2' });
  });

  it('solo dentro del local pedido', async () => {
    const e = await escena();
    const otro = await escena();
    await olvidar(e.r, '55551234', true);
    expect(await uno('select count(*)::int as n from customers where id = $1', [otro.ana])).toEqual({ n: 1 });
  });

  it('se niega sin un teléfono completo o con un local que no existe', async () => {
    const e = await escena();
    await expect(olvidar(e.r, '1234')).rejects.toThrow(/al menos 8 dígitos/);
    await sql.query('rollback'); await sql.query('begin');
    await expect(olvidar(randomUUID(), '55551234')).rejects.toThrow(/No existe ese local/);
  });

  it('nadie la puede llamar desde el navegador', async () => {
    const { rows } = await sql.query(
      `select r.rolname from pg_roles r
        where r.rolname in ('anon', 'authenticated')
          and has_function_privilege(r.rolname, 'public.leogin_olvidar_comensal(uuid, text, boolean)', 'execute')`);
    expect(rows).toEqual([]);
  });
});
