-- ============================================================
--  128 · Sentar la mesa
--  ------------------------------------------------------------
--  Hallazgo M-02 de la auditoría «Mesas vs Tomar pedidos», y el que
--  de verdad separa las dos pantallas.
--
--  Hasta aquí una mesa solo existía si tenía un pedido: `TableOccupancy`
--  se construye entero a partir de `orders` con `order_type = 'DINE_IN'`
--  (ver lib/db/orders.ts, getActiveTableNumbers). O sea que el sistema
--  no sabía decir «hay cuatro personas en la 7 desde hace seis minutos y
--  todavía no han pedido». Consecuencias, todas reales:
--
--   · la hostess no puede sentar a nadie: no hay dónde anotarlo;
--   · «Mesas con gente» miente durante los primeros minutos de cada mesa;
--   · dos meseros van a la misma mesa recién sentada sin saberlo;
--   · el número de comensales anotado antes del primer plato vivía en
--     `partyDraft`, en la MEMORIA de ese aparato, y se perdía al cambiar
--     de teléfono;
--   · reservas y lista de espera tienen estado 'SEATED' desde las
--     migraciones 043 y 087 y no dicen EN QUÉ MESA;
--   · nadie es dueño de una mesa hasta que apunta el primer plato, así
--     que no hay forma de repartir el salón entre meseros.
--
--  Aquí vive el turno de una mesa: desde que se sienta la gente hasta
--  que se cierra la cuenta. Es hermano de `table_splits` (migración 125)
--  —estado de trabajo compartido entre los aparatos del local, no
--  contabilidad—: lo vendido sigue estando en `orders`.
--
--  El pedido NO se cuelga de aquí a propósito. Un pedido que llega por
--  QR sin que nadie haya sentado la mesa tiene que seguir apareciendo en
--  el salón, así que la ocupación es la UNIÓN de las dos cosas: mesas con
--  pedido vivo (como siempre) más mesas sentadas sin pedido (nuevo). Ni
--  una sola consulta existente cambia de significado.
--
--  Idempotente. Ejecutar DESPUÉS de 001..127.
-- ============================================================

-- ── 1. El turno de la mesa ───────────────────────────────────
create table if not exists table_sessions (
  id             uuid        primary key default gen_random_uuid(),
  restaurant_id  uuid        not null references restaurants(id) on delete cascade,
  table_number   int         not null,

  -- Cuánta gente se sentó. NULL = nadie lo anotó; la ficha omite el dato
  -- en vez de inventar un número (mismo criterio que orders.party_size).
  party_size     int,

  -- A quién le toca la mesa. NULL = a nadie todavía: se la queda quien
  -- apunte el primer plato, que es lo que pasaba antes de esta tabla.
  waiter_id      uuid        references profiles(id) on delete set null,
  -- Quién la sentó (hostess, encargado, el propio mesero).
  seated_by      uuid        references profiles(id) on delete set null,

  seated_at      timestamptz not null default now(),
  -- Se pone al cerrar la cuenta (freeTable) o al soltar la mesa a mano.
  closed_at      timestamptz,

  -- De dónde salió esta gente. Es lo que permite que «Sentar» desde una
  -- reserva o desde la lista de espera cierre el círculo (M-04).
  source         text        not null default 'walk_in',
  -- id de la reserva o de la entrada de lista de espera, si vino de ahí.
  origin_id      uuid,

  note           text,

  constraint table_sessions_source_check
    check (source in ('walk_in', 'reservation', 'waitlist', 'order')),
  constraint table_sessions_party_range
    check (party_size is null or (party_size >= 1 and party_size <= 100)),
  constraint table_sessions_table_range
    check (table_number >= 1 and table_number <= 999)
);

comment on table table_sessions is
  'Turno de una mesa: desde que se sienta la gente hasta que se cierra la '
  'cuenta. Existe para que una mesa pueda estar OCUPADA SIN PEDIDO — antes '
  'la ocupación salía entera de orders y una mesa recién sentada era '
  'invisible (migración 128, M-02). La ocupación del salón es la UNIÓN de '
  'esta tabla con los pedidos DINE_IN vivos: un pedido por QR sin sesión '
  'sigue ocupando su mesa.';

comment on column table_sessions.waiter_id is
  'Mesero al que le toca la mesa. Es lo que permite repartir el salón y '
  'pintar «mis mesas» distinto de las de los demás (M-05). NULL = sin '
  'asignar: se la queda quien apunte el primer plato.';

comment on column table_sessions.closed_at is
  'Cierre del turno. Lo pone freeTable al cobrar, «soltar la mesa» a mano, '
  'o el archivador de abandonadas a las 24 h.';

