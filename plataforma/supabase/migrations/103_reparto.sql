-- ============================================================
--  Migración 103 — Reparto propio: repartidores y zonas (Fase 2)
--  ------------------------------------------------------------
--  Hasta hoy el sistema terminaba en "el pedido está listo". Quién lo
--  lleva, cuándo lo recogió y cuánto efectivo trae de vuelta quedaba
--  fuera — "repartidor" solo existía como texto de ayuda en el checkout.
--
--  DECISIÓN DE ROL — no se agrega un rol nuevo:
--  el repartidor es un RESTAURANT_STAFF con la sección 'reparto' asignada
--  (src/lib/permissions.ts). Así hereda el RBAC, el login por PIN
--  (staff_pins, migración 074) y la sesión que ya existen, sin tocar el
--  CHECK de profiles.role ni reescribir políticas RLS que hoy funcionan.
--  `drivers.profile_id` enlaza al perfil cuando el repartidor entra al
--  sistema; puede quedar NULL para el repartidor que solo se registra
--  para asignarle pedidos pero no usa la app.
--
--  ZONAS POR RADIO, NO POLÍGONO:
--  `delivery_zones.radio_km` con el centro en el local cubre el caso real
--  de un restaurante de barrio y reutiliza haversine_km() (migración 011)
--  sin obligar a instalar PostGIS. Si algún día hacen falta polígonos, se
--  agrega una columna al lado, no se reescribe esto.
--
--  EFECTIVO — cash_collected:
--  Leogin no cobra en línea (decisión de producto), así que el repartidor
--  cobra en la puerta y el dinero pasa por sus manos. Sin registrar cuánto
--  entregó, el módulo de reparto quedaría a medias y el cuadre de caja
--  sería imposible. `orders.cash_amount` (migración 025) ya guarda con
--  cuánto dijo el cliente que iba a pagar — para llevar cambio; esta
--  columna guarda lo que REALMENTE se recibió.
--
--  Idempotente; seguro de re-ejecutar. Ejecutar tras 001..102.
-- ============================================================

-- ── Repartidores ────────────────────────────────────────────
create table if not exists drivers (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  -- Perfil con el que entra a /repartidor. NULL = registrado solo para
  -- asignarle pedidos desde el panel (no usa la app).
  profile_id    uuid references profiles(id) on delete set null,
  nombre        text not null,
  telefono      text,
  vehiculo      text,
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists drivers_restaurant_idx on drivers(restaurant_id);
-- Un perfil no puede ser dos repartidores a la vez (parcial: varios NULL sí).
create unique index if not exists drivers_profile_uniq
  on drivers(profile_id) where profile_id is not null;

comment on table drivers is
  'Repartidores del restaurante. No es un rol nuevo: profile_id apunta a un '
  'RESTAURANT_STAFF con la sección "reparto" asignada.';

-- ── Zonas de reparto ────────────────────────────────────────
create table if not exists delivery_zones (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references restaurants(id) on delete cascade,
  nombre            text not null,
  tarifa            numeric(10,2) not null default 0,
  minutos_estimados int,
  radio_km          numeric(6,2),
  activo            boolean not null default true,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists delivery_zones_restaurant_idx
  on delivery_zones(restaurant_id, sort_order);

comment on column delivery_zones.tarifa is
  'Costo de envío de esta zona. Reemplaza a restaurant_themes.config->>deliveryFee (tarifa '
  'plana, migración 008) cuando el restaurante configura zonas.';

-- ── Pedido: a quién se asignó y cómo fue el reparto ──────────
alter table orders
  add column if not exists driver_id        uuid references drivers(id) on delete set null,
  add column if not exists assigned_at      timestamptz,
  add column if not exists picked_up_at     timestamptz,
  add column if not exists cash_collected   numeric(10,2),
  add column if not exists delivery_zone_id uuid references delivery_zones(id) on delete set null;

-- Consulta caliente de /repartidor: "mis pedidos activos".
create index if not exists orders_driver_idx
  on orders(driver_id, status) where driver_id is not null;

comment on column orders.driver_id is
  'Repartidor asignado. NULL = sin asignar todavía (o no es DELIVERY).';
comment on column orders.picked_up_at is
  'Momento en que el repartidor marcó que salió con el pedido. Junto con '
  'ready_at y delivered_at permite medir cuánto se tarda en salir del local '
  'y cuánto en llegar — las dos mitades del tiempo de entrega.';
comment on column orders.cash_collected is
  'Efectivo realmente recibido por el repartidor. Se compara contra total '
  'para cuadrar caja al cierre del turno. NULL = todavía no se registró.';

alter table drivers        enable row level security;
alter table delivery_zones enable row level security;

-- Las zonas las lee el comensal al elegir dirección en el checkout, así que
-- necesita lectura pública de las activas (mismo criterio que el menú). Los
-- repartidores NO son públicos: esa tabla queda solo para service role.
drop policy if exists "delivery_zones_select_public" on delivery_zones;
create policy "delivery_zones_select_public"
  on delivery_zones for select
  using (activo);
