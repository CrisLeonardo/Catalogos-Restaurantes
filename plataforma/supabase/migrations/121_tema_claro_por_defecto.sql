-- ============================================================
-- TEMA CLARO POR DEFECTO
-- ------------------------------------------------------------
-- El tema de arranque de un restaurante nuevo pasa de carbon oscuro a claro.
--
-- EL PROBLEMA DE FONDO no era el color, era que el "default" vivia en DOS
-- sitios que habia que mantener sincronizados a mano:
--
--   1. `DEFAULT_CONFIG` en src/lib/theme/defaults.ts
--   2. Estas columnas heredadas, con la paleta oscura escrita como DEFAULT
--      de SQL: color_bg '#0b0b0c', color_text '#F5F3EF', color_primary
--      '#D97757'.
--
-- Y las columnas GANABAN: `legacyToConfig()` (src/lib/theme/resolve.ts) mapea
-- `row.color_bg` -> `config.colorBg` por encima de los defaults del codigo.
-- Comprobado: al pasar `DEFAULT_CONFIG` a claro, el `scheme` cambiaba pero los
-- colores seguian saliendo oscuros, o sea la peor combinacion posible — fondo
-- oscuro con las tintas recalculadas para fondo claro.
--
-- En vez de copiar la paleta clara aqui y volver a tener dos fuentes de
-- verdad, se QUITA el default de SQL. Con la columna en NULL, `legacyToConfig`
-- la salta (solo mapea si el valor es truthy) y manda `DEFAULT_CONFIG`, que
-- es donde tiene que estar la paleta.
--
-- ALCANCE, a proposito: NO se tocan las filas existentes. Un restaurante que
-- ya esta publicado tiene su paleta escrita en estas columnas y la conserva
-- tal cual; nadie se despierta con el menu de otro color. Esto solo cambia lo
-- que recibe un restaurante NUEVO.
-- ============================================================

alter table public.restaurant_themes alter column color_bg      drop default;
alter table public.restaurant_themes alter column color_text    drop default;
alter table public.restaurant_themes alter column color_primary drop default;

-- Que se puedan dejar vacias (si la columna era NOT NULL, el codigo nunca
-- podria delegar en DEFAULT_CONFIG).
alter table public.restaurant_themes alter column color_bg      drop not null;
alter table public.restaurant_themes alter column color_text    drop not null;
alter table public.restaurant_themes alter column color_primary drop not null;

comment on column public.restaurant_themes.color_bg is
  'Heredada. NULL = usar DEFAULT_CONFIG de lib/theme/defaults.ts. No volver a ponerle un DEFAULT de SQL: duplicaria la paleta en dos sitios.';
comment on column public.restaurant_themes.color_text is
  'Heredada. NULL = usar DEFAULT_CONFIG de lib/theme/defaults.ts.';
comment on column public.restaurant_themes.color_primary is
  'Heredada. NULL = usar DEFAULT_CONFIG de lib/theme/defaults.ts.';
