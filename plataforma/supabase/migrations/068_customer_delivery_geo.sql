-- ============================================================
--  Migración 068 — Guardar el pin de mapa del cliente (delivery)
--  ------------------------------------------------------------
--  Hasta ahora `customers.default_address` guardaba la dirección en
--  texto de la última entrega, pero el pin del mapa (lat/lng) NO se
--  recordaba: cada pedido a domicilio arrancaba el mapa en el centro
--  del restaurante en vez de la ubicación real del cliente.
--
--  Agrega default_lat/default_lng a customers y hace que
--  upsert_customer los reciba y guarde igual que la dirección
--  (coalesce: un pedido sin geo no borra el pin guardado antes).
--
--  Idempotente; seguro de re-ejecutar. Ejecutar tras 001..067.
-- ============================================================

alter table customers
  add column if not exists default_lat float8,
  add column if not exists default_lng float8;

comment on column customers.default_lat is
  'Latitud del último pin de entrega colocado por el cliente en el mapa (checkout o "Mi cuenta").';
comment on column customers.default_lng is
  'Longitud del último pin de entrega colocado por el cliente en el mapa.';

-- Firma extendida con 2 parámetros opcionales al final: no rompe llamadas
-- existentes (mismo mecanismo que 059/060 usaron para loyalty).
create or replace function upsert_customer(
  p_restaurant_id uuid,
  p_name          text,
  p_phone         text,
  p_address       text,
  p_zone          text,
  p_total         numeric,
  p_auth_user_id  uuid default null,
  p_lat           float8 default null,
  p_lng           float8 default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Mantener el enlace de cuenta 1:1: si este usuario estaba enlazado a otro
  -- cliente (otro teléfono), suéltalo antes de reasignarlo aquí.
  if p_auth_user_id is not null then
    update customers
       set auth_user_id = null
     where restaurant_id = p_restaurant_id
       and auth_user_id = p_auth_user_id;
  end if;

  insert into customers (
    restaurant_id, name, phone, default_address, default_zone,
    default_lat, default_lng,
    total_orders, total_spent, first_order_at, last_order_at, auth_user_id
  )
  values (
    p_restaurant_id, p_name, p_phone, nullif(p_address, ''), nullif(p_zone, ''),
    p_lat, p_lng,
    1, coalesce(p_total, 0), now(), now(), p_auth_user_id
  )
  on conflict (restaurant_id, phone) do update set
    name            = excluded.name,
    default_address = coalesce(excluded.default_address, customers.default_address),
    default_zone    = coalesce(excluded.default_zone, customers.default_zone),
    default_lat     = coalesce(excluded.default_lat, customers.default_lat),
    default_lng     = coalesce(excluded.default_lng, customers.default_lng),
    total_orders    = customers.total_orders + 1,
    total_spent     = customers.total_spent + coalesce(p_total, 0),
    first_order_at  = coalesce(customers.first_order_at, now()),
    last_order_at   = now(),
    auth_user_id    = coalesce(excluded.auth_user_id, customers.auth_user_id)
  returning id into v_id;
  return v_id;
end;
$$;
