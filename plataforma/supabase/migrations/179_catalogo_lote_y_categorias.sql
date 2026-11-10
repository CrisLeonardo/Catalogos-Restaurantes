-- ============================================================
--  179 · Catálogo: lote, categorías y sellos sin duplicar
--  (auditoría 1.9: R06, R07, R09, E10, N17)
--  ------------------------------------------------------------
--  Plan: docs/planes/PLAN_CATALOGO_2026-11-09.md
--
--    1. `products.updated_at` para ordenar por «última edición».
--    2. Candado: la categoría de un platillo es de su mismo restaurante.
--    3. Sellos que en realidad son dietas («Vegano», «Picante»…) pasan a la
--       dieta estructurada y salen de los sellos, con constancia por local.
--    4. `leogin_aplicar_lote_catalogo`: cambios en lote (disponibilidad,
--       visibilidad, categoría, precio) todo o nada, con bitácora.
--    5. `leogin_borrar_categoria`: borrar una categoría con platillos exige
--       decir a dónde pasan; nunca quedan escondidos.
--
--  ORDEN: aplicar ANTES de desplegar el código de la 1.9, después de la 178.
--  Idempotente.
-- ============================================================
begin;

-- ── 1. Última edición ──────────────────────────────────────────────────
alter table public.products add column if not exists updated_at timestamptz not null default now();

create or replace function public.leogin_tocar_producto()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
drop trigger if exists leogin_tocar_producto on public.products;
create trigger leogin_tocar_producto before update on public.products
  for each row execute function public.leogin_tocar_producto();

-- ── 2. Categoría del mismo restaurante ─────────────────────────────────
create or replace function public.leogin_candado_categoria_producto()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.categories c where c.id = new.category_id and c.restaurant_id = new.restaurant_id
  ) then
    raise exception 'La categoría no es de este restaurante.' using errcode = 'LGD01';
  end if;
  return new;
end;
$$;
drop trigger if exists candado_categoria_producto on public.products;
create trigger candado_categoria_producto before insert or update of category_id, restaurant_id on public.products
  for each row execute function public.leogin_candado_categoria_producto();

-- ── 3. Sellos que son dietas ───────────────────────────────────────────
create or replace function public.leogin_dieta_de_sello(p_sello text)
returns text language sql immutable set search_path = '' as $$
  select case translate(lower(btrim(coalesce(p_sello, ''))), 'áéíóúü', 'aeiouu')
    when 'vegetariano' then 'vegetariano'
    when 'vegano' then 'vegano'
    -- Claves que guardaba el formulario anterior y variantes escritas a mano.
    when 'hot' then 'picante'
    when 'veg' then 'vegano'
    when 'veggie' then 'vegano'
    when 'vegana' then 'vegano'
    when 'vegetariana' then 'vegetariano'
    when 'sin gluten' then 'sin_gluten'
    when 'sin lactosa' then 'sin_lactosa'
    when 'bajo en azucar' then 'bajo_en_azucar'
    when 'picante' then 'picante'
    when 'contiene gluten' then 'contiene_gluten'
    when 'contiene lacteos' then 'contiene_lacteos'
    when 'contiene frutos secos' then 'contiene_frutos_secos'
    when 'contiene mariscos' then 'contiene_mariscos'
    when 'contiene huevo' then 'contiene_huevo'
    when 'contiene soya' then 'contiene_soya'
    else null
  end
$$;

with calc as (
  select p.id, p.restaurant_id,
         coalesce(array(select t from unnest(p.tags) t where public.leogin_dieta_de_sello(t) is null), '{}') as sellos,
         array(select distinct d from (
           select unnest(coalesce(p.dietary_tags, '{}')) d
           union select public.leogin_dieta_de_sello(t) from unnest(p.tags) t
         ) x where d is not null order by d) as dietas
    from public.products p
   where exists (select 1 from unnest(coalesce(p.tags, '{}')) t where public.leogin_dieta_de_sello(t) is not null)
), upd as (
  update public.products p
     set tags = case when cardinality(c.sellos) = 0 then null else c.sellos end,
         dietary_tags = c.dietas
    from calc c where p.id = c.id
  returning p.restaurant_id
)
insert into public.activity_log (restaurant_id, actor_id, action, entity, meta)
select restaurant_id, null, 'catalogo_sellos_a_dietas', 'Sellos y dietas',
       jsonb_build_object('motivo', 'migracion_179', 'productos', count(*))
  from upd group by restaurant_id;

