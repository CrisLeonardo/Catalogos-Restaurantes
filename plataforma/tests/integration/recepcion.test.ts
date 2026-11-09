/**
 * Migración 178 · recepción, contra Postgres real: ocupación por franja,
 * capacidad bajo bloqueo (dos reservas a la vez), sobrecupo forzado con
 * bitácora, reprogramar y los estados nuevos. Deja la base como la encontró.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const url = process.env.DINERO_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54601/postgres';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) throw new Error('Sólo bases locales.');
const sql = new pg.Client({ connectionString: url });
const otra = new pg.Client({ connectionString: url });
const restaurantes: string[] = [];
const ACTOR = randomUUID();

beforeAll(async () => { await sql.connect(); await otra.connect(); });
afterAll(async () => {
  if (restaurantes.length) {
    await sql.query('delete from activity_log where restaurant_id = any($1)', [restaurantes]);
    await sql.query('delete from reservations where restaurant_id = any($1)', [restaurantes]);
    await sql.query('delete from waitlist_entries where restaurant_id = any($1)', [restaurantes]);
    await sql.query('delete from restaurants where id = any($1)', [restaurantes]);
  }
  await sql.end(); await otra.end();
});

async function local(duracion = 90) {
  const id = randomUUID();
  await sql.query(`insert into restaurants (id, name, slug, status, duracion_reserva_min) values ($1, 'AUD 178', $2, 'active', $3)`,
    [id, `aud-178-${id}`, duracion]);
  restaurantes.push(id);
  return id;
}
async function reserva(r: string, hora: string, pax: number, status = 'CONFIRMED', fecha = '2026-12-01') {
  const { rows } = await sql.query(`insert into reservations (restaurant_id, customer_name, party_size, date, time, status)
    values ($1, 'AUD', $2, $3, $4, $5) returning id`, [r, pax, fecha, hora, status]);
  return rows[0].id as string;
}
async function ocupacion(r: string, hora: string, excluir: string | null = null) {
  const { rows } = await sql.query('select public.leogin_ocupacion_reservas($1, $2, $3, 90, $4) as n', [r, '2026-12-01', hora, excluir]);
  return rows[0].n as number;
}
function guardar(c: pg.Client, r: string, o: { id?: string; pax: number; hora: string; aforo: number | null; forzar?: boolean }) {
  return c.query(`select public.leogin_guardar_reserva($1, $2, 'AUD Grupo', null, $3, '2026-12-01', $4, null, $5, $6, $7) as res`,
    [r, o.id ?? null, o.pax, o.hora, o.aforo, o.forzar ?? false, ACTOR]).then((x) => x.rows[0].res);
}

describe('ocupación por franja (178)', () => {
  it('cuenta las personas a la vez, no la suma de todo lo que se cruza', async () => {
    const r = await local();
    await reserva(r, '20:00', 4);
    await reserva(r, '21:00', 6);
    await reserva(r, '22:30', 8);
    // A las 20:30 hay 4; a las 21:00 coinciden 4 + 6. La de 22:30 no se cruza con [20:30, 22:00).
    expect(await ocupacion(r, '20:30')).toBe(10);
    expect(await ocupacion(r, '18:00')).toBe(0);
  });

  it('no cuenta canceladas, completadas ni «no asistió»', async () => {
    const r = await local();
    await reserva(r, '20:00', 4, 'CANCELLED');
    await reserva(r, '20:00', 4, 'COMPLETED');
    await reserva(r, '20:00', 4, 'NO_SHOW');
    await reserva(r, '20:00', 2, 'PENDING');
    expect(await ocupacion(r, '20:00')).toBe(2);
  });
});

describe('guardar con capacidad (178)', () => {
  it('rechaza el sobrecupo sin escribir y devuelve los lugares libres', async () => {
    const r = await local();
    await reserva(r, '20:00', 34);
    const res = await guardar(sql, r, { pax: 8, hora: '20:00', aforo: 40 });
    expect(res).toMatchObject({ ok: false, sobrecupo: true, libres: 6, ocupadas: 34, aforo: 40 });
    const { rows } = await sql.query('select count(*)::int as n from reservations where restaurant_id = $1', [r]);
    expect(rows[0].n).toBe(1);
  });

  it('forzar guarda y deja constancia en la bitácora', async () => {
    const r = await local();
    await reserva(r, '20:00', 34);
    const res = await guardar(sql, r, { pax: 8, hora: '20:00', aforo: 40, forzar: true });
    expect(res).toMatchObject({ ok: true, sobrecupo: true, ocupadas: 42 });
    const { rows } = await sql.query(`select meta from activity_log where restaurant_id = $1 and action = 'reserva_sobrecupo'`, [r]);
    expect(rows).toHaveLength(1);
    expect(rows[0].meta).toMatchObject({ personas: 8, ocupadas: 34, aforo: 40 });
  });

  it('sin aforo conocido no comprueba capacidad', async () => {
    const r = await local();
    await reserva(r, '20:00', 90);
    expect(await guardar(sql, r, { pax: 50, hora: '20:00', aforo: null })).toMatchObject({ ok: true, sobrecupo: false });
  });

  it('reprogramar no se cuenta a sí misma y respeta la duración del local', async () => {
    const r = await local(60);
    const id = await reserva(r, '20:00', 30);
    await reserva(r, '21:30', 10);
    // Mover la de 30 a las 21:00 con duración 60: a las 21:30 coinciden 30 + 10 = 40, cabe justo.
    expect(await guardar(sql, r, { id, pax: 30, hora: '21:00', aforo: 40 })).toMatchObject({ ok: true, sobrecupo: false });
    const { rows } = await sql.query('select time from reservations where id = $1', [id]);
    expect(rows[0].time).toBe('21:00:00');
  });

  it('no reprograma una reserva ya sentada', async () => {
    const r = await local();
    const id = await reserva(r, '20:00', 2, 'SEATED');
    await expect(guardar(sql, r, { id, pax: 2, hora: '21:00', aforo: 40 })).rejects.toThrow(/pendiente o confirmada/);
  });

  it('dos reservas a la vez no superan el aforo: la segunda ve la primera', async () => {
    const r = await local();
    await reserva(r, '20:00', 30);
    await sql.query('begin');
    await otra.query('begin');
    try {
      const primera = await guardar(sql, r, { pax: 8, hora: '20:00', aforo: 40 });
      // La segunda queda esperando el bloqueo hasta que la primera termine.
      const segunda = guardar(otra, r, { pax: 8, hora: '20:00', aforo: 40 });
      await new Promise((ok) => setTimeout(ok, 150));
      await sql.query('commit');
      expect(primera).toMatchObject({ ok: true });
      expect(await segunda).toMatchObject({ ok: false, sobrecupo: true, libres: 2 });
      await otra.query('commit');
    } catch (e) {
      await sql.query('rollback').catch(() => {});
      await otra.query('rollback').catch(() => {});
      throw e;
    }
  });
});

describe('estados y aviso (178)', () => {
  it('acepta «no asistió» y el aviso confirmado, y rechaza un medio inventado', async () => {
    const r = await local();
    await reserva(r, '20:00', 2, 'NO_SHOW');
    const { rows } = await sql.query(`insert into waitlist_entries (restaurant_id, customer_name, party_size, status, notified_via, aviso_abierto_at)
      values ($1, 'AUD', 2, 'NOTIFIED', 'whatsapp', now()) returning id`, [r]);
    await sql.query(`update waitlist_entries set status = 'NO_SHOW' where id = $1`, [rows[0].id]);
    await expect(sql.query(`update waitlist_entries set notified_via = 'entregado' where id = $1`, [rows[0].id]))
      .rejects.toThrow(/notified_via_check/);
  });
});
