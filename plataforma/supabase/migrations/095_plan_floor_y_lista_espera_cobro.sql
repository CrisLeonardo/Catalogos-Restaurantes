-- ============================================================
--  Migración 095 — El PLAN es la única verdad sobre qué incluye
--  cada restaurante, y "Lista de espera" entra al cobro
--  ------------------------------------------------------------
--  Tres defectos encontrados en la auditoría del 2026-07-29, los
--  tres con la misma raíz: listas de módulos escritas a mano en
--  varios sitios que se fueron desincronizando entre sí.
--
--  1) TITULARIDAD POR DEBAJO DEL PLAN (el cliente paga y no lo ve)
--     El panel lee restaurants.modules (jsonb, escrito a mano desde
--     el super admin y en el alta self-serve), no el plan. Cuando el
--     jsonb se quedaba corto, la función NO aparecía: el nav la
--     oculta por completo si el plan la incluye pero la bandera está
--     en false (lockableNavItem devuelve [] en ese caso — ni
--     candado ni acceso). Caso real: el alta self-serve de Premium
--     ponía reservaciones, lista_espera y loyalty en false mientras
--     /planes vendía "7 módulos incluidos gratis".
--     → Se añade un trigger que aplica el PISO del plan sobre
--       modules en cada insert/update. Solo AÑADE lo que el plan
--       promete; nunca quita lo que se haya habilitado a mano
--       (los módulos a la carta comprados siguen intactos).
--
--  2) "LISTA DE ESPERA" NUNCA SE COBRÓ
--     Se añadió en la mig. 087, después de que la 078 dejara
--     escritas a mano las listas de módulos. Quedó fuera de las
--     TRES: del bucle de leogin_billed_addon_modules, del trigger
--     de bitácora leogin_log_module_change, y de
--     leogin_module_included_in_plan. Además nunca se insertó
--     module_price_lista_espera en platform_settings.
--     Resultado: se ofrece a Q49/mes en /planes, la UI muestra Q49
--     (plans.ts cae al default) y la base factura Q0 — a todo el
--     mundo, en todos los planes.
--
--  3) PREMIUM NO INCLUÍA lista_espera EN SQL
--     leogin_module_included_in_plan omitía lista_espera en PREMIUM
--     mientras INCLUDED_MODULES (plans.ts) sí lo incluye.
--
--  IMPACTO EN EL COBRO: el piso del plan solo enciende módulos que
--  ese plan YA incluye gratis, así que no genera cargos nuevos
--  (leogin_billed_addon_modules cobra solo lo NO incluido). El
--  único cambio de importe es lista_espera para quien lo tenga a la
--  carta fuera de Premium/Pro: pasa de Q0 a Q49, que es el precio
--  publicado. Revisa la consulta del final antes de dar por bueno
--  el corte del mes.
--
--  Idempotente; seguro de re-ejecutar. Ejecutar tras 001..094.
-- ============================================================

-- ── 1. Precio de lista_espera (faltaba por completo) ─────────
insert into platform_settings (key, value)
values ('module_price_lista_espera', '49')
on conflict (key) do nothing;   -- si ya lo pusiste a mano, se respeta

-- ── 2. Premium incluye lista_espera (alinea con INCLUDED_MODULES) ──
create or replace function leogin_module_included_in_plan(p_plan text, p_key text)
returns boolean language sql immutable as $$
  select case
    when p_plan = 'PRO'     then true
    when p_plan = 'PREMIUM' then p_key in ('llamada_mesero','encuestas','cupones','loyalty',
                                           'recetas','reservaciones','lista_espera')
    else false
  end;
$$;

comment on function leogin_module_included_in_plan(text, text) is
  'Módulos que un plan incluye sin costo extra. Espejo de INCLUDED_MODULES en src/lib/plans.ts: si cambias uno, cambia el otro.';

-- ── 3. Lista única de módulos a la carta ─────────────────────
--    Antes el array iba copiado a mano en 3 funciones distintas y
--    fue justo así como lista_espera se quedó fuera de las tres.
create or replace function leogin_addon_module_keys()
returns text[] language sql immutable as $$
  select array['reservaciones','lista_espera','llamada_mesero','encuestas',
               'cupones','loyalty','recetas','proveedores','fel'];
$$;

comment on function leogin_addon_module_keys() is
  'Fuente única de los módulos a la carta. Espejo de ACTIVATABLE_MODULES en src/lib/modules.ts. Añadir un módulo nuevo aquí basta para que entre a bitácora y cobro.';

-- ── 4. Bitácora: el trigger ahora cubre todos los módulos ────
create or replace function leogin_log_module_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_key    text;
  v_old_on boolean;
  v_new_on boolean;
begin
  foreach v_key in array leogin_addon_module_keys() loop
    v_old_on := coalesce((old.modules->>v_key)::boolean, false)
                and coalesce((old.module_settings->v_key->>'enabled')::boolean, true);
    v_new_on := coalesce((new.modules->>v_key)::boolean, false)
                and coalesce((new.module_settings->v_key->>'enabled')::boolean, true);
    if v_old_on is distinct from v_new_on then
      insert into restaurant_module_log (restaurant_id, module_key, is_active)
      values (new.id, v_key, v_new_on);
    end if;
  end loop;
  return new;
end;
$$;

