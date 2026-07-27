/**
 * Auditoría de funciones SECURITY DEFINER ejecutables por anon/authenticated.
 * ------------------------------------------------------------
 * El 22 de julio se encontró que 38 de 43 funciones `security definer` eran
 * ejecutables directamente por cualquiera con la clave `anon` (pública, va en
 * el JS del navegador) vía POST /rest/v1/rpc/<nombre> — saltándose por
 * completo la server action de Next.js y sus validaciones de rol/restaurante.
 * Se corrigió en la migración 084 (revoke explícito + `alter default
 * privileges` para que las funciones nuevas no hereden el problema).
 *
 * Este script vuelve a correr esa misma pregunta contra la base real, en
 * cualquier momento — no depende de recordar qué migración tocó qué función.
 *
 * Uso:  node scripts/audit-security-definer.mjs
 * Conexión: usa SUPABASE_DB_URL si está en el entorno o en .env.local; si no,
 * usa el default de Supabase local (postgresql://postgres:postgres@127.0.0.1:54601/postgres).
 * Sale con código 1 si encuentra alguna función fuera de la lista permitida.
 */
import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch { /* usa variables del sistema */ }
}
loadEnvLocal();

const LOCAL_DEFAULT = 'postgresql://postgres:postgres@127.0.0.1:54601/postgres';
const dbUrl = process.env.SUPABASE_DB_URL || LOCAL_DEFAULT;

/**
 * Funciones que SÍ deben quedar ejecutables por anon/authenticated, con su
 * porqué. Cualquier función security definer fuera de esta lista con acceso
 * anon/authenticated es un hallazgo — revísala y, si de verdad no debería ser
 * pública, aplica el mismo patrón de la migración 084 (revoke + grant a
 * service_role).
 */
const ALLOWLIST = {
  get_my_role: 'usada dentro de políticas RLS',
  get_my_restaurant_id: 'usada dentro de políticas RLS',
  get_my_org_id: 'usada dentro de políticas RLS',
  is_my_group_branch: 'usada dentro de políticas RLS',
  get_group_branches: 'selector de sucursal anónimo, público por diseño desde la migración 026',
};

async function main() {
  console.log(`\n🔎 Auditoría de funciones SECURITY DEFINER  ·  ${dbUrl.replace(/:[^:@]*@/, ':****@')}\n`);
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  const { rows } = await client.query(`
    select
      p.proname,
      pg_get_function_identity_arguments(p.oid) as args,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
      has_function_privilege('service_role', p.oid, 'EXECUTE') as service_exec
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef = true
    order by p.proname, args;
  `);
  await client.end();

  console.log(`Funciones SECURITY DEFINER en public: ${rows.length}\n`);

  const findings = [];
  for (const r of rows) {
    const exposed = r.anon_exec || r.auth_exec;
    if (!exposed) continue;
    if (r.proname in ALLOWLIST) {
      console.log(`  · ${r.proname}(${r.args}) — pública a propósito (${ALLOWLIST[r.proname]})`);
    } else {
      findings.push(r);
      console.log(`  ✗ HALLAZGO: ${r.proname}(${r.args}) — anon=${r.anon_exec} authenticated=${r.auth_exec} (debería ser solo service_role)`);
    }
  }

  console.log('\n────────────────────────────────────────');
  if (findings.length === 0) {
    console.log(`  Resultado: 0 hallazgos (${Object.keys(ALLOWLIST).length} funciones públicas por diseño, el resto correctamente restringido a service_role)`);
  } else {
    console.log(`  Resultado: ${findings.length} hallazgo(s) — revisar y aplicar el patrón de la migración 084:`);
    for (const r of findings) {
      console.log(`    revoke execute on function public.${r.proname}(${r.args}) from public, anon, authenticated;`);
      console.log(`    grant execute on function public.${r.proname}(${r.args}) to service_role;`);
    }
  }
  console.log('────────────────────────────────────────\n');

  process.exit(findings.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\n✗ Error ejecutando la auditoría:', e.message);
  process.exit(1);
});
