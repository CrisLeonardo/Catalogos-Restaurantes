-- 054 — Mejoras al arqueo de caja
-- · denomination_breakdown: desglose por denominación (bil_200, mon_1, etc.)
-- · shift_label:            etiqueta de turno libre ("Apertura", "Cierre", …)
-- · cashier_name:           snapshot del nombre del cajero al momento del corte

alter table cash_counts
  add column if not exists denomination_breakdown jsonb,
  add column if not exists shift_label             text,
  add column if not exists cashier_name            text;
