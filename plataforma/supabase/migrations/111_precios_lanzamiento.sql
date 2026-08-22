  -- ============================================================
  --  Migración 111 — Precios de lanzamiento 2026
  --  ------------------------------------------------------------
  --  Nueva escalera oficial (vigente 2026-08-17):
  --    BASICO   Q0    (sin cambio)
  --    ESTANDAR Q299 → Q199
  --    PREMIUM  Q599 → Q349
  --    PRO      Q999 → Q599   (sigue PAUSADO comercialmente:
  --                            se reubica para no dejar un hueco
  --                            de 2.9x sobre Premium cuando se
  --                            reactive junto con Proveedores/FEL)
  --
  --  Motivo: la banda real del mercado guatemalteco es Q200–Q475
  --  (PosFile Q200/300/475, Vendty Q315, Sabor Suite ~Q343). Se
  --  baja toda la escalera de una vez para no romper el salto
  --  entre Estándar y Premium — mover solo Premium habría dejado
  --  Q50 de diferencia y matado el plan Estándar.
  --
  --  Reconcilia platform_settings (fuente real que usan
  --  leogin_compute_monthly_fee / leogin_fee_breakdown) y recalcula
  --  la mensualidad de los restaurantes con auto_price = true para
  --  que el KPI muestre el valor correcto de inmediato.
  --  Idempotente; seguro de re-ejecutar.
  --
  --  NOTA: los restaurantes con auto_price = false conservan su
  --  precio congelado a propósito — esta migración no los toca.
  -- ============================================================

  insert into platform_settings (key, value) values
    ('plan_price_ESTANDAR', '199'),
    ('plan_price_PREMIUM',  '349'),
    ('plan_price_PRO',      '599')
  on conflict (key) do update set value = excluded.value;

  select leogin_apply_auto_price_all();
