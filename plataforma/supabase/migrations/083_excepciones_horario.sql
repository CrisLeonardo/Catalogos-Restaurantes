-- ============================================================
--  Migración 083 — Excepciones de horario por fecha puntual (feriados)
--  (Fase 2 auditoría de lanzamiento: retención y utilidades de personal)
--  · restaurants.hour_exceptions: JSONB { "YYYY-MM-DD": [["HH:MM","HH:MM"], ...] }
--    Clave = fecha exacta (zona horaria del restaurante). Lista vacía []
--    = cerrado ese día completo (feriado). Fecha ausente = usa el horario
--    semanal normal (restaurants.hours) sin cambios.
--  Ejecutar DESPUÉS de 001..082.
-- ============================================================

alter table restaurants
  add column if not exists hour_exceptions jsonb;

comment on column restaurants.hour_exceptions is
  'Excepciones puntuales al horario semanal (restaurants.hours) por fecha '
  'exacta "YYYY-MM-DD": lista de turnos [["HH:MM","HH:MM"]], o [] para '
  'cerrado todo el día (feriado). NULL o fecha ausente = sin excepción, '
  'se usa el horario semanal normal. Ver lib/hours.ts.';
