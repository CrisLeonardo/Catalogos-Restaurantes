-- ============================================================
--  Migración 086 — Menú del comensal en más de un idioma (ES/EN)
--  (Fase 3 auditoría de lanzamiento: experiencia multi-mercado)
--  ------------------------------------------------------------
--  · products.name_en / products.description_en: traducción opcional al
--    inglés. NULL/vacío = el comensal en inglés ve el texto en español
--    (fallback automático, ver lib/locale). El dueño NO tiene que traducir
--    todo su menú para poder activar el selector de idioma.
--  · categories.name_en: mismo patrón para el nombre de la categoría.
--  · restaurants.menu_languages: text[] con los idiomas que el dueño activó
--    para su menú público (además del español, que siempre existe). Hoy
--    solo se ofrece 'en'; el arreglo deja espacio a futuros idiomas sin
--    otra migración. Default '{}' = selector de idioma oculto (el dueño no
--    lo ha activado) — evita mostrar un switch ES/EN vacío a restaurantes
--    que nunca lo pidieron.
--  Ejecutar DESPUÉS de 001..085.
-- ============================================================

alter table products
  add column if not exists name_en text,
  add column if not exists description_en text;

alter table categories
  add column if not exists name_en text;

alter table restaurants
  add column if not exists menu_languages text[] default '{}'::text[];

comment on column products.name_en is
  'Traducción al inglés del nombre (opcional). NULL/vacío = usa products.name (fallback). Ver lib/locale.';
comment on column products.description_en is
  'Traducción al inglés de la descripción (opcional). NULL/vacío = usa products.description (fallback).';
comment on column categories.name_en is
  'Traducción al inglés del nombre de la categoría (opcional). NULL/vacío = usa categories.name (fallback).';
comment on column restaurants.menu_languages is
  'Idiomas adicionales al español que el dueño activó para su menú público '
  '(hoy solo se ofrece {en}). Vacío = selector de idioma oculto.';
