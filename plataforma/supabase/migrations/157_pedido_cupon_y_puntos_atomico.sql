-- ============================================================
--  157 · Pedido, cupón y puntos en una sola operación
--  ------------------------------------------------------------
--  Auditoría 2026-11-03, ficha 0.6 (F21, PA-T07, PA-T08). Reproducido en
--  la base local antes de este cambio:
--
--   · El pedido se creaba con el descuento YA restado del total, y el
--     cupón (coupon_id, discount) y su contador de usos se escribían
--     después, aparte y sin revisar errores. Si esa escritura fallaba,
--     quedaba un pedido con descuento sin cupón registrado (y al anularlo
--     no se devolvía el uso).
--   · `increment_coupon_usage` suma sin mirar el tope: un cupón de 1 uso
--     validado por dos pedidos a la vez terminó con 2 usos.
--   · El canje de recompensas iba DESPUÉS del pedido y su error se
--     ignoraba: dos pedidos contra un saldo que alcanzaba para uno
--     salieron los dos con el premio y solo uno pagó los puntos.
--
--  `leogin_crear_pedido` hace todo en UNA transacción: crea el pedido
--  (`place_order`, sin cambios), aplica el cupón con la fila bloqueada y
--  el tope revisado, y canjea cada recompensa (`leogin_loyalty_redeem_
--  reward`, que ya valida saldo y existencias con bloqueo). Si cualquier
--  paso falla, no queda nada: ni pedido, ni stock descontado, ni uso del
--  cupón, ni puntos.
--
--  Errores que el código traduce para el comensal:
--    · LGC01 — el cupón ya no está disponible (agotado, vencido, pausado,
--      no llega al mínimo). El pedido NO se crea: el comensal decide si
--      sigue sin él; nunca se le cambia el total en silencio.
--    · LGC02 — el descuento ya no coincide con el cupón (cambió mientras
--      pagaba).
--    · P0001 — los de siempre: sin stock, puntos insuficientes, recompensa
--      agotada (mensajes en español de place_order y del canje).
--
--  Reversión al anular o cancelar: ya existe y no cambia (migración 144,
--  `leogin_devolver_canjes`): devuelve el uso del cupón, los puntos
--  canjeados y la existencia de la recompensa, una sola vez por pedido.
--  Desde esta migración el cupón SIEMPRE queda registrado en el pedido
--  cuando se usó, así que esa devolución siempre lo encuentra.
--
--  Idempotencia: `place_order` inserta `client_id` con índice único
--  (migración 061). Un reintento del mismo pedido choca ahí y TODA la
--  transacción se deshace: no suma otro uso del cupón ni otro canje.
--
--  Aplicar ANTES de desplegar. Si el código llega primero, sigue creando
--  pedidos por el camino anterior (con los huecos de arriba) hasta que se
--  aplique; no se rompe el checkout.
-- ============================================================

create or replace function leogin_crear_pedido(
  p_restaurant_id       uuid,
  p_customer_name       text,
  p_customer_phone      text,
  p_order_type          text,
  p_address             text,
  p_delivery_zone       text,
  p_delivery_lat        double precision,
  p_delivery_lng        double precision,
  p_customer_id         uuid,
  p_subtotal            numeric,
  p_delivery_fee        numeric,
  p_total               numeric,
  p_notes               text,
  p_items               jsonb,
  p_payment_method      text    default 'CASH',
  p_cash_amount         numeric default null,
  p_tip                 numeric default 0,
  p_client_id           uuid    default null,
  -- Cupón: null si no hay. `p_discount` es el que se restó del total.
  p_coupon_id           uuid    default null,
  p_discount            numeric default 0,
  -- Recompensas canjeadas: cliente de lealtad (sesión de Google) y una
  -- entrada por recompensa en el carrito.
  p_reward_customer_id  uuid    default null,
  p_reward_ids          uuid[]  default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_placed   jsonb;
  v_order_id uuid;
  c          record;
  v_desc     numeric;
  v_rid      uuid;
begin
  v_placed := place_order(
    p_restaurant_id, p_customer_name, p_customer_phone, p_order_type,
    p_address, p_delivery_zone, p_delivery_lat, p_delivery_lng, p_customer_id,
    p_subtotal, p_delivery_fee, p_total, p_notes, p_items,
    p_payment_method, p_cash_amount, p_tip, null, p_client_id
  );
  v_order_id := (v_placed ->> 'id')::uuid;

  -- ── Cupón ─────────────────────────────────────────────────
  if p_coupon_id is not null then
    select id, code, discount_type, discount_value, min_order, max_uses, uses,
           valid_from, valid_until, is_active
      into c
      from coupons
     where id = p_coupon_id and restaurant_id = p_restaurant_id
       for update;

    if not found
       or not c.is_active
       or (c.valid_from is not null and now() < c.valid_from)
       or (c.valid_until is not null and now() >= c.valid_until)
       or (c.max_uses is not null and c.uses >= c.max_uses)
       or (c.min_order is not null and p_subtotal < c.min_order)
    then
      raise exception 'El cupón ya no está disponible.' using errcode = 'LGC01';
    end if;

    -- El descuento que se restó tiene que ser el que da el cupón ahora.
    v_desc := case when c.discount_type = 'PERCENT'
                   then p_subtotal * c.discount_value / 100
                   else c.discount_value end;
    v_desc := greatest(0, least(v_desc, p_subtotal));
    if abs(round(v_desc, 2) - round(coalesce(p_discount, 0), 2)) > 0.01 or v_desc <= 0 then
      raise exception 'El descuento del cupón cambió.' using errcode = 'LGC02';
    end if;

    update coupons set uses = uses + 1 where id = c.id;
    update orders
       set discount = p_discount, coupon_id = c.id, coupon_code = c.code
     where id = v_order_id;
  end if;

  -- ── Recompensas ───────────────────────────────────────────
  -- En fila a propósito: cada canje re-lee el saldo que dejó el anterior.
  -- Cualquier excepción (saldo, existencias, límite) deshace TODO.
  if coalesce(array_length(p_reward_ids, 1), 0) > 0 then
    if p_reward_customer_id is null then
      raise exception 'Inicia sesión con Google para canjear recompensas.' using errcode = 'P0001';
    end if;
    foreach v_rid in array p_reward_ids loop
      perform leogin_loyalty_redeem_reward(p_restaurant_id, p_reward_customer_id, v_rid, v_order_id);
    end loop;
  end if;

  return v_placed;
end;
$$;

revoke execute on function leogin_crear_pedido(
  uuid, text, text, text, text, text, double precision, double precision, uuid,
  numeric, numeric, numeric, text, jsonb, text, numeric, numeric, uuid,
  uuid, numeric, uuid, uuid[]
) from public, anon, authenticated;
grant execute on function leogin_crear_pedido(
  uuid, text, text, text, text, text, double precision, double precision, uuid,
  numeric, numeric, numeric, text, jsonb, text, numeric, numeric, uuid,
  uuid, numeric, uuid, uuid[]
) to service_role;
