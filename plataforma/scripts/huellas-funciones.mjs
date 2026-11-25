/**
 * Huellas de las funciones críticas (dinero, cobro de Leogin y permisos).
 * ------------------------------------------------------------
 * Auditoría de lanzamiento 2026-11-23 (LZ-05 y §6). Una base puede decir
 * que tiene aplicada una migración y aun así ejecutar otra versión de la
 * función: pasó en local con la 164 (el cobro por plato sin el reparto de
 * centavos) y solo se notó porque fallaron cinco pruebas de dinero.
 *
 * La huella es el md5 del cuerpo de la función (sin retornos de carro), su
 * resultado, si es security definer y su configuración. No depende del
 * orden en que se aplicaron las migraciones ni de la versión de Postgres.
 *
 * Uso (desde plataforma/):
 *   node scripts/huellas-funciones.mjs              compara la base con lo esperado
 *   node scripts/huellas-funciones.mjs --escribir   regenera lo esperado desde una
 *                                                   base recién migrada
 * --escribir actualiza supabase/huellas_funciones.json y genera
 * supabase/verificar_huellas.sql, que se pega en el editor SQL de Supabase
 * para cotejar PRODUCCIÓN sin conectarse desde aquí.
 *
 * Conexión: HUELLAS_DATABASE_URL, si no DINERO_DATABASE_URL, si no el
 * Supabase local (127.0.0.1:54601). Solo acepta bases locales: producción
 * se coteja con el SQL generado.
 */
import pg from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ESPERADAS = join(raiz, 'supabase', 'huellas_funciones.json');
const SQL_PROD = join(raiz, 'supabase', 'verificar_huellas.sql');

/** Lo que se cobra, lo que se cuadra en caja y quién puede hacerlo. */
export const FUNCIONES_CRITICAS = [
  // Pedido y cobro en el local
  'leogin_crear_pedido',
  'leogin_contexto_pago_mesa',
  'leogin_cobrar_parte_mesa',
  'leogin_cobrar_parte_mesa_idempotente',
  'leogin_cerrar_cuenta_pagada',
  'leogin_recuperar_intento_cobro',
  // Caja
  'leogin_guardar_borrador_caja',
  'leogin_confirmar_cierre_caja',
  'leogin_confirmar_cierre_caja_con_recibo',
  'leogin_recuperar_cierre_caja',
  'leogin_solicitar_traspaso_caja',
  'leogin_confirmar_traspaso_caja',
  // Mensualidad de Leogin
  'leogin_catalog_plan_fee',
  'leogin_compute_monthly_fee',
  'leogin_confirmar_cambio_de_plan',
  'leogin_iniciar_prueba_de_plan',
  'leogin_confirmar_prueba_de_plan',
  'leogin_cambiar_plan_en_prueba',
  'leogin_motivo_sin_prueba',
  'leogin_validar_prueba_del_dueno',
  'leogin_cerrar_pruebas_voluntarias',
  'leogin_graduate_trials',
  'leogin_apply_auto_price',
  'leogin_apply_auto_price_all',
  'leogin_fijar_precio_vigente',
  'leogin_generate_monthly_invoices',
  'leogin_process_overdue',
  // Permisos
  'leogin_puede',
  'leogin_permisos_por_trabajo',
];

/** Misma expresión en la consulta local y en el SQL de producción. */
const HUELLA_SQL = `md5(replace(p.prosrc, chr(13), '') || '|' || pg_get_function_result(p.oid)
      || '|' || p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), ''))`;
const FIRMA_SQL = `p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'`;

/** { 'nombre(args)': huella } de las funciones críticas presentes en la base. */
export async function leerHuellas(client) {
  const { rows } = await client.query(
    `select ${FIRMA_SQL} as firma, ${HUELLA_SQL} as huella
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = any($1)
      order by 1`,
    [FUNCIONES_CRITICAS],
  );
  return Object.fromEntries(rows.map((r) => [r.firma, r.huella]));
}

export function leerEsperadas() {
  return JSON.parse(readFileSync(ESPERADAS, 'utf8')).funciones;
}

/** Diferencias legibles entre lo esperado y lo que tiene la base. */
export function compararHuellas(esperadas, actuales) {
  const problemas = [];
  for (const [firma, huella] of Object.entries(esperadas)) {
    if (!(firma in actuales)) problemas.push(`falta ${firma}`);
    else if (actuales[firma] !== huella) problemas.push(`difiere ${firma}`);
  }
  for (const firma of Object.keys(actuales)) {
    if (!(firma in esperadas)) problemas.push(`sin huella esperada ${firma}`);
  }
  return problemas;
}

export function urlLocal() {
  const url = process.env.HUELLAS_DATABASE_URL ?? process.env.DINERO_DATABASE_URL
    ?? 'postgresql://postgres:postgres@127.0.0.1:54601/postgres';
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) {
    throw new Error('Solo bases locales. Producción se coteja con supabase/verificar_huellas.sql.');
  }
  return url;
}

function sqlDeProduccion(funciones, migracion) {
  const valores = Object.entries(funciones)
    .map(([firma, huella]) => `    ('${firma.replace(/'/g, "''")}', '${huella}')`)
    .join(',\n');
  return `-- ============================================================
--  Huellas de las funciones críticas · hasta la migración ${migracion}
--  GENERADO por scripts/huellas-funciones.mjs --escribir. No editar a mano.
--  ------------------------------------------------------------
--  Pégalo en el editor SQL de Supabase (producción). Solo lee.
--  «coincide» = la función desplegada es la del repositorio.
--  «DIFIERE» o «FALTA» = no abras pedidos hasta aclararlo: falta aplicar
--  una migración o alguien cambió la función a mano.
-- ============================================================
with esperadas(firma, huella) as (
  values
${valores}
),
actuales as (
  select ${FIRMA_SQL} as firma,
         ${HUELLA_SQL} as huella
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
)
select e.firma,
       case when a.firma is null then 'FALTA'
            when a.huella = e.huella then 'coincide'
            else 'DIFIERE' end as estado
  from esperadas e left join actuales a on a.firma = e.firma
 order by (a.huella is not distinct from e.huella), e.firma;
`;
}

async function main() {
  const escribir = process.argv.includes('--escribir');
  const client = new pg.Client({ connectionString: urlLocal() });
  await client.connect();
  try {
    const actuales = await leerHuellas(client);
    if (escribir) {
      const { rows } = await client.query('select max(version) as v from supabase_migrations.schema_migrations');
      const migracion = rows[0]?.v ?? '¿?';
      writeFileSync(ESPERADAS, `${JSON.stringify({ hasta_migracion: migracion, funciones: actuales }, null, 2)}\n`);
      writeFileSync(SQL_PROD, sqlDeProduccion(actuales, migracion));
      console.log(`Huellas de ${Object.keys(actuales).length} funciones escritas (hasta la migración ${migracion}).`);
      return;
    }
    const problemas = compararHuellas(leerEsperadas(), actuales);
    if (problemas.length) {
      console.error(`Huellas que no coinciden:\n  ${problemas.join('\n  ')}`);
      console.error('Si cambiaste una de estas funciones en una migración, regenera con --escribir sobre una base recién migrada.');
      process.exitCode = 1;
    } else {
      console.log(`Las ${Object.keys(actuales).length} funciones críticas coinciden con el repositorio.`);
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exitCode = 1; });
}
