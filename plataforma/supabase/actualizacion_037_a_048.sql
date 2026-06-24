-- ============================================================
--  ACTUALIZACION 037 a 048 — recetas, módulos activables y llamada al mesero
--  Pega TODO este archivo en el SQL Editor de Supabase (nube) y pulsa Run.
--
--  Requiere tener aplicadas antes las migraciones 001..036
--  (usa la actualizacion_025_a_036.sql si tu nube aún está en 024).
--
--  EJECUTAR UNA SOLA VEZ, en orden. La mayoría de los objetos usan
--  "create table if not exists", pero algunas políticas usan "create policy"
--  (que falla si ya existen): si re-ejecutas y ves "policy already exists",
--  esa parte ya estaba aplicada y puedes ignorarla.
--
--  Incluye: 037 recetas/ingredientes, 038 framework de módulos (columna
--  module_settings), 039 FEL, 040 proveedores, 041 lealtad/puntos,
--  042 canje de puntos en checkout, 043 reservaciones, 044 encuestas,
--  045 cupones, 046 override manual de cobro, 047 prueba self-serve,
--  048 LLAMADA AL MESERO (tabla waiter_calls + Realtime).
--
--  IMPORTANTE — Realtime: además de este SQL, en el Dashboard de Supabase
--  ve a Database -> Replication -> supabase_realtime y confirma que estén
--  publicadas las tablas  orders  y  waiter_calls  (la 048 intenta agregar
--  waiter_calls automáticamente; si tu plan no lo permite por SQL, actívala
--  ahí manualmente). Sin esto, las llamadas al mesero no llegan en vivo.
-- ============================================================


-- ============================================================
-- ========== migrations/037_recetas.sql ==========
-- ============================================================

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


-- ============================================================
-- ========== migrations/038_modulos.sql ==========
-- ============================================================

-- ============================================================
--  Migración 038 — Activación de módulos en 2 niveles
--  ------------------------------------------------------------
--  · restaurants.modules        → ENTITLEMENTS (los concede Leogin/super admin).
--                                 Llaves nuevas opcionales: fel, proveedores, loyalty.
--                                 Es jsonb libre: no requiere cambio de esquema para
--                                 esas llaves, default ausente = false.
--  · restaurants.module_settings → estado que controla el RESTAURANTE (on/off de los
--                                 módulos a los que está habilitado). Forma:
--                                 { "fel": { "enabled": true }, "loyalty": {...} }
--
--  Módulo ACTIVO  =  entitlement(modules[k]) === true
--                    Y  module_settings[k].enabled === true
--  Si Leogin retira el entitlement, el restaurante no puede activarlo.
--  Ejecutar DESPUÉS de 001..037.
-- ============================================================

alter table restaurants
  add column if not exists module_settings jsonb not null default '{}'::jsonb;


-- ============================================================
-- ========== migrations/039_fel.sql ==========
-- ============================================================

-- ============================================================
--  Migración 039 — FEL (Factura Electrónica en Línea, Guatemala)
--  ------------------------------------------------------------
--  Módulo activable en 2 niveles (ver 038). Estas tablas guardan
--  la configuración fiscal del emisor y el registro de documentos
--  emitidos. La transmisión real al SAT requiere un certificador
--  (INFILE, G4S, Digifact…). El "modo MANUAL" genera un registro
--  interno con numeración secuencial sin transmitir (para quienes
--  aún no contratan certificador).
--  RLS: solo service role (igual que el resto de tablas operativas).
--  Ejecutar DESPUÉS de 001..038.
-- ============================================================

