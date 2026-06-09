-- ============================================================
--  Motor de personalización — extiende restaurant_themes
--  Tres columnas nuevas (overrides parciales por restaurante):
--    config     jsonb  → todos los knobs visuales (ThemeConfig)
--    content    jsonb  → todos los textos del cliente (ThemeContent)
--    custom_css text   → escotilla de CSS por restaurante (solo Super Admin)
--  Las columnas legacy (color_*, font_display, portada_style, etc.) se
--  conservan: el resolver las lee primero y `config` las sobrescribe.
--  Ejecutar DESPUÉS de 001..006.
-- ============================================================

alter table restaurant_themes
  add column if not exists config     jsonb not null default '{}'::jsonb,
  add column if not exists content    jsonb not null default '{}'::jsonb,
  add column if not exists custom_css text;

comment on column restaurant_themes.config is
  'Overrides parciales de ThemeConfig (knobs visuales). Merge sobre DEFAULT_CONFIG en el resolver.';
comment on column restaurant_themes.content is
  'Overrides parciales de ThemeContent (textos del cliente). Merge sobre DEFAULT_CONTENT.';
comment on column restaurant_themes.custom_css is
  'CSS crudo inyectado al final del tema del tenant. Campo de CONFIANZA: solo lo edita el Super Admin.';

-- Las políticas RLS existentes (themes_select público, themes_update_owner,
-- themes_*_super) ya cubren estas columnas: no se requieren políticas nuevas.
