-- ============================================================
--  Migración 085 — Etiquetas de alérgenos y dietas por producto
--  (Fase 3 auditoría de lanzamiento: experiencia multi-mercado)
--  · products.dietary_tags: text[] con claves de un vocabulario fijo
--    (ver src/lib/dietary-tags.ts) — ej. 'vegano', 'sin_gluten',
--    'contiene_frutos_secos'. Distinto de products.tags (texto libre de
--    mercadeo tipo "Nuevo"/"Favorito"): estas claves son estructuradas para
--    poder mostrar ícono + traducción consistente en el menú público.
--  · No lleva CHECK contra el vocabulario: la lista vive en código
--    (src/lib/dietary-tags.ts) y se valida ahí en el server action; una
--    constraint SQL obligaría a otra migración cada vez que se agregue una
--    etiqueta nueva.
--  Ejecutar DESPUÉS de 001..084.
-- ============================================================

alter table products
  add column if not exists dietary_tags text[] default '{}'::text[];

comment on column products.dietary_tags is
  'Claves de alérgenos/dietas (vocabulario fijo en src/lib/dietary-tags.ts), '
  'ej. {vegano,sin_gluten,contiene_frutos_secos}. Se muestran en el menú '
  'público con ícono — a diferencia de products.tags (texto libre de '
  'mercadeo), no son ocultables por el dueño: son información de seguridad '
  'alimentaria.';
