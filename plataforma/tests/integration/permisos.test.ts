/**
 * Migración 177 · permisos por trabajo, contra Postgres real.
 *
 * Cada caso corre dentro de una transacción que se deshace: no deja filas.
 * Comprueba la conversión de permisos antiguos, que `null` ya no signifique
 * «todo», el candado de la base (`leogin_puede`) con capacidades y quién
 * puede recibir una caja.
 */
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const url = process.env.DINERO_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54601/postgres';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) {
  throw new Error('Esta suite sólo admite bases locales.');
}
const sql = new pg.Client({ connectionString: url });

beforeAll(async () => { await sql.connect(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await sql.query('begin'); });
afterEach(async () => { await sql.query('rollback'); });

async function one<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T> {
  const r = await sql.query(text, params);
  return r.rows[0] as T;
}

const CAJA = ['caja.cobrar', 'caja.abrir', 'caja.salida', 'caja.cerrar', 'caja.ver_esperado', 'caja.corregir', 'caja.devolver'];

async function convertir(role: string, perms: unknown) {
  const r = await one<{ v: string[] }>('select public.leogin_permisos_por_trabajo($1, $2::jsonb) as v', [role, perms === null ? null : JSON.stringify(perms)]);
  return r.v;
}

async function fixture() {
  const restaurant = randomUUID();
  await sql.query(`insert into restaurants (id, name, slug, status) values ($1, 'AUD 177', $2, 'active')`, [restaurant, `aud-177-${restaurant}`]);
  async function persona(nombre: string, role: string, perms: unknown, profileRole = 'RESTAURANT_STAFF') {
    const id = randomUUID();
    await sql.query(`insert into auth.users (id, email, instance_id, aud, role) values ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')`, [id, `aud-177-${id}@local.test`]);
    await sql.query(`insert into profiles (id, restaurant_id, role, full_name, permissions) values ($1, $2, $3, $4, $5::jsonb)
      on conflict (id) do update set restaurant_id = excluded.restaurant_id, role = excluded.role, full_name = excluded.full_name, permissions = excluded.permissions`,
      [id, restaurant, profileRole, nombre, perms === null ? null : JSON.stringify(perms)]);
    await sql.query(`insert into restaurant_members (user_id, restaurant_id, role, permissions, status) values ($1, $2, $3, $4::jsonb, 'active')`,
      [id, restaurant, role, perms === null ? null : JSON.stringify(perms)]);
    return id;
  }
  return { restaurant, persona };
}

async function comoUsuario<T>(userId: string, run: () => Promise<T>): Promise<T> {
  await sql.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated', aal: 'aal1' })]);
  await sql.query('set local role authenticated');
  try {
    return await run();
  } finally {
    await sql.query('reset role');
  }
}

describe('conversión de permisos (177)', () => {
  it('convierte null en la lista heredada completa, sin suscripción', async () => {
    const v = await convertir('STAFF', null);
    expect(v).toEqual(expect.arrayContaining(['finanzas', 'mesero', 'catalogo', ...CAJA]));
    expect(v).not.toContain('suscripcion');
    expect(v).not.toContain('personal');
  });

  it('al gerente le conserva administrar personal', async () => {
    expect(await convertir('MANAGER', null)).toContain('personal');
    expect(await convertir('MANAGER', ['pedidos'])).toEqual(['pedidos', 'personal']);
  });

  it('quien tenía Finanzas recibe toda la Caja y quien era mesero conserva el cobro', async () => {
    expect(await convertir('STAFF', ['finanzas'])).toEqual(['finanzas', ...CAJA]);
    expect(await convertir('STAFF', ['mesero'])).toEqual(['mesero', 'caja.cobrar']);
    expect(await convertir('STAFF', ['cocina'])).toEqual(['cocina']);
  });

  it('quita la suscripción y es idempotente', async () => {
    const una = await convertir('STAFF', ['pedidos', 'suscripcion', 'finanzas']);
    expect(una).not.toContain('suscripcion');
    expect(await convertir('STAFF', una)).toEqual(una);
  });

  it('infiere el puesto sólo cuando coincide exactamente', async () => {
    const puesto = async (p: unknown) => (await one<{ v: string | null }>('select public.leogin_puesto_inferido($1::jsonb) as v', [JSON.stringify(p)])).v;
    expect(await puesto(['caja.cobrar', 'mesero'])).toBe('mesero');
    expect(await puesto(['cocina'])).toBe('cocina');
    expect(await puesto(['cocina', 'inventario'])).toBeNull();
  });
});

describe('un null nuevo ya no significa todo (177)', () => {
  it('el disparador convierte un null que llegue de código anterior y lo marca como heredado', async () => {
    const { restaurant, persona } = await fixture();
    const id = await persona('AUD Nulo', 'STAFF', null);
    const m = await one<{ permissions: string[]; acceso_heredado: boolean }>(
      'select permissions, acceso_heredado from restaurant_members where user_id = $1 and restaurant_id = $2', [id, restaurant]);
    expect(m.acceso_heredado).toBe(true);
    expect(m.permissions).toEqual(expect.arrayContaining(CAJA));
    const p = await one<{ permissions: string[] }>('select permissions from profiles where id = $1', [id]);
    expect(Array.isArray(p.permissions)).toBe(true);
  });

  it('una lista explícita se respeta tal cual', async () => {
    const { restaurant, persona } = await fixture();
    const id = await persona('AUD Cocina', 'STAFF', ['cocina']);
    const m = await one<{ permissions: string[]; acceso_heredado: boolean }>(
      'select permissions, acceso_heredado from restaurant_members where user_id = $1 and restaurant_id = $2', [id, restaurant]);
    expect(m).toEqual({ permissions: ['cocina'], acceso_heredado: false });
  });
});

describe('candado de la base con capacidades (177)', () => {
  it('leogin_puede concede sólo lo que la lista dice', async () => {
    const { restaurant, persona } = await fixture();
    const cocina = await persona('AUD Cocina', 'STAFF', ['cocina']);
    const r = await comoUsuario(cocina, () => one<{ cocina: boolean; catalogo: boolean; caja: boolean }>(
      `select public.leogin_puede($1, 'cocina') as cocina, public.leogin_puede($1, 'catalogo') as catalogo,
              public.leogin_puede($1, 'caja.cobrar') as caja`, [restaurant]));
    expect(r).toEqual({ cocina: true, catalogo: false, caja: false });
  });

  it('el mesero del rol anterior conserva tomar pedidos y cobrar', async () => {
    const { restaurant, persona } = await fixture();
    const mesero = await persona('AUD Mesero', 'WAITER', null, 'RESTAURANT_WAITER');
    const r = await comoUsuario(mesero, () => one<{ mesero: boolean; cobrar: boolean; catalogo: boolean }>(
      `select public.leogin_puede($1, 'mesero') as mesero, public.leogin_puede($1, 'caja.cobrar') as cobrar,
              public.leogin_puede($1, 'catalogo') as catalogo`, [restaurant]));
    expect(r).toEqual({ mesero: true, cobrar: true, catalogo: false });
  });

  it('no concede nada en otro restaurante', async () => {
    const a = await fixture();
    const b = await fixture();
    const id = await a.persona('AUD Encargado', 'MANAGER', ['catalogo']);
    const r = await comoUsuario(id, () => one<{ v: boolean }>(`select public.leogin_puede($1, 'catalogo') as v`, [b.restaurant]));
    expect(r.v).toBe(false);
  });

  it('sólo quien abre caja puede recibir un traspaso', async () => {
    const { restaurant, persona } = await fixture();
    const abre = await persona('AUD Abre', 'STAFF', ['caja.abrir', 'caja.cerrar']);
    await persona('AUD Finanzas', 'STAFF', ['finanzas']);
    await persona('AUD Mesero', 'STAFF', ['mesero', 'caja.cobrar']);
    const rows = (await sql.query('select id from public.leogin_receptores_caja($1)', [restaurant])).rows.map((x) => x.id);
    expect(rows).toEqual([abre]);
  });
});
