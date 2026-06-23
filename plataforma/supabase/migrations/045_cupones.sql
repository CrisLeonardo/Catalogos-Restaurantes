-- ============================================================
--  Migración 045 — Módulo de Cupones y descuentos
--  Códigos de descuento (porcentaje o monto fijo) para pedidos.
-- ============================================================

create table if not exists coupons (
  id              uuid        primary key default gen_random_uuid(),
  restaurant_id   uuid        not null references restaurants(id) on delete cascade,
  code            text        not null,
  description     text,
  discount_type   text        not null default 'PERCENT'
                  check (discount_type in ('PERCENT', 'FIXED')),
  discount_value  numeric(10,2) not null check (discount_value > 0),
  min_order       numeric(10,2),
  max_uses        int,
  uses            int         not null default 0,
  valid_from      timestamptz,
  valid_until     timestamptz,
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  constraint coupons_unique_code unique (restaurant_id, code)
);

create index if not exists coupons_restaurant_active
  on coupons(restaurant_id, is_active);

alter table coupons enable row level security;

create policy "staff can manage coupons"
  on coupons for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'SUPER_ADMIN'
          or p.restaurant_id = coupons.restaurant_id)
    )
  );
