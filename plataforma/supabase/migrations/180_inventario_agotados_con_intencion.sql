-- ============================================================
--  180 · Inventario con cobertura y agotados con intención
--  (auditoría 1.10: E11, N20, R11, O04, F17)
--  ------------------------------------------------------------
--  Plan: docs/planes/PLAN_INVENTARIO_2026-11-09.md
--
--    1. Agotar dice HASTA CUÁNDO: «hasta mañana» (vuelve a la hora de
--       corte del siguiente día de negocio), «hasta reponer» (vuelve al
--       haber existencias) o «hasta que lo active». Desaparece el reloj
--       fijo de 12 h. Un disparador mantiene la intención coherente en
--       CUALQUIER escritura, también las que no la conocen (place_order,
--       anulaciones, el lote de la 179): lo agotado sin intención queda
--       «hasta mañana» (decisión del dueño, 2026-11-09) y lo que se quedó
--       sin existencias, «hasta reponer».
--    2. Agotar por ingrediente: «se acabó el aguacate» apaga los platillos
--       que lo llevan; «ya hay» los devuelve si no les falta otro.
--    3. Ajustar existencias en una sola operación bajo bloqueo, con motivo
--       (obligatorio al restar o fijar), nota y responsable.
--    4. Activar el control de varios platillos a la vez, todo o nada.
--
--  Los agotados de hoy CONSERVAN lo que se les prometió: vuelven a las
--  12 h de marcados (decisión del dueño, 2026-11-09).
--
--  ORDEN: aplicar ANTES de desplegar el código de la 1.10, después de la 179.
--  Idempotente.
-- ============================================================
begin;

-- ── 1. Columnas ────────────────────────────────────────────────────────
alter table public.products
  add column if not exists agotado_motivo text,
  add column if not exists vuelve_at timestamptz;
alter table public.products drop constraint if exists products_agotado_motivo_check;
alter table public.products add constraint products_agotado_motivo_check
  check (agotado_motivo is null or agotado_motivo in ('manana', 'reponer', 'manual', 'ingrediente'));

alter table public.ingredients add column if not exists agotado_at timestamptz;
alter table public.stock_movements add column if not exists nota text;

-- ── 2. Inicio del siguiente día de negocio del local ──────────────────
--  Mismo criterio que lib/caja/dia.ts: lo anterior a la hora de corte
--  pertenece al día de antes.
create or replace function public.leogin_inicio_proximo_dia(p_restaurant uuid, p_desde timestamptz default now())
returns timestamptz language sql stable set search_path = '' as $$
  with r as (
    select coalesce(nullif(btrim(timezone), ''), 'America/Guatemala') as tz,
           least(720, greatest(0, coalesce(day_cutoff_minutes, 300)))::int as corte
      from public.restaurants where id = p_restaurant
  )
  select ((((p_desde at time zone r.tz) - make_interval(mins => r.corte))::date + 1)::timestamp
          + make_interval(mins => r.corte)) at time zone r.tz
    from r
$$;

-- ── 3. Conversión de los agotados actuales (antes del disparador) ─────
update public.products
   set agotado_motivo = case
         when track_stock and coalesce(stock, 0) <= 0 then 'reponer'
         when unavailable_at is not null then 'manana'
         else 'manual' end,
       vuelve_at = case
         when not (track_stock and coalesce(stock, 0) <= 0) and unavailable_at is not null
           then unavailable_at + interval '12 hours' end
 where is_available = false and agotado_motivo is null;

