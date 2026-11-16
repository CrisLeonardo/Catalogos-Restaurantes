-- ============================================================
--  183 · Pedido de prueba (ficha 2.2 de la auditoría integral)
--  ------------------------------------------------------------
--  El tercer paso de «Llega a tu primer pedido» le pide al dueño
--  que haga un pedido desde su propia carta, lo vea llegar a
--  cocina y lo termine. Ese pedido es real mientras recorre el
--  flujo, pero no debe quedar en las cifras, la caja, los puntos
--  ni las existencias.
--
--    1. `orders.es_prueba`: solo el servidor la escribe, con un pase
--       firmado que entrega el panel al dueño (lib/pedido-prueba.ts).
--       El candado de columnas (139) la protege de la sesión del
--       navegador.
--    2. `leogin_terminar_pedido_prueba`: cierra un pedido de prueba
--       en una transacción. Repone existencias (restock_order),
--       devuelve canjes y cupón (leogin_devolver_canjes) y lo deja en
--       CANCEL. Como todo informe, la caja y el tope de pedidos ya
--       excluyen CANCEL, el pedido deja de contar sin tocar sus
--       funciones. Nunca pasa por DELIVERED/SERVED, así que tampoco
--       acumula puntos. No pide firma de encargado: solo acepta
--       pedidos marcados como prueba.
--
--  Aplicar ANTES de desplegar el código (el panel lee la columna).
--  Independiente de la 182 (PR #121): puede ir antes o después.
-- ============================================================

begin;

alter table public.orders
  add column if not exists es_prueba boolean not null default false;

comment on column public.orders.es_prueba is
  'Pedido de prueba del dueño (primeros pasos). Se cierra con leogin_terminar_pedido_prueba y no cuenta en cifras.';

create index if not exists orders_prueba_idx
  on public.orders(restaurant_id) where es_prueba;

-- La sesión del navegador no puede marcar ni desmarcar una prueba.
create or replace function public.leogin_candado_pedido()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  k text;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Los pedidos solo se crean desde el servidor.'
      using errcode = '42501';
  end if;

  foreach k in array array[
    'id', 'restaurant_id', 'order_number', 'public_token', 'customer_id', 'created_at', 'client_id',
    'subtotal', 'total', 'discount', 'tip', 'delivery_fee', 'loyalty_discount',
    'loyalty_points_redeemed', 'gift_card_id', 'gift_card_amount', 'coupon_id', 'coupon_code',
    'es_prueba'
  ] loop
    if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
      raise exception 'El campo % del pedido solo se cambia desde el servidor.', k
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

create or replace function public.leogin_terminar_pedido_prueba(
  p_restaurante uuid, p_pedido uuid, p_actor uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_pedido public.orders%rowtype;
begin
  if p_restaurante is null or p_pedido is null or p_actor is null then
    raise exception 'Operación inválida.' using errcode = '22023';
  end if;

  select * into v_pedido from public.orders
    where id = p_pedido and restaurant_id = p_restaurante for update;
  if not found then
    raise exception 'Pedido no encontrado.' using errcode = 'LGD01';
  end if;
  if not v_pedido.es_prueba then
    raise exception 'Solo se terminan así los pedidos de prueba.' using errcode = 'LGD01';
  end if;
  if v_pedido.status = 'CANCEL' then
    return jsonb_build_object('estado', 'CANCEL', 'cambio', false);
  end if;
  if v_pedido.status in ('DELIVERED', 'SERVED') then
    raise exception 'Este pedido ya se cerró.' using errcode = 'LGD01';
  end if;

  -- El estado aún no es CANCEL: las dos reponen.
  perform public.restock_order(p_pedido);
  perform public.leogin_devolver_canjes(p_pedido);

  update public.orders set status = 'CANCEL', cancelled_at = clock_timestamp()
    where id = p_pedido;

  insert into public.activity_log(restaurant_id, actor_id, action, entity, meta)
    values (p_restaurante, p_actor, 'pedido_prueba_terminado', p_pedido::text,
      jsonb_build_object('pedido', v_pedido.order_number, 'estado_previo', v_pedido.status));

  return jsonb_build_object('estado', 'CANCEL', 'cambio', true);
end $$;

revoke all on function public.leogin_terminar_pedido_prueba(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.leogin_terminar_pedido_prueba(uuid, uuid, uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;