-- ── Configuración fiscal del emisor (1 por restaurante) ─────
create table if not exists fel_settings (
  restaurant_id          uuid        primary key references restaurants(id) on delete cascade,
  -- Certificador: MANUAL = registro interno sin transmisión; otros = pasarela.
  provider               text        not null default 'MANUAL',  -- MANUAL | INFILE | G4S | DIGIFACT | OTRO
  ambiente               text        not null default 'PRUEBAS', -- PRUEBAS | PRODUCCION
  -- Datos del emisor (SAT)
  nit_emisor             text        not null default '',
  nombre_emisor          text        not null default '',
  nombre_comercial       text        not null default '',
  direccion              text        not null default '',
  codigo_establecimiento text        not null default '1',
  afiliacion_iva         text        not null default 'GEN',     -- GEN | PEQ (pequeño contribuyente)
  moneda                 text        not null default 'GTQ',
  iva_incluido           boolean     not null default true,      -- el precio ya incluye IVA (12%)
  serie_prefijo          text        not null default '',        -- prefijo de serie en modo MANUAL
  -- Credenciales del certificador (solo se usan con provider ≠ MANUAL)
  api_usuario            text        not null default '',
  api_clave              text        not null default '',
  api_llave_firma        text        not null default '',
  -- Estado
  next_correlativo       integer     not null default 1,         -- contador en modo MANUAL
  updated_at             timestamptz not null default now()
);

alter table fel_settings enable row level security;

-- ── Documentos emitidos ─────────────────────────────────────
create table if not exists fel_documents (
  id                  uuid          primary key default gen_random_uuid(),
  restaurant_id       uuid          not null references restaurants(id) on delete cascade,
  order_id            uuid          references orders(id) on delete set null,
  tipo                text          not null default 'FACT',     -- tipo de DTE
  receptor_nit        text          not null default 'CF',       -- CF = consumidor final
  receptor_nombre     text          not null default 'Consumidor Final',
  receptor_direccion  text          not null default 'Ciudad',
  moneda              text          not null default 'GTQ',
  monto_total         numeric(12,2) not null default 0,
  monto_iva           numeric(12,2) not null default 0,
  estado              text          not null default 'PENDIENTE', -- PENDIENTE | CERTIFICADO | ANULADO | ERROR
  uuid_sat            text,                                       -- UUID que devuelve el certificador
  serie               text,
  numero              text,
  numero_autorizacion text,
  fecha_certificacion timestamptz,
  error_mensaje       text,
  dte_json            jsonb,                                      -- snapshot del DTE generado
  created_at          timestamptz   not null default now()
);

create index if not exists fel_documents_restaurant_idx on fel_documents(restaurant_id, created_at desc);
create index if not exists fel_documents_order_idx       on fel_documents(order_id);

alter table fel_documents enable row level security;


-- ============================================================
-- ========== migrations/040_proveedores.sql ==========
-- ============================================================

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


-- ============================================================
-- ========== migrations/041_loyalty.sql ==========
-- ============================================================

-- ============================================================
--  Migración 041 — Lealtad / Puntos
--  ------------------------------------------------------------
--  Módulo activable en 2 niveles (ver 038). Programa de puntos:
--  el cliente acumula puntos por compra y los canjea como descuento.
--  RLS: solo service role.
--  Ejecutar DESPUÉS de 001..040.
-- ============================================================

-- ── Configuración del programa (1 por restaurante) ──────────
create table if not exists loyalty_settings (
  restaurant_id   uuid          primary key references restaurants(id) on delete cascade,
  -- Puntos ganados por cada unidad de moneda gastada (ej. 1 = 1 punto por Q1).
  earn_rate       numeric(8,4)  not null default 1,
  -- Valor en moneda de cada punto al canjear (ej. 0.10 = 1 punto vale Q0.10).
  redeem_value    numeric(8,4)  not null default 0.10,
  -- Mínimo de puntos para poder canjear.
  min_redeem      integer       not null default 100,
  -- Puntos de bienvenida al crear la cuenta.
  signup_bonus    integer       not null default 0,
  updated_at      timestamptz   not null default now()
);

alter table loyalty_settings enable row level security;

-- ── Cuenta de puntos por cliente ────────────────────────────
create table if not exists loyalty_accounts (
  id              uuid          primary key default gen_random_uuid(),
  restaurant_id   uuid          not null references restaurants(id) on delete cascade,
  customer_id     uuid          not null references customers(id) on delete cascade,
  points_balance  integer       not null default 0,
  lifetime_points integer       not null default 0,
  updated_at      timestamptz   not null default now(),
  unique (restaurant_id, customer_id)
);

create index if not exists loyalty_accounts_restaurant_idx on loyalty_accounts(restaurant_id);
alter table loyalty_accounts enable row level security;

