import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

function localUrl(value: string | undefined, label: string) {
  if (!value) throw new Error(`Falta ${label}; consulta la guía de la suite de dinero.`);
  const parsed = new URL(value);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) {
    throw new Error(`${label} debe apuntar a loopback. Esta suite solo admite bases locales.`);
  }
  return value;
}

const apiUrl = localUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL');
export const sqlUrl = localUrl(process.env.DINERO_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54601/postgres', 'DINERO_DATABASE_URL');
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY local.');
export const db = createClient(apiUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
export const sql = new pg.Client({ connectionString: sqlUrl });
export const actors = new AsyncLocalStorage<string>();
export const state = {
  restaurantId: '', slug: '', users: [] as string[],
  beforeFetch: null as null | ((url: URL, method: string) => Promise<void>),
  afterFetch: null as null | ((url: URL, method: string, response: Response) => Promise<void>),
};
const nativeFetch = globalThis.fetch;
export async function controlledFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  localUrl(url.href, 'Destino HTTP de la prueba');
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
  await state.beforeFetch?.(url, method);
  // Toda respuesta y toda escritura son reales. Los puntos de control solo
  // programan intercalados o pierden un acuse DESPUÉS del commit de PostgREST.
  const response = await nativeFetch(input, init);
  await state.afterFetch?.(url, method, response);
  return response;
}

export function actor<T>(index: number, run: () => Promise<T>) {
  return actors.run(state.users[index], run);
}
export function currentActor() {
  const id = actors.getStore() ?? state.users[0];
  if (!id || !state.restaurantId) throw new Error('No hay fixture de caja activo.');
  return id;
}
export function cajaContext(restaurantId: string) {
  if (restaurantId !== state.restaurantId) throw new Error('El caso intentó operar fuera de su fixture.');
  return { db, tz: 'America/Guatemala', corte: 300, slug: state.slug,
    userId: currentActor(), cashierName: 'AUD Dinero', firmaSola: true };
}

export function checked<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export async function createRestaurant() {
  state.slug = `aud-dinero-${randomUUID()}`;
  const row = checked(await db.from('restaurants').insert({
    name: 'AUD Dinero', slug: state.slug, status: 'active', timezone: 'America/Guatemala', day_cutoff_minutes: 300,
  }).select('id').single());
  if (!row) throw new Error('No se devolvió el restaurante temporal.');
  state.restaurantId = row.id;
  const sameDatabase = await sql.query('select id from public.restaurants where id=$1', [row.id]);
  if (sameDatabase.rowCount !== 1) throw new Error('SQL y PostgREST no apuntan a la misma base.');
}

export async function order(amounts: number[], opts: { total?: number; tip?: number; discount?: number; at?: string; table?: number } = {}) {
  const subtotal = amounts.reduce((a, b) => a + b, 0);
  const row = checked(await db.from('orders').insert({
    restaurant_id: state.restaurantId, order_number: `AUD-${randomUUID()}`,
    customer_name: 'AUD Dinero', customer_phone: '00000000', order_type: 'DINE_IN',
    table_number: opts.table ?? 1, address: `Mesa ${opts.table ?? 1}`, status: 'SERVED',
    subtotal, total: opts.total ?? subtotal, tip: opts.tip ?? 0, discount: opts.discount ?? 0,
    ...(opts.at ? { created_at: opts.at } : {}),
  }).select('*').single());
  const items = checked(await db.from('order_items').insert(amounts.map((amount) => ({
    order_id: row.id, name_snapshot: 'AUD Platillo', price_snapshot: amount, quantity: 1, subtotal: amount,
  }))).select('*'));
  return { ...row, items: items!, voids: [] };
}

export async function ledger(orderId?: string) {
  let query = db.from('order_payments').select('*').eq('restaurant_id', state.restaurantId).order('created_at');
  if (orderId) query = query.eq('order_id', orderId);
  return checked(await query)!;
}
export const cents = (amount: number) => Math.round(amount * 100);
export const net = (rows: { amount: number }[]) => rows.reduce((sum, row) => sum + cents(Number(row.amount)), 0);

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

export async function bounded(promise: Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('No se alcanzó el punto de concurrencia previsto.')), 8_000);
    })]);
  } finally { clearTimeout(timer); }
}

/** Espera un bloqueo observado en Postgres, nunca un sleep como prueba de carrera. */
export async function waitForBlockedPayment(blockerPid: number) {
  const observer = new pg.Client({ connectionString: sqlUrl });
  await observer.connect();
  try {
    const until = Date.now() + 8_000;
    while (Date.now() < until) {
      const found = await observer.query<{ n: number }>(
        "select count(*)::int n from pg_stat_activity where $1 = any(pg_blocking_pids(pid)) and query ilike '%order_payments%'", [blockerPid],
      );
      if (found.rows[0].n > 0) return;
      await new Promise((done) => setTimeout(done, 20));
    }
    throw new Error('El INSERT de pago no llegó al bloqueo previsto; carrera no ejecutada.');
  } finally { await observer.end(); }
}
