-- ============================================================
--  Migración 122 — Motivo de la llamada al mesero
--
--  Hasta ahora `waiter_calls` guardaba QUE alguien llamó, pero no
--  PARA QUÉ. Para el salón son dos cosas muy distintas: "necesito
--  algo" (traer salsa, otra bebida) y "quiero pagar" — la segunda
--  es la que hay que atender primero porque libera la mesa.
--
--  Sin esta columna el rediseño no puede distinguir la mesa que
--  pidió la cuenta de la que solo llamó, que es justo el aviso más
--  útil del salón.
--
--  'call' es el valor por defecto: las llamadas ya guardadas eran
--  todas del botón genérico, así que el backfill es correcto.
-- ============================================================

alter table waiter_calls
  add column if not exists reason text not null default 'call';

do $$
begin
  alter table waiter_calls
    add constraint waiter_calls_reason_check
    check (reason in ('call', 'bill'));
exception
  when duplicate_object then null;
end $$;

comment on column waiter_calls.reason is
  'Para qué llamó el comensal: call = necesita al mesero, bill = pide la cuenta.';

-- El índice de pendientes se usa para pintar el salón: al filtrar
-- también por motivo conviene tenerlo dentro del índice.
drop index if exists waiter_calls_restaurant_pending;
create index if not exists waiter_calls_restaurant_pending
  on waiter_calls(restaurant_id, created_at desc)
  include (table_number, reason)
  where resolved_at is null;
