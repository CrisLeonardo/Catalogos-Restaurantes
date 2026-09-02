-- ============================================================
--  Migración 125 — El reparto de la cuenta deja de vivir en un navegador
--  ------------------------------------------------------------
--  Cómo se reparte una cuenta y quién ya pagó se guardaba en el
--  `localStorage` del aparato que lo estuviera haciendo. Al servidor
--  no llegaba nada. Consecuencias, todas vistas:
--
--   · el mesero empieza el cobro en su teléfono y el cajero, en la
--     tablet, ve la cuenta entera sin cobrar;
--   · dos personas cobrando la misma mesa grande no se enteran de lo
--     que hizo la otra;
--   · limpiar los datos del navegador borra el reparto a media mesa;
--   · el dueño, desde «Mesas», no puede saber si una mesa va por la
--     mitad del cobro.
--
--  Aquí vive el reparto de verdad: una fila por mesa abierta, que se
--  borra sola cuando la mesa se cierra (`freeTable`).
--
--  Es estado de trabajo, no contabilidad: lo que se cobró de verdad
--  sigue siendo `orders.payment_method` + `orders.total` (migración
--  124 y el cierre de mesa). Esta tabla es el borrador compartido.
--
--  Ejecutar DESPUÉS de 001..124.
-- ============================================================

create table if not exists table_splits (
  restaurant_id uuid        not null references restaurants(id) on delete cascade,
  table_number  int         not null,

  -- 'single' = la mesa paga junta · 'equal' = partes iguales
  -- 'byItem' = cada quien lo suyo (ver lib/bill-split.ts)
  mode          text        not null default 'single',

  -- [{ "id": "1", "name": "Ana" }] — el nombre es opcional.
  people        jsonb       not null default '[]'::jsonb,
  -- { "<order_item_id>": ["1","2"] } — un plato con dos dueños se parte.
  assignment    jsonb       not null default '{}'::jsonb,
  -- ["1"] — quién ya pagó su parte.
  paid          jsonb       not null default '[]'::jsonb,

  updated_at    timestamptz not null default now(),
  updated_by    uuid        references auth.users(id) on delete set null,

  primary key (restaurant_id, table_number),
  constraint table_splits_mode_check check (mode in ('single', 'equal', 'byItem')),
  constraint table_splits_table_range check (table_number >= 1 and table_number <= 999)
);

comment on table table_splits is
  'Reparto en curso de la cuenta de una mesa: cómo se divide y quién ya pagó. '
  'Es un borrador compartido entre los aparatos del local (antes vivía en el '
  'localStorage de uno solo); se borra al cerrar la mesa. Lo cobrado de verdad '
  'está en orders.payment_method y orders.total.';

comment on column table_splits.assignment is
  'order_item_id → ids de comensales que se reparten esa línea. Ausente o [] '
  'significa SIN ASIGNAR, no "de todos" (ver lib/bill-split.ts).';

alter table table_splits enable row level security;

-- Mismo criterio que waiter_calls (migración 048) más las membresías
-- (migración 113): el dueño desde el modelo de membresías nace con
-- `profiles.restaurant_id` en null y sin esto no podría cobrar.
drop policy if exists "staff can manage table_splits" on table_splits;
create policy "staff can manage table_splits"
  on table_splits for all
  using (
    public.is_member_of(restaurant_id)
    or exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'SUPER_ADMIN' or p.restaurant_id = table_splits.restaurant_id)
    )
  )
  with check (
    public.is_member_of(restaurant_id)
    or exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'SUPER_ADMIN' or p.restaurant_id = table_splits.restaurant_id)
    )
  );

-- El salón pregunta "¿qué mesas van a medio cobrar?" de golpe.
create index if not exists table_splits_restaurant_idx
  on table_splits (restaurant_id);
