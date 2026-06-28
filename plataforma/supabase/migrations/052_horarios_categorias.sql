-- ============================================================
--  Migración 052 — Horarios de menú por categoría
--  ------------------------------------------------------------
--  Permite que una categoría (p. ej. "Desayunos", "Almuerzos",
--  "Cena") solo esté disponible en ciertas franjas horarias.
--
--  categories.availability (JSONB) usa EXACTAMENTE el mismo
--  formato que restaurants.hours (ver lib/hours.ts):
--    { "1": [["07:00","11:00"]], "0": [["08:00","12:00"]], ... }
--    · Clave = día (0=domingo … 6=sábado, como Date.getDay()).
--    · NULL                → disponible siempre (sin restricción).
--    · Día ausente / vacío → no disponible ese día.
--    · Cierre <= apertura  → la franja cruza la medianoche.
--
--  RLS: no requiere cambios. Las políticas filtran FILAS, no
--  columnas, y la columna es pública por diseño (igual que el
--  resto del menú). El menú del comensal filtra/etiqueta por hora
--  en el cliente con la zona horaria del restaurante.
--
--  Ejecutar DESPUÉS de 001..051.
-- ============================================================

alter table categories
  add column if not exists availability jsonb;

comment on column categories.availability is
  'Horario de disponibilidad de la categoría (mismo formato JSONB que restaurants.hours). '
  'NULL = disponible siempre. Usado para menús por franja: desayuno / almuerzo / cena.';
