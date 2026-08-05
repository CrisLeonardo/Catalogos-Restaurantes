-- ============================================================
--  Migración 105 — Bot de pedidos por WhatsApp (Fase 1B)
--  ------------------------------------------------------------
--  La Fase 1A conectó el canal y mandó avisos. Esta fase deja que el
--  comensal ARME el pedido sin salir de WhatsApp, que es la brecha real
--  frente a OlaClick: hoy, aunque escriba al número, tiene que ir al menú
--  web igual.
--
--  El estado de la conversación ya existe (whatsapp_conversations.estado,
--  migración 102, creada vacía justo para esto). Aquí se agregan las dos
--  cosas que el bot necesita y no estaban:
--
--  · handoff_hasta — "hablar con una persona". Mientras esté en el futuro,
--    el bot NO responde: contesta el restaurante. Es una fecha y no un
--    booleano para que el silencio expire solo; un interruptor manual se
--    queda encendido para siempre el día que a nadie se le ocurra apagarlo,
--    y el cliente que vuelve tres días después se queda sin bot sin que
--    nadie entienda por qué.
--
--  · bloqueado — candado anti-abuso del dueño. Sin pagos en línea el pedido
--    se cierra sin cobrar, así que un número puede pedir y no recibir. Es
--    manual a propósito: bloquear automáticamente por N pedidos no
--    entregados castigaría al cliente cuyo repartidor no lo encontró.
--
--  Idempotente; seguro de re-ejecutar. Ejecutar tras 001..104.
-- ============================================================

alter table whatsapp_conversations
  add column if not exists handoff_hasta timestamptz,
  add column if not exists bloqueado     boolean not null default false;

comment on column whatsapp_conversations.handoff_hasta is
  'Mientras sea futuro, el bot no responde en este hilo (el cliente pidió '
  'hablar con una persona). Expira solo.';
comment on column whatsapp_conversations.bloqueado is
  'El restaurante bloqueó este número: el bot deja de tomarle pedidos. '
  'Manual, nunca automático.';

-- Cuántos pedidos por WhatsApp lleva un número y cuántos NO se entregaron.
-- Le da al dueño el dato para decidir un bloqueo sin tener que revisar
-- pedido por pedido. Se apoya en orders.source (migración 101).
create or replace function leogin_whatsapp_customer_stats(
  p_restaurant_id uuid,
  p_phone text
)
returns table (pedidos int, no_entregados int)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)::int                                              as pedidos,
    count(*) filter (where status = 'CANCEL')::int             as no_entregados
  from orders
  where restaurant_id = p_restaurant_id
    and source = 'WHATSAPP'
    and customer_phone = p_phone;
$$;

revoke execute on function leogin_whatsapp_customer_stats(uuid, text) from public, anon, authenticated;
grant execute on function leogin_whatsapp_customer_stats(uuid, text) to service_role;
