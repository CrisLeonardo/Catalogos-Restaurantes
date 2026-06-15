-- ============================================================
--  Migración 028 — Facturación / suscripciones de restaurantes
--  (cobro de Leogin a sus restaurantes clientes)
--  · restaurant_billing: config 1:1 — cuota de implementación,
--    mensualidad, día de cobro, moneda, estado del servicio.
--  · invoices: cobros emitidos (mensualidad / implementación /
--    prorrateo / otros) con su estado de pago.
--  Acceso EXCLUSIVO vía service role en server actions; el panel
--  del dueño lee sus propias facturas tras validar sesión.
--  Ejecutar DESPUÉS de 001..027 en el SQL Editor de Supabase.
-- ============================================================

-- ── Config de cobro por restaurante (1:1) ───────────────────
create table if not exists restaurant_billing (
  restaurant_id  uuid          primary key references restaurants(id) on delete cascade,
  currency       text          not null default 'GTQ',
  setup_fee      numeric(10,2) not null default 0,    -- costo de implementación (una vez)
  monthly_fee    numeric(10,2) not null default 0,    -- mensualidad recurrente
  billing_day    int           not null default 1,    -- día del mes en que se cobra (al inicio)
  active         boolean       not null default true, -- ¿se le sigue cobrando?
  started_at     date,                                -- inicio del servicio
  notes          text,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);

comment on table restaurant_billing is
  'Configuración de cobro de Leogin a cada restaurante cliente '
  '(implementación + mensualidad). Acceso solo vía service role.';

-- ── Cobros / facturas ───────────────────────────────────────
create table if not exists invoices (
  id             uuid          primary key default gen_random_uuid(),
  restaurant_id  uuid          not null references restaurants(id) on delete cascade,
  concept        text          not null default 'MONTHLY',  -- MONTHLY | SETUP | PRORATE | OTHER
  description    text,
  period         date,                                      -- primer día del mes que cubre (MONTHLY/PRORATE)
  amount         numeric(10,2) not null default 0,
  currency       text          not null default 'GTQ',
  status         text          not null default 'PENDING',  -- PENDING | PAID | CANCELLED
  due_date       date,                                      -- fecha límite de pago
  paid_at        timestamptz,                               -- cuándo se registró el pago
  paid_amount    numeric(10,2),
  payment_method text,                                      -- Efectivo, transferencia, etc.
  notes          text,
  created_at     timestamptz   not null default now()
);

comment on table invoices is
  'Cobros emitidos a un restaurante (mensualidad, implementación, prorrateo). '
  'status PAID = ya canceló. Acceso solo vía service role.';

create index if not exists invoices_restaurant_idx
  on invoices(restaurant_id, created_at desc);

-- Generación idempotente: una sola mensualidad por restaurante y periodo.
create unique index if not exists invoices_monthly_period_uniq
  on invoices(restaurant_id, period)
  where concept = 'MONTHLY' and period is not null;

-- RLS: sin políticas a propósito — todo el acceso pasa por server actions
-- (service role) que validan el rol del usuario autenticado.
alter table restaurant_billing enable row level security;
alter table invoices            enable row level security;
