// Corre seed/preparar-demo.sql contra el Supabase LOCAL.
//   npm run seed
// La conexión sale de PROMO_DB_URL o, si no está, del puerto local que usa
// plataforma/supabase/config.toml (54601). Se niega a tocar cualquier host
// que no sea local.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const url = process.env.PROMO_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54601/postgres';
const host = new URL(url).hostname;
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  console.error(`Solo se siembra la base local; ${host} no lo es.`);
  process.exit(1);
}

const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'seed', 'preparar-demo.sql'), 'utf8');
const cliente = new pg.Client({ connectionString: url });
cliente.on('notice', (n) => console.log(n.message));
await cliente.connect();
try {
  await cliente.query(sql);
} finally {
  await cliente.end();
}