-- ── 2. Una mesa, un turno abierto ────────────────────────────
--    El candado de verdad va aquí y no en la aplicación: dos aparatos
--    sentando la misma mesa a la vez es exactamente el caso que esta
--    tabla viene a resolver, y ganarle por código sería una carrera.
--    El índice es PARCIAL: los turnos cerrados se acumulan sin estorbar,
--    que es lo que hace que esta tabla sirva luego para saber cuántos
--    turnos dio una mesa.
create unique index if not exists table_sessions_abierta_unica
  on table_sessions (restaurant_id, table_number)
  where closed_at is null;

--    Y para el histórico por día (turnos de mesa, futuro informe).
create index if not exists table_sessions_historico_idx
  on table_sessions (restaurant_id, seated_at desc);

-- ── 3. Quién puede tocarla ───────────────────────────────────
--    Mismo criterio que table_splits (125) y waiter_calls (048), más las
--    membresías (113): el dueño del modelo de membresías nace con
--    `profiles.restaurant_id` en null y sin `is_member_of` no podría
--    sentar a nadie en su propio local.
alter table table_sessions enable row level security;

drop policy if exists "staff can manage table_sessions" on table_sessions;
create policy "staff can manage table_sessions"
  on table_sessions for all
  using (
    public.is_member_of(restaurant_id)
    or exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'SUPER_ADMIN' or p.restaurant_id = table_sessions.restaurant_id)
    )
  )
  with check (
    public.is_member_of(restaurant_id)
    or exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and (p.role = 'SUPER_ADMIN' or p.restaurant_id = table_sessions.restaurant_id)
    )
  );

-- ── 4. La reserva y la cola dicen EN QUÉ MESA ────────────────
--    Las dos tienen estado 'SEATED' desde 043 y 087 y ninguna guardaba
--    número de mesa: la lista de espera manda un WhatsApp diciendo «ya
--    tenemos mesa lista» sin saber cuál (M-04). La columna es NULL
--    mientras no se sienten; al sentarlas se escribe, y en el mismo acto
--    se abre el turno de arriba con `source` = 'reservation'/'waitlist'.
alter table reservations     add column if not exists table_number int;
alter table waitlist_entries add column if not exists table_number int;

comment on column reservations.table_number is
  'Mesa donde se sentó la reserva. NULL mientras no llegue. Se escribe al '
  'pasar a SEATED, junto con la fila de table_sessions (migración 128, M-04).';
comment on column waitlist_entries.table_number is
  'Mesa donde se sentó el grupo que esperaba. NULL mientras espera '
  '(migración 128, M-04).';

-- ── 5. El salón se vacía solo, también de sentadas ───────────
--    La 080 archiva pedidos DINE_IN de más de 24 h para que el salón no
--    amanezca lleno. Una mesa SENTADA y olvidada la dejaría llena igual,
--    así que el mismo trabajo la cierra: una regla para vaciar el salón,
--    no dos. Se redefine la función entera porque `create or replace` no
--    admite parches.
create or replace function leogin_archive_abandoned_orders(p_restaurant_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count int := 0;
  r record;
begin
  for r in
    select id from orders
     where order_type = 'DINE_IN'
       and status not in ('CANCEL', 'DELIVERED')
       and created_at < now() - interval '24 hours'
       and (p_restaurant_id is null or restaurant_id = p_restaurant_id)
     for update skip locked
  loop
    perform restock_order(r.id);
    update orders set
      status           = 'CANCEL',
      cancelled_at     = now(),
      auto_archived_at = now()
    where id = r.id;
    v_count := v_count + 1;
  end loop;

  /* Turnos de mesa abandonados (migración 128). No suman al contador:
     lo que se le reporta al dueño son PEDIDOS archivados, y una mesa que
     se sentó y nunca pidió no es un pedido perdido — es una silla que se
     quedó marcada. */
  update table_sessions
     set closed_at = now()
   where closed_at is null
     and seated_at < now() - interval '24 hours'
     and (p_restaurant_id is null or restaurant_id = p_restaurant_id);

  return v_count;
end;
$fn$;

comment on function leogin_archive_abandoned_orders is
  'Cancela pedidos DINE_IN activos con más de 24h (repone stock, libera la '
  'mesa) y marca auto_archived_at; además cierra los turnos de mesa '
  'abandonados de table_sessions (migración 128). p_restaurant_id NULL = '
  'todos los restaurantes (uso del cron); con valor = botón manual de un '
  'restaurante concreto (ver archiveAbandonedTables en lib/actions/orders.ts).';
