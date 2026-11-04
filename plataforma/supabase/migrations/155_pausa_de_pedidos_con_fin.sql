-- ============================================================
--  155 · Pausa de pedidos con hora de fin
--  ------------------------------------------------------------
--  Auditoría 2026-11-03, ficha 0.4 (X01, R26). La pausa era un interruptor
--  dentro del formulario de horario: decía «Pedidos en pausa» antes de
--  guardar y no se quitaba sola. Ahora es una acción inmediata que
--  confirma el servidor, con duración (15 / 30 / 60 min) o «hasta
--  reactivar».
--
--  `orders_paused_until`:
--    · null  → la pausa (si `orders_paused`) dura hasta que alguien la quite;
--    · fecha → la pausa termina sola a esa hora. No hace falta ningún
--      proceso que la apague: quien la lee compara con la hora actual
--      (lib/pausa-pedidos.ts). `orders_paused` puede seguir en true con una
--      fecha ya pasada; eso significa «la pausa terminó a esa hora».
--
--  Aplicar ANTES de desplegar. Si el código llega primero, la pausa
--  «hasta reactivar» funciona igual y las pausas con duración responden
--  con un error que pide aplicar esta migración; nada se rompe al pedir.
-- ============================================================

alter table restaurants
  add column if not exists orders_paused_until timestamptz;

comment on column restaurants.orders_paused_until is
  'Fin de la pausa de pedidos (exclusivo). null = hasta que se reactive a mano. Solo cuenta si orders_paused = true.';
