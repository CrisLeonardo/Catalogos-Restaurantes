-- ============================================================
--  149 · Encargos con cupo y pago por transferencia del comensal
--  ------------------------------------------------------------
--  docs/planes/PLAN_NECESIDAD_Y_PLAN_EN_LINEA_2026-10-28.md (N4 y N6).
--
--  1. encargo_fechas — una «tanda» de encargos: «Tamales del sábado»,
--     con su día de entrega, hasta cuándo se reciben (cierre_at) y
--     cuántos PEDIDOS caben (cupo). Si `pago_adelantado`, el comensal
--     solo puede encargar pagando por transferencia. El cupo se cuenta
--     sobre los pedidos reales (orders.encargo_id) que no están anulados:
--     anular un pedido devuelve su lugar sin que nadie lo descuente.
--     Solo se accede vía service role (RLS encendido y sin políticas).
--
--  2. orders.encargo_id — a qué tanda pertenece el pedido (null = pedido
--     de ahora mismo).
--
--  3. orders.transfer_status / transfer_proof_path — pago por
--     transferencia: ESPERANDO (pidió, aún no sube comprobante) →
--     POR_CONFIRMAR (lo subió) → CONFIRMADO | RECHAZADO (lo revisó el
--     restaurante). El archivo va al bucket privado `payment-proofs`
--     (migración 148) bajo `pedidos/{restaurant_id}/`.
--
--  4. leogin_archive_abandoned_delivery_orders (de la 099) deja en paz
--     los encargos hasta un día después de su entrega.
--
--  Necesita la 148 (el bucket). Idempotente. Aplicar ANTES de desplegar:
--  sin ella el menú no enseña encargos y el checkout no ofrece
--  transferencia, pero los pedidos normales siguen igual.
-- ============================================================

create table if not exists public.encargo_fechas (
  id               uuid        primary key default gen_random_uuid(),
  restaurant_id    uuid        not null references public.restaurants(id) on delete cascade,
  titulo           text        not null check (char_length(titulo) between 2 and 80),
  entrega_fecha    date        not null,
  entrega_hora     text        check (entrega_hora is null or char_length(entrega_hora) <= 60),
  cierre_at        timestamptz not null,
  cupo             integer     not null check (cupo between 1 and 10000),
  pago_adelantado  boolean     not null default false,
  activo           boolean     not null default true,
  created_at       timestamptz not null default now()
);

comment on table public.encargo_fechas is
  'Tandas de encargos con cupo (mig. 149). Acceso solo vía service role.';

create index if not exists encargo_fechas_restaurant_idx
  on public.encargo_fechas(restaurant_id, entrega_fecha desc);

alter table public.encargo_fechas enable row level security;

-- La regla restrictiva de la 137 (Super Admin con segundo factor): el CI
-- (audit-rls-candados.mjs) exige que la lleve toda tabla nueva.
drop policy if exists super_admin_segundo_factor on public.encargo_fechas;
create policy super_admin_segundo_factor on public.encargo_fechas
  as restrictive for all to authenticated
  using ((select public.leogin_sesion_con_segundo_factor()))
  with check ((select public.leogin_sesion_con_segundo_factor()));

alter table public.orders
  add column if not exists encargo_id          uuid references public.encargo_fechas(id) on delete set null,
  add column if not exists transfer_status     text,
  add column if not exists transfer_proof_path text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_transfer_status_check') then
    alter table public.orders
      add constraint orders_transfer_status_check
      check (transfer_status is null or transfer_status in ('ESPERANDO', 'POR_CONFIRMAR', 'CONFIRMADO', 'RECHAZADO'));
  end if;
end;
$$;

create index if not exists orders_encargo_idx
  on public.orders(encargo_id)
  where encargo_id is not null;

-- ── 4. El auto-archivo de domicilio/para llevar respeta los encargos ──
--  La 099 cancela a las 6 h todo pedido DELIVERY/PICKUP sin cerrar. Un
--  encargo hecho el martes para el sábado se habría cancelado el mismo
--  martes (y repuesto su stock). Ahora un pedido con encargo solo se
--  archiva cuando ya pasó un día entero desde su fecha de entrega, en la
--  zona horaria del restaurante. Los demás pedidos, igual que antes.
create or replace function leogin_archive_abandoned_delivery_orders(p_restaurant_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  r record;
begin
  for r in
    select o.id
      from orders o
      left join encargo_fechas e on e.id = o.encargo_id
      left join restaurants rs on rs.id = o.restaurant_id
     where o.order_type in ('DELIVERY', 'PICKUP')
       and o.status not in ('CANCEL', 'DELIVERED')
       and (
         (o.encargo_id is null and o.created_at < now() - interval '6 hours')
         or (e.id is not null
             and e.entrega_fecha < (now() at time zone coalesce(rs.timezone, 'America/Guatemala'))::date - 1)
       )
       and (p_restaurant_id is null or o.restaurant_id = p_restaurant_id)
     for update of o skip locked
  loop
    perform restock_order(r.id);
    update orders set
      status           = 'CANCEL',
      cancelled_at     = now(),
      auto_archived_at = now()
    where id = r.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function leogin_archive_abandoned_delivery_orders(uuid) from public, anon, authenticated;
grant execute on function leogin_archive_abandoned_delivery_orders(uuid) to service_role;