-- Backfill de lista_espera: fechado 2 meses atrás con el estado actual,
-- mismo criterio que la 078 — nadie gana ni pierde cobro por no tener
-- historial previo.
insert into restaurant_module_log (restaurant_id, module_key, is_active, changed_at)
select r.id,
       'lista_espera',
       coalesce((r.modules->>'lista_espera')::boolean, false)
         and coalesce((r.module_settings->'lista_espera'->>'enabled')::boolean, true),
       now() - interval '2 months'
  from restaurants r
 where not exists (
   select 1 from restaurant_module_log l
    where l.restaurant_id = r.id and l.module_key = 'lista_espera'
 );

-- ── 5. Cobro: mismo bucle único ──────────────────────────────
create or replace function leogin_billed_addon_modules(
  p_restaurant_id uuid,
  p_period_start date default date_trunc('month', (now() at time zone 'UTC'))::date
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_window_start timestamptz := (p_period_start - interval '1 month');
  v_window_end   timestamptz := p_period_start;
  v_plan    text;
  v_modules jsonb;
  v_key     text;
  v_price   numeric;
  v_total   numeric := 0;
  v_items   jsonb := '[]'::jsonb;
begin
  select plan_actual, modules into v_plan, v_modules from restaurants where id = p_restaurant_id;
  if v_modules is null or v_plan is null then
    return jsonb_build_object('total', 0, 'items', '[]'::jsonb);
  end if;

  foreach v_key in array leogin_addon_module_keys() loop
    if coalesce((v_modules->>v_key)::boolean, false)
       and not leogin_module_included_in_plan(v_plan, v_key)
       and leogin_module_off_fraction(p_restaurant_id, v_key, v_window_start, v_window_end) < 0.75 then
      v_price := leogin_setting_num('module_price_' || v_key, 0);
      v_total := v_total + v_price;
      v_items := v_items || jsonb_build_object('key', v_key, 'price', v_price);
    end if;
  end loop;

  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

-- ── 6. Piso del plan: modules nunca por debajo de lo vendido ──
create or replace function leogin_plan_module_floor(p_plan text)
returns jsonb language sql immutable as $$
  select jsonb_build_object('catalog', true)
      || case p_plan
           when 'BASICO'   then '{}'::jsonb
           when 'ESTANDAR' then '{"orders":true,"whatsapp_notify":true,"finanzas":true}'::jsonb
           else '{"orders":true,"whatsapp_notify":true,"finanzas":true,
                  "analitica":true,"inventario":true,"personal":true}'::jsonb
         end
      || coalesce((
           select jsonb_object_agg(k, true)
             from unnest(leogin_addon_module_keys()) k
            where leogin_module_included_in_plan(p_plan, k)
         ), '{}'::jsonb);
$$;

comment on function leogin_plan_module_floor(text) is
  'Banderas de restaurants.modules que un plan GARANTIZA. Espejo de withPlanFloor() en src/lib/plans.ts. Solo contiene claves en true: se aplica con || y por eso nunca apaga nada.';

create or replace function leogin_apply_plan_floor()
returns trigger language plpgsql set search_path = public as $$
begin
  -- El piso va PRIMERO y modules después: lo habilitado a mano (módulos a la
  -- carta comprados) gana, y el piso solo rellena lo que faltaba.
  new.modules := leogin_plan_module_floor(coalesce(new.plan_actual, 'BASICO'))
                 || coalesce(new.modules, '{}'::jsonb);
  -- Pero el piso no es negociable: lo que el plan incluye vuelve a true aunque
  -- venga false desde la app (formulario viejo, script, importación).
  new.modules := new.modules || leogin_plan_module_floor(coalesce(new.plan_actual, 'BASICO'));
  return new;
end;
$$;

comment on function leogin_apply_plan_floor() is
  'Trigger de restaurants: garantiza que modules incluya siempre lo que el plan promete. Se puso en la base (y no solo en la app) porque hay varios caminos que escriben modules —alta self-serve, super admin, duplicar restaurante, scripts— y basta que uno se olvide para que el cliente pague algo que su panel no le muestra.';

drop trigger if exists trg_restaurant_plan_floor on restaurants;
create trigger trg_restaurant_plan_floor
  before insert or update of plan_actual, modules on restaurants
  for each row
  execute function leogin_apply_plan_floor();

-- ── 7. Reconciliar los restaurantes que ya existen ───────────
--    Un update sin cambios reales dispara el trigger de arriba.
update restaurants
   set modules = modules
 where modules is distinct from (leogin_plan_module_floor(coalesce(plan_actual,'BASICO')) || coalesce(modules,'{}'::jsonb));

-- ── 8. Refrescar la mensualidad automática con la fórmula nueva ──
select leogin_apply_auto_price_all();

-- ── 9. REVISIÓN MANUAL — a quién le cambia el importe ────────
--    Ejecuta esto después de la migración: son los restaurantes a
--    los que lista_espera empieza a facturarse (antes Q0).
--
--  select r.slug, r.name, r.plan_actual,
--         leogin_setting_num('module_price_lista_espera', 49) as nuevo_cargo
--    from restaurants r
--   where coalesce((r.modules->>'lista_espera')::boolean, false)
--     and not leogin_module_included_in_plan(r.plan_actual, 'lista_espera')
--   order by r.name;
