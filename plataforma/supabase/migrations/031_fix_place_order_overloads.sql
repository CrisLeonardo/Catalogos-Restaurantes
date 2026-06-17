-- ============================================================
--  Migración 031 — Eliminar sobrecargas obsoletas de place_order
--
--  Problema: cada migración (016, 025, 027, 030) usó CREATE OR REPLACE
--  con una firma diferente, acumulando 4 versiones de place_order:
--    · 14 params (016/019/021)
--    · 16 params (025: + p_payment_method, p_cash_amount)
--    · 17 params (027: + p_tip)
--    · 18 params (030: + p_waiter_id)  ← la correcta y única que debe quedar
--
--  PostgreSQL no puede resolver la ambigüedad cuando el cliente público
--  llama sin p_waiter_id: tanto la versión de 17 como la de 18 params
--  son candidatas válidas → error "could not choose the best candidate".
--
--  Solución: eliminar las 3 versiones obsoletas. La versión de 18 params
--  ya tiene p_waiter_id DEFAULT NULL, por lo que funciona para ambos casos
--  (pedido público y pedido de mesero).
-- ============================================================

-- Versión 14 params (016 / 019 / 021)
drop function if exists public.place_order(
  uuid, text, text, text, text, text, float8, float8,
  uuid, numeric, numeric, numeric, text, jsonb
);

-- Versión 16 params (025: + p_payment_method, p_cash_amount)
drop function if exists public.place_order(
  uuid, text, text, text, text, text, float8, float8,
  uuid, numeric, numeric, numeric, text, jsonb,
  text, numeric
);

-- Versión 17 params (027: + p_tip)
drop function if exists public.place_order(
  uuid, text, text, text, text, text, float8, float8,
  uuid, numeric, numeric, numeric, text, jsonb,
  text, numeric, numeric
);

-- Queda SOLO la versión de 18 params (030: + p_waiter_id DEFAULT NULL)
-- que maneja ambos flujos: pedido público (waiter_id = NULL) y mesero.
