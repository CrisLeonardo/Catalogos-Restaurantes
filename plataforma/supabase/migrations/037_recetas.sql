-- ============================================================
--  Migración 037 — Recetas y costeo por ingrediente
--  · ingredients:  catálogo de insumos por restaurante
--  · recipe_items: composición (ingrediente × cantidad) por producto
--  · trigger:      recalcula products.cost al modificar receta
--                  o al cambiar el precio unitario de un insumo
--  Ejecutar DESPUÉS de 001..036.
-- ============================================================

-- ── Catálogo de insumos ─────────────────────────────────────
create table if not exists ingredients (
  id              uuid          primary key default gen_random_uuid(),
  restaurant_id   uuid          not null references restaurants(id) on delete cascade,
  name            text          not null,
  unit            text          not null default 'g',
  cost_per_unit   numeric(10,4) not null default 0,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

create index if not exists ingredients_restaurant_idx
  on ingredients(restaurant_id, name);

-- RLS: solo service role (igual que inventario)
alter table ingredients enable row level security;

-- ── Composición de recetas ──────────────────────────────────
create table if not exists recipe_items (
  id              uuid          primary key default gen_random_uuid(),
  product_id      uuid          not null references products(id) on delete cascade,
  ingredient_id   uuid          not null references ingredients(id) on delete cascade,
  quantity        numeric(10,4) not null check (quantity > 0),
  unique (product_id, ingredient_id)
);

create index if not exists recipe_items_product_idx   on recipe_items(product_id);
create index if not exists recipe_items_ingredient_idx on recipe_items(ingredient_id);

alter table recipe_items enable row level security;

-- ── RPC: recalcula products.cost a partir de la receta ──────
create or replace function leogin_recompute_recipe_cost(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total  numeric;
  v_has    boolean;
begin
  select count(*) > 0 into v_has
    from recipe_items where product_id = p_product_id;
  if not v_has then return; end if;  -- sin receta → no tocar costo manual

  select coalesce(sum(ri.quantity * i.cost_per_unit), 0)
    into v_total
    from recipe_items ri
    join ingredients i on i.id = ri.ingredient_id
   where ri.product_id = p_product_id;

  update products set cost = v_total where id = p_product_id;
end;
$$;

-- ── Trigger en recipe_items ──────────────────────────────────
create or replace function leogin_recipe_item_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'DELETE' then
    perform leogin_recompute_recipe_cost(OLD.product_id);
  else
    perform leogin_recompute_recipe_cost(NEW.product_id);
  end if;
  return null;
end;
$$;

drop trigger if exists recipe_item_cost_sync on recipe_items;
create trigger recipe_item_cost_sync
  after insert or update or delete on recipe_items
  for each row execute function leogin_recipe_item_changed();

-- ── Trigger en ingredients (actualiza todos sus platillos) ───
create or replace function leogin_ingredient_price_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if NEW.cost_per_unit is distinct from OLD.cost_per_unit then
    for r in
      select distinct product_id from recipe_items where ingredient_id = NEW.id
    loop
      perform leogin_recompute_recipe_cost(r.product_id);
    end loop;
  end if;
  -- mantener updated_at
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists ingredient_cost_sync on ingredients;
create trigger ingredient_cost_sync
  before update on ingredients
  for each row execute function leogin_ingredient_price_changed();