-- ── Movimientos (ledger) ────────────────────────────────────
create table if not exists loyalty_transactions (
  id            uuid          primary key default gen_random_uuid(),
  restaurant_id uuid          not null references restaurants(id) on delete cascade,
  customer_id   uuid          not null references customers(id) on delete cascade,
  order_id      uuid          references orders(id) on delete set null,
  tipo          text          not null,                   -- EARN | REDEEM | ADJUST | SIGNUP
  points        integer       not null,                   -- + acumula, − resta
  note          text          not null default '',
  created_at    timestamptz   not null default now()
);

create index if not exists loyalty_tx_restaurant_idx on loyalty_transactions(restaurant_id, created_at desc);
create index if not exists loyalty_tx_customer_idx   on loyalty_transactions(customer_id);
alter table loyalty_transactions enable row level security;

-- ── RPC: aplica un movimiento de puntos de forma atómica ────
--  Crea la cuenta si no existe, inserta el movimiento y ajusta saldos.
--  Devuelve el nuevo saldo. Rechaza canjes que dejarían saldo negativo.
create or replace function leogin_loyalty_apply(
  p_restaurant_id uuid,
  p_customer_id   uuid,
  p_order_id      uuid,
  p_tipo          text,
  p_points        integer,
  p_note          text
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_balance integer;
begin
  insert into loyalty_accounts (restaurant_id, customer_id)
    values (p_restaurant_id, p_customer_id)
    on conflict (restaurant_id, customer_id) do nothing;

  select points_balance into v_balance
    from loyalty_accounts
   where restaurant_id = p_restaurant_id and customer_id = p_customer_id
   for update;

  if v_balance + p_points < 0 then
    raise exception 'Puntos insuficientes (saldo %, intento %)', v_balance, p_points;
  end if;

  insert into loyalty_transactions (restaurant_id, customer_id, order_id, tipo, points, note)
    values (p_restaurant_id, p_customer_id, p_order_id, p_tipo, p_points, coalesce(p_note, ''));

  update loyalty_accounts
     set points_balance  = points_balance + p_points,
         lifetime_points = lifetime_points + greatest(p_points, 0),
         updated_at      = now()
   where restaurant_id = p_restaurant_id and customer_id = p_customer_id
   returning points_balance into v_balance;

  return v_balance;
end;
$$;


-- ============================================================
-- ========== migrations/042_loyalty_redeem.sql ==========
-- ============================================================

-- ============================================================
--  Migración 042 — Canje de puntos en el checkout
--  ------------------------------------------------------------
--  Registra en el pedido cuántos puntos de lealtad canjeó el cliente
--  y el descuento que generaron. El descuento por promo sigue en
--  `discount`; este es independiente (puede coexistir).
--  Ejecutar DESPUÉS de 001..041.
-- ============================================================

alter table orders
  add column if not exists loyalty_points_redeemed integer       not null default 0,
  add column if not exists loyalty_discount         numeric(12,2) not null default 0;


-- ============================================================
-- ========== migrations/043_reservaciones.sql ==========
-- ============================================================

-- ============================================================
--  Migración 043 — Módulo de Reservaciones
--  Tabla para gestionar reservas de mesa desde el panel admin.
-- ============================================================

create table if not exists reservations (
  id              uuid        primary key default gen_random_uuid(),
  restaurant_id   uuid        not null references restaurants(id) on delete cascade,
  customer_name   text        not null,
  customer_phone  text,
  party_size      int         not null default 2 check (party_size >= 1 and party_size <= 100),
  date            date        not null,
  time            time        not null,
  notes           text,
  status          text        not null default 'PENDING'
                  check (status in ('PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists reservations_restaurant_date
  on reservations(restaurant_id, date);

alter table reservations enable row level security;

create policy "staff can manage reservations"
  on reservations for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'SUPER_ADMIN'
          or (p.restaurant_id = reservations.restaurant_id
              and p.role in ('RESTAURANT_OWNER', 'RESTAURANT_STAFF', 'RESTAURANT_WAITER')))
    )
  );


-- ============================================================
-- ========== migrations/044_encuestas.sql ==========
-- ============================================================

-- ============================================================
--  Migración 044 — Módulo de Encuestas de satisfacción
--  Calificaciones post-pedido (1-5 estrellas + comentario).
-- ============================================================

create table if not exists order_ratings (
  id            uuid        primary key default gen_random_uuid(),
  restaurant_id uuid        not null references restaurants(id) on delete cascade,
  order_id      uuid        references orders(id) on delete set null,
  rating        int         not null check (rating between 1 and 5),
  comment       text,
  customer_name text,
  created_at    timestamptz not null default now()
);

create index if not exists order_ratings_restaurant_date
  on order_ratings(restaurant_id, created_at desc);

alter table order_ratings enable row level security;

-- Staff del restaurante puede ver sus reseñas
create policy "staff can view ratings"
  on order_ratings for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'SUPER_ADMIN'
          or p.restaurant_id = order_ratings.restaurant_id)
    )
  );

