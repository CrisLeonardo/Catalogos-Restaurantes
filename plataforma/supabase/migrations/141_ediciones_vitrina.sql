-- ============================================================
--  141 · Archivo de ediciones de la Vitrina (modo lanzamiento)
--  ------------------------------------------------------------
--  PLAN_VITRINA_2026-10-09, Fase 2. La edición VIVA (nombre, «abre el»,
--  «cierra el») vive en el tema (restaurant_themes.config / content). Lo
--  que no cabía ahí es lo que pasó: cuando una edición cierra, se guarda
--  una FOTO de sus piezas para enseñar el archivo en el menú («Drop 006 ·
--  Agotado en 3 h 12 min») aunque después el dueño cambie o borre los
--  productos para la siguiente.
--
--    · drop_editions       una fila por edición cerrada
--    · drop_edition_items  sus piezas tal como estaban al cerrar
--
--  Las dos con RLS y SIN políticas: solo el servidor (service role) las lee
--  y escribe. Llevan unidades vendidas, que son datos del negocio; el menú
--  público pide solo las columnas que enseña (lib/db/vitrina.ts).
--
--  Archivar es idempotente: una edición se reconoce por (restaurante,
--  nombre, hora de cierre). El cron de cada 10 min archiva las que ya
--  cerraron; el botón «Cerrar y archivar ahora» del editor llama a la misma
--  función con la hora actual.
--
--  Idempotente. Ejecutar DESPUÉS de 001..140. Puede ir antes o después del
--  despliegue: sin el código nuevo nadie la usa, y sin ella el código nuevo
--  enseña el menú sin archivo (lib/db/migracion-ausente.ts).
-- ============================================================

create table if not exists public.drop_editions (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  title         text not null,
  kicker        text not null default '',
  opens_at      timestamptz,
  closes_at     timestamptz not null,
  -- Toda la edición agotada: la hora de la última pieza en acabarse.
  sold_out_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (restaurant_id, title, closes_at)
);
create index if not exists drop_editions_restaurant_idx
  on public.drop_editions (restaurant_id, closes_at desc);

create table if not exists public.drop_edition_items (
  edition_id  uuid not null references public.drop_editions(id) on delete cascade,
  position    int  not null,
  product_id  uuid references public.products(id) on delete set null,
  name        text not null,
  image_url   text,
  price       numeric(10, 2) not null,
  units_sold  int  not null default 0,
  sold_out    boolean not null default false,
  sold_out_at timestamptz,
  primary key (edition_id, position)
);

alter table public.drop_editions      enable row level security;
alter table public.drop_edition_items enable row level security;
revoke all on public.drop_editions      from anon, authenticated;
revoke all on public.drop_edition_items from anon, authenticated;

comment on table public.drop_editions is
  'Ediciones cerradas de la Vitrina (modo lanzamiento). La edición viva está en '
  'restaurant_themes; aquí queda la foto al cerrar. Solo service role.';