-- ── 4. Intención coherente en cualquier escritura ─────────────────────
--  SECURITY DEFINER para leer la zona y el corte del local aunque escriba
--  una sesión sin acceso a `restaurants`; no se puede llamar por RPC (es de
--  disparador) y además nadie tiene EXECUTE (los disparadores no lo piden).
create or replace function public.leogin_agotado_coherente()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_available is distinct from false then
    -- Disponible: nada que recordar.
    new.agotado_motivo := null;
    new.vuelve_at := null;
    return new;
  end if;

  -- Volvieron las existencias de algo agotado «hasta reponer».
  if tg_op = 'UPDATE' and new.agotado_motivo = 'reponer' and new.track_stock
     and coalesce(old.stock, 0) <= 0 and coalesce(new.stock, 0) > 0 then
    new.is_available := true;
    new.agotado_motivo := null;
    new.vuelve_at := null;
    new.unavailable_at := null;
    return new;
  end if;

  -- Agotado por alguien que no dijo hasta cuándo.
  if new.agotado_motivo is null then
    if new.track_stock and coalesce(new.stock, 0) <= 0 then
      new.agotado_motivo := 'reponer';
      new.vuelve_at := null;
    else
      new.agotado_motivo := 'manana';
      new.vuelve_at := public.leogin_inicio_proximo_dia(new.restaurant_id);
    end if;
  end if;
  if new.agotado_motivo <> 'manana' then new.vuelve_at := null; end if;
  if new.unavailable_at is null then new.unavailable_at := now(); end if;
  return new;
end;
$$;
drop trigger if exists leogin_agotado_coherente on public.products;
create trigger leogin_agotado_coherente before insert or update on public.products
  for each row execute function public.leogin_agotado_coherente();

