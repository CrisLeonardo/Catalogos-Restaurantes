-- ============================================================
--  Migración 040 — Proveedores y órdenes de compra
--  ------------------------------------------------------------
--  Módulo activable en 2 niveles (ver 038). Registro de proveedores
--  y órdenes de compra para reabastecer insumos/inventario.
--  RLS: solo service role.
--  Ejecutar DESPUÉS de 001..039.
-- ============================================================

create table if not exists suppliers (
  id            uuid        primary key default gen_random_uuid(),
  restaurant_id uuid        not null references restaurants(id) on delete cascade,
  name          text        not null,
  contact_name  text        not null default '',
  phone         text        not null default '',
  email         text        not null default '',
  notes         text        not null default '',
  active        boolean     not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists suppliers_restaurant_idx on suppliers(restaurant_id, name);
alter table suppliers enable row level security;

-- ── Órdenes de compra ───────────────────────────────────────
create table if not exists purchase_orders (
  id            uuid          primary key default gen_random_uuid(),
  restaurant_id uuid          not null references restaurants(id) on delete cascade,
  supplier_id   uuid          references suppliers(id) on delete set null,
  folio         integer       not null default 0,        -- correlativo por restaurante
  estado        text          not null default 'BORRADOR', -- BORRADOR | ENVIADA | RECIBIDA | CANCELADA
  total         numeric(12,2) not null default 0,
  notes         text          not null default '',
  created_at    timestamptz   not null default now(),
  sent_at       timestamptz,
  received_at   timestamptz
);

create index if not exists purchase_orders_restaurant_idx on purchase_orders(restaurant_id, created_at desc);
alter table purchase_orders enable row level security;

create table if not exists purchase_order_items (
  id                uuid          primary key default gen_random_uuid(),
  purchase_order_id uuid          not null references purchase_orders(id) on delete cascade,
  descripcion       text          not null,
  cantidad          numeric(12,3) not null check (cantidad > 0),
  unidad            text          not null default 'unidad',
  costo_unitario    numeric(12,4) not null default 0,
  subtotal          numeric(12,2) not null default 0
);

create index if not exists purchase_order_items_po_idx on purchase_order_items(purchase_order_id);
alter table purchase_order_items enable row level security;

-- Correlativo de folio por restaurante (secuencia simple vía función).
create or replace function leogin_next_po_folio(p_restaurant_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_next integer;
begin
  select coalesce(max(folio), 0) + 1 into v_next
    from purchase_orders where restaurant_id = p_restaurant_id;
  return v_next;
end;
$$;
