-- ============================================================
--  Migración 022 — Promociones / cupones (Fase D)
--  · promotions: descuentos a nivel de pedido (%, monto, envío gratis)
--  · orders:     descuento aplicado + promo usada (snapshot)
--  El total ya viene descontado desde el server action; estas columnas
--  son la metadata para reportes y recibos.
--  Ejecutar DESPUÉS de 001..021.
-- ============================================================

create table if not exists promotions (
  id            uuid          primary key default gen_random_uuid(),
  restaurant_id uuid          not null references restaurants(id) on delete cascade,
  name          text          not null,
  kind          text          not null check (kind in ('PERCENT', 'AMOUNT', 'FREE_DELIVERY')),
  value         numeric(10,2) not null default 0,   -- % (0-100) o monto; ignora en FREE_DELIVERY
  code          text,                                -- NULL = se aplica automático; con código = cupón
  min_order     numeric(10,2) not null default 0,    -- subtotal mínimo para aplicar
  starts_at     timestamptz,
  ends_at       timestamptz,
  active        boolean       not null default true,
  usage_limit   int,                                 -- NULL = sin límite
  used_count    int           not null default 0,
  created_at    timestamptz   not null default now()
);

comment on table promotions is
  'Promociones a nivel de pedido. code NULL = automática; con code = cupón que el '
  'cliente escribe en el checkout. La validación autoritativa es server-side.';

create index if not exists promotions_restaurant_idx on promotions(restaurant_id, active);
-- Código único por restaurante (cuando tiene código).
create unique index if not exists promotions_restaurant_code_idx
  on promotions(restaurant_id, lower(code)) where code is not null;

-- RLS sin políticas: acceso por server actions (service role) que validan rol.
alter table promotions enable row level security;

-- ── Orders: descuento aplicado + promo (snapshot) ───────────
alter table orders
  add column if not exists discount   numeric(10,2) not null default 0,
  add column if not exists promo_id    uuid references promotions(id) on delete set null,
  add column if not exists promo_code  text;

comment on column orders.discount is 'Descuento aplicado al pedido (>= 0). total = subtotal + envío - descuento.';

-- Incremento atómico del contador de usos de una promo (lo llama createOrder).
create or replace function increment_promo_usage(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update promotions set used_count = used_count + 1 where id = p_id;
$$;
