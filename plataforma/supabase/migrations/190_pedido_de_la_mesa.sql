-- ============================================================
--  190 · El pedido de la mesa (auditoría «La carta que vende», §5 pieza 5)
--  ------------------------------------------------------------
--  Quien escanea el QR de la Mesa 4 puede sumar lo suyo a una lista
--  COMPARTIDA de esa mesa: cada teléfono agrega, todos ven la lista y lo
--  que lleva cada persona, y cualquiera la manda a cocina como UN pedido.
--  Lo activa cada restaurante (config `pedidoDeMesa`, apagado por omisión):
--  es el piloto.
--
--  · mesa_cuentas: la lista abierta de una mesa (una sola abierta por mesa,
--    índice único parcial). Al enviarse guarda el pedido que generó.
--  · mesa_cuenta_lineas: lo que sumó cada persona (nombre corto que ella
--    escribe y el visitor_id anónimo del aparato, para que solo quite lo
--    suyo). El precio se vuelve a calcular al crear el pedido.
--
--  El envío reutiliza createOrder con el id de la cuenta como client_id:
--  si dos teléfonos tocan «Enviar» a la vez, sale UN pedido.
--
--  RLS sin políticas permisivas: lo escribe y lo lee el servidor
--  (lib/actions/mesa-compartida.ts, con límite por IP). Regla restrictiva
--  del segundo factor (migración 137), como toda tabla con RLS.
--
--  Aplicar ANTES de encender `pedidoDeMesa` en un restaurante. Sin la
--  tabla, el carrito no ofrece la mesa y todo sigue como hoy.
-- ============================================================

begin;

create table if not exists public.mesa_cuentas (
  id             uuid        primary key default gen_random_uuid(),
  restaurant_id  uuid        not null references public.restaurants(id) on delete cascade,
  mesa           int         not null check (mesa between 1 and 200),
  estado         text        not null default 'abierta' check (estado in ('abierta', 'enviada')),
  order_id       uuid        references public.orders(id) on delete set null,
  created_at     timestamptz not null default now(),
  enviada_at     timestamptz
);

create unique index if not exists mesa_cuentas_una_abierta
  on public.mesa_cuentas (restaurant_id, mesa) where estado = 'abierta';

create table if not exists public.mesa_cuenta_lineas (
  id             uuid        primary key default gen_random_uuid(),
  cuenta_id      uuid        not null references public.mesa_cuentas(id) on delete cascade,
  visitor_id     uuid        not null,
  persona        text        not null check (char_length(persona) between 1 and 24),
  product_id     uuid        not null references public.products(id) on delete cascade,
  nombre         text        not null check (char_length(nombre) between 1 and 120),
  precio         numeric(12, 2) not null check (precio >= 0),
  quantity       int         not null check (quantity between 1 and 50),
  options        jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists mesa_cuenta_lineas_por_cuenta on public.mesa_cuenta_lineas (cuenta_id, created_at);

alter table public.mesa_cuentas enable row level security;
drop policy if exists super_admin_segundo_factor on public.mesa_cuentas;
create policy super_admin_segundo_factor on public.mesa_cuentas
  as restrictive for all to authenticated
  using ((select public.leogin_sesion_con_segundo_factor()))
  with check ((select public.leogin_sesion_con_segundo_factor()));
revoke all on public.mesa_cuentas from public, anon, authenticated, service_role;
grant select, insert, update on public.mesa_cuentas to service_role;

alter table public.mesa_cuenta_lineas enable row level security;
drop policy if exists super_admin_segundo_factor on public.mesa_cuenta_lineas;
create policy super_admin_segundo_factor on public.mesa_cuenta_lineas
  as restrictive for all to authenticated
  using ((select public.leogin_sesion_con_segundo_factor()))
  with check ((select public.leogin_sesion_con_segundo_factor()));
revoke all on public.mesa_cuenta_lineas from public, anon, authenticated, service_role;
grant select, insert, delete on public.mesa_cuenta_lineas to service_role;

commit;