-- ── 4. Cambios en lote, todo o nada ────────────────────────────────────
create or replace function public.leogin_aplicar_lote_catalogo(
  p_restaurant uuid, p_ids uuid[], p_cambio jsonb, p_actor uuid
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_n integer := coalesce(cardinality(p_ids), 0);
  v_encontrados integer;
  v_categoria uuid;
  v_modo text;
  v_valor numeric;
  v_negativo text;
  v_detalle jsonb;
begin
  if p_actor is null or v_n = 0 or v_n > 500 or p_cambio is null then
    raise exception 'Elige entre 1 y 500 platillos.' using errcode = '22023';
  end if;

  -- Bloquea las filas del lote y después las cuenta (FOR UPDATE no admite agregados).
  perform 1 from public.products where restaurant_id = p_restaurant and id = any(p_ids) for update;
  select count(*) into v_encontrados from public.products
   where restaurant_id = p_restaurant and id = any(p_ids);
  if v_encontrados <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'Algún platillo ya no existe. Actualiza la página.' using errcode = 'LGD01';
  end if;

  if p_cambio ? 'disponible' then
    update public.products
       set is_available = (p_cambio->>'disponible')::boolean,
           unavailable_at = case when (p_cambio->>'disponible')::boolean then null else coalesce(unavailable_at, clock_timestamp()) end
     where restaurant_id = p_restaurant and id = any(p_ids);
  end if;

  if p_cambio ? 'visible' then
    update public.products set is_active = (p_cambio->>'visible')::boolean
     where restaurant_id = p_restaurant and id = any(p_ids);
  end if;

  if p_cambio ? 'categoria' then
    v_categoria := nullif(p_cambio->>'categoria', '')::uuid;
    if v_categoria is null or not exists (select 1 from public.categories where id = v_categoria and restaurant_id = p_restaurant) then
      raise exception 'Esa categoría ya no existe.' using errcode = 'LGD01';
    end if;
    update public.products set category_id = v_categoria
     where restaurant_id = p_restaurant and id = any(p_ids);
  end if;

  if p_cambio ? 'precio' then
    v_modo := p_cambio->'precio'->>'modo';
    v_valor := (p_cambio->'precio'->>'valor')::numeric;
    if v_modo not in ('porcentaje', 'monto') or v_valor is null or abs(v_valor) > 100000 then
      raise exception 'Cambio de precio inválido.' using errcode = '22023';
    end if;
    select name into v_negativo from public.products
     where restaurant_id = p_restaurant and id = any(p_ids)
       and (case when v_modo = 'porcentaje' then round(price * (1 + v_valor / 100), 2) else round(price + v_valor, 2) end) < 0
     limit 1;
    if v_negativo is not null then
      raise exception 'El precio de «%» quedaría negativo. No se cambió ninguno.', v_negativo using errcode = 'LGD01';
    end if;
    select jsonb_agg(jsonb_build_object('id', id, 'nombre', name, 'antes', price,
             'despues', case when v_modo = 'porcentaje' then round(price * (1 + v_valor / 100), 2) else round(price + v_valor, 2) end))
      into v_detalle
      from (select id, name, price from public.products
             where restaurant_id = p_restaurant and id = any(p_ids) order by name limit 100) s;
    update public.products
       set price = case when v_modo = 'porcentaje' then round(price * (1 + v_valor / 100), 2) else round(price + v_valor, 2) end
     where restaurant_id = p_restaurant and id = any(p_ids);
  end if;

  insert into public.activity_log (restaurant_id, actor_id, action, entity, meta)
  values (p_restaurant, p_actor, 'catalogo_lote', v_n::text || case when v_n = 1 then ' platillo' else ' platillos' end,
          jsonb_build_object('cambio', p_cambio, 'productos', v_n, 'precios', v_detalle));

  return jsonb_build_object('ok', true, 'cambiados', v_n);
end;
$$;

-- ── 5. Borrar una categoría sin esconder platillos ─────────────────────
create or replace function public.leogin_borrar_categoria(
  p_restaurant uuid, p_categoria uuid, p_destino uuid, p_actor uuid
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_nombre text;
  v_destino text;
  v_n integer;
begin
  select name into v_nombre from public.categories
   where id = p_categoria and restaurant_id = p_restaurant for update;
  if v_nombre is null then
    raise exception 'Esa categoría ya no existe.' using errcode = 'LGD01';
  end if;
  select count(*) into v_n from public.products where restaurant_id = p_restaurant and category_id = p_categoria;

  if v_n > 0 then
    if p_destino is null then
      raise exception 'Elige a qué categoría pasan sus % platillos.', v_n using errcode = 'LGD01';
    end if;
    select name into v_destino from public.categories
     where id = p_destino and restaurant_id = p_restaurant and id <> p_categoria;
    if v_destino is null then
      raise exception 'La categoría de destino no es válida.' using errcode = 'LGD01';
    end if;
    update public.products set category_id = p_destino
     where restaurant_id = p_restaurant and category_id = p_categoria;
  end if;

  delete from public.categories where id = p_categoria and restaurant_id = p_restaurant;
  insert into public.activity_log (restaurant_id, actor_id, action, entity, meta)
  values (p_restaurant, p_actor, 'categoria_borrada', v_nombre,
          jsonb_build_object('categoryId', p_categoria, 'movidos', v_n, 'destino', v_destino));
  return jsonb_build_object('ok', true, 'movidos', v_n, 'destino', v_destino);
end;
$$;

revoke all on function public.leogin_aplicar_lote_catalogo(uuid,uuid[],jsonb,uuid),
  public.leogin_borrar_categoria(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.leogin_aplicar_lote_catalogo(uuid,uuid[],jsonb,uuid),
  public.leogin_borrar_categoria(uuid,uuid,uuid,uuid) to service_role;

commit;