-- Cualquiera puede enviar una calificación (clientes sin auth)
create policy "public can submit rating"
  on order_ratings for insert
  with check (true);


-- ============================================================
-- ========== migrations/045_cupones.sql ==========
-- ============================================================

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


-- ============================================================
-- ========== migrations/046_billing_manual_override.sql ==========
-- ============================================================

-- ============================================================
--  Migración 046 — Override manual de suspensión por impago
--  ------------------------------------------------------------
--  Permite al super admin habilitar manualmente un restaurante
--  suspendido por impago y evitar que el cron lo vuelva a
--  suspender automáticamente mientras el override esté activo.
--
--  Cambios:
--   1. Nueva columna `admin_override_suspend` en restaurant_billing.
--   2. `leogin_sync_restaurant_status` actualizada para respetar el override.
-- ============================================================

-- ── 1. Columna nueva ────────────────────────────────────────
alter table restaurant_billing
  add column if not exists admin_override_suspend boolean not null default false;

comment on column restaurant_billing.admin_override_suspend is
  'true = el admin pausó la suspensión automática por impago; el cron no suspenderá a este restaurante aunque tenga facturas vencidas.';

-- ── 2. Función actualizada (respeta el override) ────────────
create or replace function leogin_sync_restaurant_status(p_restaurant_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_auto_suspend   boolean := leogin_setting_bool('billing_auto_suspend', true);
  v_grace          int     := leogin_effective_grace_days(p_restaurant_id);
  v_has_overdue    boolean;
  v_billing_act    boolean;
  v_status         text;
  v_flag           boolean;
  v_admin_override boolean;
begin
  select status into v_status from restaurants where id = p_restaurant_id;
  select active, suspended_for_nonpayment, admin_override_suspend
    into v_billing_act, v_flag, v_admin_override
    from restaurant_billing where restaurant_id = p_restaurant_id;
  if v_billing_act is null then return 'no-billing'; end if;

  -- Verificar si hay facturas vencidas más allá del período de gracia.
  select exists (
    select 1 from invoices
    where restaurant_id = p_restaurant_id
      and status = 'PENDING'
      and due_date is not null
      and (due_date + v_grace) < (now() at time zone 'UTC')::date
  ) into v_has_overdue;

  if v_has_overdue and v_billing_act then
    -- Si el admin activó el override, no suspender aunque haya mora.
    if coalesce(v_admin_override, false) then
      return 'override-active';
    end if;
    if v_auto_suspend and v_status = 'active' then
      update restaurants        set status = 'suspended'            where id = p_restaurant_id;
      update restaurant_billing set suspended_for_nonpayment = true where restaurant_id = p_restaurant_id;
      return 'suspended';
    end if;
  else
    -- Sin mora: reactivar SOLO si el sistema lo había suspendido por impago
    -- (nunca toca suspensiones manuales).
    if v_flag and v_status = 'suspended' then
      update restaurants        set status = 'active'                where id = p_restaurant_id;
      update restaurant_billing set suspended_for_nonpayment = false where restaurant_id = p_restaurant_id;
      return 'reactivated';
    elsif v_flag then
      -- Ya activo pero el flag quedó sucio, limpiarlo.
      update restaurant_billing set suspended_for_nonpayment = false where restaurant_id = p_restaurant_id;
    end if;
  end if;
  return 'unchanged';
end;
$$;


-- ============================================================
-- ========== migrations/047_self_serve_trial.sql ==========
-- ============================================================

-- ============================================================
--  Migración 047 — Registro self-serve + prueba gratis
--  ------------------------------------------------------------
--  Permite que un restaurante se registre solo desde la web y
--  quede EN VIVO con una prueba gratis: el restaurante está
--  activo (status='active') pero su cobro está pausado
--  (restaurant_billing.active=false) hasta que la prueba vence.
--
--  Cuando la prueba vence, leogin_graduate_trials() activa el
--  cobro automáticamente (lo corre el cron diario antes de
--  generar las mensualidades). Leonardo registra los pagos como
--  siempre desde /super/cobros.
--  Ejecutar DESPUÉS de 001..046.
-- ============================================================

-- ── 1. Columna de fin de prueba ─────────────────────────────
alter table restaurant_billing
  add column if not exists trial_ends_at timestamptz;

comment on column restaurant_billing.trial_ends_at is
  'Fin de la prueba gratis. Mientras active=false y trial_ends_at>now() el restaurante está en vivo sin cobro. Al vencer, leogin_graduate_trials() activa el cobro.';

-- ── 2. Graduar pruebas vencidas (activa el cobro) ───────────
create or replace function leogin_graduate_trials()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int := 0;
begin
  with graduated as (
    update restaurant_billing
       set active        = true,
           started_at    = coalesce(started_at, (now() at time zone 'UTC')::date),
           updated_at    = now()
     where active = false
       and trial_ends_at is not null
       and trial_ends_at <= now()
    returning restaurant_id
  )
  select count(*) into v_count from graduated;
  return v_count;
end;
$$;

-- ── 3. El cron diario gradúa pruebas antes de cobrar ────────
create or replace function leogin_billing_cron()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform leogin_graduate_trials();
  if leogin_setting_bool('billing_auto_generate', true) then
    perform leogin_generate_monthly_invoices();
  end if;
  perform leogin_process_overdue();
end;
$$;

-- ── 4. Duración de la prueba (editable desde platform_settings) ──
insert into platform_settings (key, value) values
  ('trial_days', '14')
on conflict (key) do nothing;

-- ── 5. Onboarding guiado para registros self-serve ──────────
-- Los restaurantes ya existentes quedan como "ya configurados" (default true);
-- el registro self-serve crea la fila con onboarding_done=false para mostrar
-- el asistente guiado la primera vez que el dueño entra a su panel.
alter table restaurants
  add column if not exists onboarding_done boolean not null default true;

comment on column restaurants.onboarding_done is
  'false = mostrar el asistente de configuración inicial en el panel del dueño (registro self-serve).';

-- ── 6. Permitir self-serve: el slug público sigue siendo único ──
-- (no se requieren cambios de RLS: el registro usa service role validado por
--  rate-limit y validación de entrada en la server action signupRestaurant).


-- ============================================================
-- ========== migrations/048_waiter_calls.sql ==========
-- ============================================================

-- ============================================================
--  Migración 048 — Llamadas al mesero
--  El cliente presiona "Llamar al mesero" en el menú QR y se
--  registra una solicitud en esta tabla. El panel admin la
--  muestra en tiempo real y la mesera puede resolverla.
-- ============================================================

create table if not exists waiter_calls (
  id            uuid        primary key default gen_random_uuid(),
  restaurant_id uuid        not null references restaurants(id) on delete cascade,
  table_number  int,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists waiter_calls_restaurant_pending
  on waiter_calls(restaurant_id, created_at desc)
  where resolved_at is null;

alter table waiter_calls enable row level security;

-- Staff puede ver y actualizar llamadas de su restaurante
create policy "staff can manage waiter_calls"
  on waiter_calls for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'SUPER_ADMIN'
          or p.restaurant_id = waiter_calls.restaurant_id)
    )
  );

-- Clientes (anon) pueden insertar llamadas
create policy "public can insert waiter_call"
  on waiter_calls for insert
  with check (true);

-- Realtime: el panel admin y el mesero reciben las llamadas en vivo.
-- (Sin esto el canal `waiter_calls` de notifications.tsx nunca dispara.)
do $$
begin
  alter publication supabase_realtime add table waiter_calls;
exception
  when duplicate_object then null;
end $$;

