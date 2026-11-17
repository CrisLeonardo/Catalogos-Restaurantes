-- ============================================================
--  185 · El diseño anterior de la carta (ficha 2.7 de la auditoría)
--  ------------------------------------------------------------
--  Hasta hoy, «Guardar» en Personalizar publicaba y no había vuelta
--  atrás: si el diseño nuevo no gustó, había que rehacer el anterior a
--  mano. Ahora, al publicar un cambio de diseño, se guarda aquí el
--  diseño que había (solo lo visual: colores, letras, estructura) y el
--  panel ofrece «Volver al anterior». Volver también se puede deshacer:
--  los dos diseños se intercambian.
--
--  Solo el anterior, no un historial (decisión del dueño, 2026-11-16).
--  El logo, el nombre, los textos y la configuración de pedidos nunca
--  viajan con un diseño, así que volver no los toca.
--
--  Aplicar ANTES de desplegar el código. Si falta, el panel publica como
--  siempre y simplemente no ofrece «Volver al anterior».
--  Independiente de la 184 (PR #130).
-- ============================================================

begin;

alter table public.restaurant_themes
  add column if not exists config_anterior jsonb;

comment on column public.restaurant_themes.config_anterior is
  'Diseño publicado antes del actual (solo claves visuales, ver '
  'TEMPLATE_VISUAL_KEYS). Lo usa «Volver al anterior» en Personalizar '
  '(ficha 2.7). NULL = no hay anterior.';

commit;
