-- ============================================================
--  Migración 036 — Índices de rendimiento
--  ------------------------------------------------------------
--  Los tableros GLOBALES del Super Admin (cobros, métricas) escanean
--  por rango de fecha SIN filtrar por restaurante:
--    · page_visits  WHERE created_at >= hace 30 días   (afluencia)
--    · orders       WHERE created_at >= hace 30 días    (ventas)
--  Los índices existentes empiezan por restaurant_id, así que no
--  sirven para un escaneo global por fecha. Estos índices por
--  created_at aceleran esas consultas cuando los datos crezcan.
--  (Idempotente y seguro: solo agrega índices.)
-- ============================================================

create index if not exists page_visits_created_idx on page_visits(created_at);
create index if not exists orders_created_idx       on orders(created_at);

-- Búsqueda de cobros pendientes/vencidos (cron de impago + tablero).
create index if not exists invoices_status_due_idx
  on invoices(status, due_date)
  where status = 'PENDING';
