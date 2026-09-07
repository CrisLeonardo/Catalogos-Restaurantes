-- ============================================================
--  129 · Una mesa puede pagar de dos formas
--  ------------------------------------------------------------
--  Hallazgo M-11 de la auditoría «Mesas vs Tomar pedidos».
--
--  `freeTable()` cerraba todos los pedidos de una mesa de golpe con UN
--  solo `orders.payment_method`, y el arqueo de caja suma
--  `orders.total` agrupando por esa columna (ver `expectedCash` en
--  lib/actions/finanzas.ts). O sea que una mesa que paga mitad en
--  efectivo y mitad con tarjeta —lo más normal del mundo en una mesa de
--  seis— tenía dos salidas, las dos malas:
--
--   · marcarla toda en efectivo, y la caja sale LARGA esa noche;
--   · marcarla toda en tarjeta, y sale CORTA.
--
--  En los dos casos el cuadre de la noche miente y no hay nada escrito
--  que lo explique. Y tampoco quedaba registro de un cobro PARCIAL: si
--  la mesa paga la mitad y se corta la luz, esa mitad no existía en
--  ninguna parte (el reparto de la migración 125 dice quién dijo que ya
--  pagó, no cuánto dinero entró ni cómo).
--
--  Aquí vive el dinero que de verdad entró: una fila por movimiento.
--
--  QUÉ NO CAMBIA. `orders.payment_method` se sigue escribiendo, con el
--  método que más dinero puso, y todo lo que ya la leía —el ticket, los
--  informes, analítica, los canales— sigue funcionando igual de bien que
--  antes. Lo que gana precisión es lo que de verdad la necesita: el
--  efectivo esperado en el cajón, que ahora se cuenta de esta tabla
--  cuando existe.
--
--  Idempotente. Ejecutar DESPUÉS de 001..128.
-- ============================================================

create table if not exists order_payments (
  id             uuid        primary key default gen_random_uuid(),
  restaurant_id  uuid        not null references restaurants(id) on delete cascade,
  -- Se cuelga del PEDIDO y no de la mesa: una mesa se cierra, se archiva
  -- y su número se reutiliza esa misma noche, mientras que el pedido es
  -- la venta y no se mueve. Además así el borrado en cascada ya está.
  order_id       uuid        not null references orders(id) on delete cascade,

  method         text        not null,
  -- Lo que se aplicó a ESTE pedido con ESTE método. Siempre positivo: una
  -- devolución no es un cobro negativo, es una anulación (migración 079).
  amount         numeric(10,2) not null check (amount > 0),
  -- Solo en efectivo: lo que puso el cliente, para dejar el vuelto por
  -- escrito. NULL cuando no cubre el total o cuando no es efectivo.
  cash_received  numeric(10,2),

  taken_by       uuid        references profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

comment on table order_payments is
  'El dinero que de verdad entró, un movimiento por fila. Existe porque '
  'orders.payment_method es UNA columna y una mesa que paga mitad efectivo '
  'y mitad tarjeta descuadraba el arqueo de la noche sin dejar rastro '
  '(migración 129, M-11). orders.payment_method se sigue escribiendo con el '
  'método que más puso, para todo lo que ya la leía.';

comment on column order_payments.amount is
  'Lo aplicado a este pedido con este método. La suma de las filas de un '
  'pedido no tiene por qué llegar a su total: un cobro parcial es una fila '
  'y ya, y eso es justo lo que antes no se podía escribir.';

-- El arqueo pregunta «cuánto efectivo entró hoy en este local».
create index if not exists order_payments_arqueo_idx
  on order_payments (restaurant_id, created_at desc);

-- Y la cuenta de una mesa pregunta «cuánto llevan pagado de este pedido».
create index if not exists order_payments_order_idx
  on order_payments (order_id);

alter table order_payments enable row level security;

-- Mismo criterio que table_splits (125) y table_sessions (128): personal
-- del local, dueño por membresía (113) o super admin.
drop policy if exists "staff can manage order_payments" on order_payments;
create policy "staff can manage order_payments"
  on order_payments for all
  using (
    public.is_member_of(restaurant_id)
    or exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'SUPER_ADMIN' or p.restaurant_id = order_payments.restaurant_id)
    )
  )
  with check (
    public.is_member_of(restaurant_id)
    or exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'SUPER_ADMIN' or p.restaurant_id = order_payments.restaurant_id)
    )
  );