-- ── 5. Agotar con intención ───────────────────────────────────────────
create or replace function public.leogin_marcar_agotado(
  p_restaurant uuid, p_ids uuid[], p_hasta text, p_actor uuid
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_n integer;
  v_vuelve timestamptz;
begin
  if p_hasta not in ('manana', 'reponer', 'manual') then
    raise exception 'Elige hasta cuándo queda agotado.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_ids), 0) = 0 or cardinality(p_ids) > 500 then
    raise exception 'Elige entre 1 y 500 platillos.' using errcode = '22023';
  end if;
  v_vuelve := case when p_hasta = 'manana' then public.leogin_inicio_proximo_dia(p_restaurant) end;

  update public.products
     set is_available = false, agotado_motivo = p_hasta, vuelve_at = v_vuelve,
         unavailable_at = clock_timestamp()
   where restaurant_id = p_restaurant and id = any(p_ids);
  get diagnostics v_n = row_count;
  if v_n <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'Algún platillo ya no existe. Actualiza la página.' using errcode = 'LGD01';
  end if;

  insert into public.activity_log (restaurant_id, actor_id, action, entity, meta)
  select p_restaurant, p_actor, 'agotado', name, jsonb_build_object('hasta', p_hasta, 'vuelve', v_vuelve, 'productId', id)
    from public.products where restaurant_id = p_restaurant and id = any(p_ids);

  return jsonb_build_object('ok', true, 'agotados', v_n, 'vuelve', v_vuelve);
end;
$$;

-- ── 6. Agotar o reponer un ingrediente ────────────────────────────────
create or replace function public.leogin_agotar_ingrediente(
  p_restaurant uuid, p_ingrediente uuid, p_agotado boolean, p_actor uuid
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_nombre text;
  v_ids uuid[];
begin
  select name into v_nombre from public.ingredients
   where id = p_ingrediente and restaurant_id = p_restaurant for update;
  if v_nombre is null then
    raise exception 'Ese ingrediente ya no existe.' using errcode = 'LGD01';
  end if;

  if p_agotado then
    update public.ingredients set agotado_at = coalesce(agotado_at, clock_timestamp()) where id = p_ingrediente;
    -- Sólo los que hoy se pueden pedir: lo agotado por otra razón conserva la suya.
    with afectados as (
      update public.products p
         set is_available = false, agotado_motivo = 'ingrediente', vuelve_at = null, unavailable_at = clock_timestamp()
       where p.restaurant_id = p_restaurant and p.is_active
         and (p.is_available or (p.vuelve_at is not null and p.vuelve_at <= now()))
         and exists (select 1 from public.recipe_items ri where ri.product_id = p.id and ri.ingredient_id = p_ingrediente)
      returning p.id
    ) select coalesce(array_agg(id), '{}') into v_ids from afectados;
  else
    update public.ingredients set agotado_at = null where id = p_ingrediente;
    -- Vuelven los agotados por ingrediente a los que ya no les falta ninguno.
    with vuelven as (
      update public.products p
         set is_available = true
       where p.restaurant_id = p_restaurant and p.agotado_motivo = 'ingrediente'
         and exists (select 1 from public.recipe_items ri where ri.product_id = p.id and ri.ingredient_id = p_ingrediente)
         and not exists (
           select 1 from public.recipe_items ri join public.ingredients i on i.id = ri.ingredient_id
            where ri.product_id = p.id and i.agotado_at is not null)
      returning p.id
    ) select coalesce(array_agg(id), '{}') into v_ids from vuelven;
  end if;

  insert into public.activity_log (restaurant_id, actor_id, action, entity, meta)
  values (p_restaurant, p_actor, case when p_agotado then 'ingrediente_agotado' else 'ingrediente_repuesto' end,
          v_nombre, jsonb_build_object('ingredientId', p_ingrediente, 'platillos', cardinality(v_ids)));

  return jsonb_build_object('ok', true, 'platillos', cardinality(v_ids), 'ids', to_jsonb(v_ids));
end;
$$;

-- ── 7. Ajustar existencias con motivo, bajo bloqueo ───────────────────
create or replace function public.leogin_ajustar_existencias(
  p_restaurant uuid, p_producto uuid, p_modo text, p_cantidad integer,
  p_motivo text, p_nota text, p_actor uuid
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_nombre text;
  v_track boolean;
  v_antes integer;
  v_despues integer;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_nota text := nullif(btrim(left(coalesce(p_nota, ''), 200)), '');
begin
  if p_modo not in ('sumar', 'restar', 'fijar') or p_cantidad is null or p_cantidad < 0 or p_cantidad > 1000000 then
    raise exception 'Cantidad inválida.' using errcode = '22023';
  end if;
  if p_modo <> 'fijar' and p_cantidad = 0 then
    raise exception 'Escribe cuánto sumar o restar.' using errcode = 'LGD01';
  end if;
  if p_modo = 'sumar' and v_motivo is null then v_motivo := 'reposicion'; end if;
  if v_motivo is null then
    raise exception 'Elige el motivo del ajuste.' using errcode = 'LGD01';
  end if;
  if v_motivo not in ('reposicion', 'merma', 'conteo', 'correccion', 'consumo', 'otro') then
    raise exception 'Motivo inválido.' using errcode = '22023';
  end if;
  if v_motivo = 'otro' and v_nota is null then
    raise exception 'Escribe una nota para «Otro».' using errcode = 'LGD01';
  end if;

  select name, track_stock, coalesce(stock, 0)::integer into v_nombre, v_track, v_antes
    from public.products where id = p_producto and restaurant_id = p_restaurant for update;
  if v_nombre is null then
    raise exception 'Ese platillo ya no existe.' using errcode = 'LGD01';
  end if;
  if not coalesce(v_track, false) then
    raise exception 'Activa el control de existencias de «%» primero.', v_nombre using errcode = 'LGD01';
  end if;

  v_despues := case p_modo when 'sumar' then v_antes + p_cantidad
                           when 'restar' then v_antes - p_cantidad
                           else p_cantidad end;
  if v_despues < 0 then
    raise exception 'Sólo quedan % de «%»: no se pueden restar %.', v_antes, v_nombre, p_cantidad using errcode = 'LGD01';
  end if;
  if v_despues = v_antes then
    return jsonb_build_object('ok', true, 'antes', v_antes, 'despues', v_despues, 'sinCambio', true);
  end if;

  update public.products
     set stock = v_despues,
         -- En cero se agota «hasta reponer». Registrar más existencias devuelve
         -- lo agotado «hasta reponer» aunque no estuviera en cero (el
         -- disparador cubre además el paso de 0 a más por compras o anulaciones).
         is_available = case when v_despues <= 0 then false
                             when v_despues > v_antes and agotado_motivo = 'reponer' then true
                             else is_available end,
         agotado_motivo = case when v_despues <= 0 and is_available then 'reponer' else agotado_motivo end
   where id = p_producto;

  insert into public.stock_movements (restaurant_id, product_id, delta, reason, balance_after, created_by, nota)
  values (p_restaurant, p_producto, v_despues - v_antes, v_motivo, v_despues, p_actor, v_nota);

  insert into public.activity_log (restaurant_id, actor_id, action, entity, meta)
  values (p_restaurant, p_actor, 'stock', v_nombre,
          jsonb_build_object('productId', p_producto, 'delta', v_despues - v_antes, 'balance', v_despues, 'motivo', v_motivo, 'nota', v_nota));

  return jsonb_build_object('ok', true, 'antes', v_antes, 'despues', v_despues);
end;
$$;

-- ── 8. Activar el control de varios a la vez ──────────────────────────
create or replace function public.leogin_activar_control(
  p_restaurant uuid, p_filas jsonb, p_actor uuid
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_n integer := coalesce(jsonb_array_length(p_filas), 0);
  v_ok integer;
  f jsonb;
begin
  if v_n = 0 or v_n > 500 then
    raise exception 'Elige entre 1 y 500 platillos.' using errcode = '22023';
  end if;
  -- Todo se valida antes de tocar nada.
  for f in select * from jsonb_array_elements(p_filas) loop
    if (f->>'stock') !~ '^\d{1,7}$' or (f->>'minimo') !~ '^\d{1,7}$' then
      raise exception 'Existencias y mínimo son números enteros desde 0.' using errcode = 'LGD01';
    end if;
  end loop;

  perform 1 from public.products
   where restaurant_id = p_restaurant and id in (select (x->>'id')::uuid from jsonb_array_elements(p_filas) x)
   for update;
  select count(*) into v_ok from public.products
   where restaurant_id = p_restaurant and id in (select (x->>'id')::uuid from jsonb_array_elements(p_filas) x);
  if v_ok <> (select count(distinct x->>'id') from jsonb_array_elements(p_filas) x) then
    raise exception 'Algún platillo ya no existe. Actualiza la página.' using errcode = 'LGD01';
  end if;

  update public.products p
     set track_stock = true,
         stock = (x->>'stock')::integer,
         low_stock_threshold = (x->>'minimo')::integer,
         is_available = case when (x->>'stock')::integer <= 0 then false else p.is_available end,
         agotado_motivo = case when (x->>'stock')::integer <= 0 then 'reponer' else p.agotado_motivo end
    from jsonb_array_elements(p_filas) x
   where p.restaurant_id = p_restaurant and p.id = (x->>'id')::uuid;

  insert into public.stock_movements (restaurant_id, product_id, delta, reason, balance_after, created_by, nota)
  select p_restaurant, (x->>'id')::uuid, (x->>'stock')::integer, 'conteo', (x->>'stock')::integer, p_actor, 'Inicio del control'
    from jsonb_array_elements(p_filas) x;

  insert into public.activity_log (restaurant_id, actor_id, action, entity, meta)
  values (p_restaurant, p_actor, 'inventario_activado', v_n::text || case when v_n = 1 then ' platillo' else ' platillos' end,
          jsonb_build_object('productos', v_n));

  return jsonb_build_object('ok', true, 'activados', v_n);
end;
$$;

revoke all on function public.leogin_agotado_coherente() from public, anon, authenticated;
revoke all on function
  public.leogin_marcar_agotado(uuid, uuid[], text, uuid),
  public.leogin_agotar_ingrediente(uuid, uuid, boolean, uuid),
  public.leogin_ajustar_existencias(uuid, uuid, text, integer, text, text, uuid),
  public.leogin_activar_control(uuid, jsonb, uuid),
  public.leogin_inicio_proximo_dia(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function
  public.leogin_marcar_agotado(uuid, uuid[], text, uuid),
  public.leogin_agotar_ingrediente(uuid, uuid, boolean, uuid),
  public.leogin_ajustar_existencias(uuid, uuid, text, integer, text, text, uuid),
  public.leogin_activar_control(uuid, jsonb, uuid),
  public.leogin_inicio_proximo_dia(uuid, timestamptz)
  to service_role;

commit;
