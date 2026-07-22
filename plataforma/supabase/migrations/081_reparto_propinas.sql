-- ============================================================
--  Migración 081 — Reparto de propinas entre personal
--  (Fase 2 auditoría de lanzamiento: retención y utilidades de personal)
--  · tip_distributions: cabecera de un "cierre" de propinas por período
--    (fecha inicio/fin, total repartido, quién lo cerró).
--  · tip_distribution_shares: cuánto le tocó a cada miembro del staff.
--  · orders.tip_distribution_id: marca qué pedidos YA se incluyeron en un
--    reparto, para no repartir la misma propina dos veces.
--  Es un cálculo/registro — no mueve dinero real (el cobro es manual,
--  ver Fase 0 respuesta FEL). Sirve como bitácora auditable de "a quién
--  se le pagó qué" por propinas.
--  Ejecutar DESPUÉS de 001..080.
-- ============================================================

create table if not exists tip_distributions (
  id             uuid          primary key default gen_random_uuid(),
  restaurant_id  uuid          not null references restaurants(id) on delete cascade,
  period_start   timestamptz   not null,
  period_end     timestamptz   not null,
  total_tip      numeric(10,2) not null default 0,
  notes          text,
  created_by     uuid          references profiles(id) on delete set null,
  created_at     timestamptz   not null default now()
);

comment on table tip_distributions is
  'Un "cierre" de propinas: registra que las propinas de un período ya se '
  'repartieron entre el personal, y cómo. No mueve dinero (el pago real es '
  'manual, fuera del sistema) — es la bitácora de a quién le toca cuánto.';

create index if not exists tip_distributions_restaurant_idx
  on tip_distributions(restaurant_id, period_end desc);

create table if not exists tip_distribution_shares (
  id               uuid          primary key default gen_random_uuid(),
  distribution_id  uuid          not null references tip_distributions(id) on delete cascade,
  staff_id         uuid          references profiles(id) on delete set null,
  staff_name       text          not null,             -- snapshot: si el staff se borra después, el reparto sigue siendo legible
  amount           numeric(10,2) not null default 0,
  orders_count     int           not null default 0,   -- cuántos pedidos de ese mesero entraron en el cálculo sugerido
  created_at       timestamptz   not null default now()
);

create index if not exists tip_distribution_shares_dist_idx
  on tip_distribution_shares(distribution_id);

-- RLS sin políticas: acceso solo por server actions (service role) que
-- validan rol/permiso 'finanzas' (mismo patrón que promotions/cash_counts).
alter table tip_distributions enable row level security;
alter table tip_distribution_shares enable row level security;

alter table orders
  add column if not exists tip_distribution_id uuid references tip_distributions(id) on delete set null;

comment on column orders.tip_distribution_id is
  'Si no es NULL: la propina de este pedido ya fue incluida en un reparto '
  '(tip_distributions) y no debe volver a contarse en el siguiente período.';

create index if not exists orders_tip_distribution_idx on orders(restaurant_id, tip_distribution_id);
