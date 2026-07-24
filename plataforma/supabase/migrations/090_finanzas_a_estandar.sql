-- ============================================================
--  Migración 090 — Finanzas pasa a incluirse desde plan Estándar
--  ------------------------------------------------------------
--  hasAnalytics (plans.ts) se dividió en hasFinance (reportes
--  financieros + corte de caja, ahora true desde ESTANDAR) y
--  hasAnalytics (analítica avanzada/inventario/personal/promociones,
--  sigue exclusivo de PREMIUM/PRO).
--
--  El nav de /admin oculta por completo un ítem "lockable" cuando
--  restaurants.modules.<key> es false PERO el plan ya lo incluye
--  (lockableNavItem devuelve [] en ese caso, no un candado). Como
--  modules.finanzas siempre se guardó en false para ESTANDAR (tanto
--  en el registro self-serve como en los presets del editor del
--  super admin), todo restaurante ya existente en ESTANDAR se
--  quedaría SIN el ítem "Finanzas" en el nav — ni bloqueado ni
--  accesible — si no se reconcilia este flag aquí.
--
--  Idempotente; seguro de re-ejecutar.
-- ============================================================

update restaurants
set modules = jsonb_set(coalesce(modules, '{}'::jsonb), '{finanzas}', 'true'::jsonb)
where plan_actual = 'ESTANDAR'
  and coalesce((modules->>'finanzas')::boolean, false) = false;