-- ── Archivar una edición ─────────────────────────────────────
--  Lee la edición viva del tema y guarda la foto de las piezas activas del
--  restaurante. `p_cierre` NULL = la hora de cierre del tema (cron); con
--  valor = cierre manual desde el editor. Devuelve el id de la edición, o
--  NULL si no hay nada que archivar (sin modo lanzamiento o sin cierre).
create or replace function public.vitrina_archivar_edicion(p_restaurant uuid, p_cierre timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config  jsonb;
  v_content jsonb;
  v_title   text;
  v_kicker  text;
  v_abre    timestamptz;
  v_cierra  timestamptz;
  v_desde   timestamptz;
  v_id      uuid;
begin
  select coalesce(config, '{}'::jsonb), coalesce(content, '{}'::jsonb)
    into v_config, v_content
    from restaurant_themes where restaurant_id = p_restaurant;
  if not found or coalesce((v_config ->> 'launchMode')::boolean, false) is not true then
    return null;
  end if;

  v_title  := coalesce(nullif(trim(v_content -> 'vitrina' ->> 'launchTitle'), ''), 'Edición');
  v_kicker := coalesce(v_content -> 'vitrina' ->> 'launchKicker', '');
  begin
    v_abre := nullif(v_config ->> 'launchOpensAt', '')::timestamptz;
  exception when others then v_abre := null;
  end;
  begin
    v_cierra := coalesce(p_cierre, nullif(v_config ->> 'launchEndsAt', '')::timestamptz);
  exception when others then v_cierra := p_cierre;
  end;
  if v_cierra is null then
    return null;
  end if;

  select id into v_id from drop_editions
   where restaurant_id = p_restaurant and title = v_title and closes_at = v_cierra;
  if found then
    return v_id;
  end if;

  -- Ventana de la edición para contar lo vendido: desde que abrió; si no
  -- tenía apertura, desde el cierre de la anterior; y si es la primera, la
  -- semana previa al cierre.
  v_desde := coalesce(
    v_abre,
    (select max(closes_at) from drop_editions where restaurant_id = p_restaurant and closes_at < v_cierra),
    v_cierra - interval '7 days'
  );

  insert into drop_editions (restaurant_id, title, kicker, opens_at, closes_at)
  values (p_restaurant, v_title, v_kicker, v_abre, v_cierra)
  returning id into v_id;

  insert into drop_edition_items (edition_id, position, product_id, name, image_url, price, units_sold, sold_out, sold_out_at)
  select v_id,
         row_number() over (order by coalesce(c.sort_order, 999), p.sort_order, p.name),
         p.id, p.name, p.image_url, p.price,
         coalesce(v.unidades, 0),
         (p.is_available is false) or (p.track_stock and coalesce(p.stock, 0) <= 0),
         case when p.unavailable_at between v_desde and v_cierra then p.unavailable_at end
    from products p
    left join categories c on c.id = p.category_id
    left join lateral (
      select sum(oi.quantity)::int as unidades
        from order_items oi
        join orders o on o.id = oi.order_id
       where oi.product_id = p.id
         and o.restaurant_id = p_restaurant
         and o.status <> 'CANCEL'
         and o.created_at between v_desde and v_cierra
    ) v on true
   where p.restaurant_id = p_restaurant
     and p.is_active;

  -- «Agotado en …»: solo si TODAS las piezas se acabaron, con la hora de la
  -- última.
  update drop_editions e
     set sold_out_at = (select max(i.sold_out_at) from drop_edition_items i where i.edition_id = v_id)
   where e.id = v_id
     and exists (select 1 from drop_edition_items i where i.edition_id = v_id)
     and not exists (
       select 1 from drop_edition_items i
        where i.edition_id = v_id and (not i.sold_out or i.sold_out_at is null)
     );

  return v_id;
end;
$$;

comment on function public.vitrina_archivar_edicion is
  'Guarda la foto de la edición viva de la Vitrina en drop_editions/_items. '
  'Idempotente por (restaurante, nombre, cierre). p_cierre NULL = el del tema.';

-- ── Archivar todas las que ya cerraron (cron) ────────────────
create or replace function public.vitrina_archivar_vencidas()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_n int := 0;
  v_cierra timestamptz;
begin
  for r in
    select restaurant_id, config from restaurant_themes
     where coalesce((config ->> 'launchMode')::boolean, false)
       and nullif(config ->> 'launchEndsAt', '') is not null
  loop
    begin
      v_cierra := (r.config ->> 'launchEndsAt')::timestamptz;
    exception when others then
      continue;
    end;
    if v_cierra <= now() then
      perform vitrina_archivar_edicion(r.restaurant_id, null);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- Solo el servidor y el cron: nadie desde el navegador.
revoke execute on function public.vitrina_archivar_edicion(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.vitrina_archivar_vencidas() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      if exists (select 1 from cron.job where jobname = 'leogin-vitrina-archivo') then
        perform cron.unschedule('leogin-vitrina-archivo');
      end if;
      perform cron.schedule('leogin-vitrina-archivo', '*/10 * * * *', 'select public.vitrina_archivar_vencidas();');
      raise notice 'pg_cron: job "leogin-vitrina-archivo" programado (cada 10 min).';
    exception when others then
      raise notice 'pg_cron disponible pero no se pudo programar (%): actívalo y re-ejecuta este bloque.', sqlerrm;
    end;
  else
    raise notice 'pg_cron no disponible: el menú archiva al vuelo la edición vencida (lib/db/vitrina.ts) y el editor tiene «Cerrar y archivar ahora».';
  end if;
end $$;
