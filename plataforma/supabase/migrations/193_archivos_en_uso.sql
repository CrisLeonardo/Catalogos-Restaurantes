-- ============================================================
-- 193 · Qué archivos de un local siguen en uso
-- ------------------------------------------------------------
-- Auditoría de lanzamiento 2026-11-23, LZ-10. Borrar un restaurante se
-- llevaba sus filas, pero dejaba sus fotos en el bucket público
-- `restaurant-assets` (y sus comprobantes en `payment-proofs`). El servidor
-- ahora las borra después (lib/storage/archivos-del-local.ts), pero no
-- puede borrar la carpeta entera: «Duplicar restaurante» copia la carta
-- con las mismas URLs, y las plantillas y el logo de un grupo pueden
-- apuntar a la carpeta de cualquier local.
--
-- Esta función responde qué rutas de la carpeta del local (`<id>/…`)
-- nombra todavía alguna fila de OTRO local, o una fila que no es de
-- ningún local (plantillas, grupos). Esas se conservan.
--
-- Revisa toda la fila como texto (to_jsonb), así que también encuentra
-- URLs guardadas dentro de la configuración del tema. Si una tabla nueva
-- guarda URLs de archivos, agrégala aquí.
--
-- Solo para el servidor: sin permiso para anon ni authenticated.
-- ============================================================

create or replace function public.leogin_archivos_en_uso(p_restaurant_id uuid)
returns setof text
language sql
stable
set search_path = ''
as $$
  with filas(dueno, texto) as (
              select to_jsonb(t) ->> 'restaurant_id', to_jsonb(t)::text from public.products t
    union all select to_jsonb(t) ->> 'restaurant_id', to_jsonb(t)::text from public.categories t
    union all select to_jsonb(t) ->> 'restaurant_id', to_jsonb(t)::text from public.drop_edition_items t
    union all select to_jsonb(t) ->> 'restaurant_id', to_jsonb(t)::text from public.loyalty_rewards t
    union all select to_jsonb(t) ->> 'restaurant_id', to_jsonb(t)::text from public.menu_estados t
    union all select to_jsonb(t) ->> 'restaurant_id', to_jsonb(t)::text from public.restaurant_themes t
    union all select to_jsonb(t) ->> 'restaurant_id', to_jsonb(t)::text from public.restaurant_theme_templates t
    union all select to_jsonb(t) ->> 'restaurant_id', to_jsonb(t)::text from public.theme_templates t
    union all select null, to_jsonb(t)::text from public.organizations t
    union all select t.id::text, to_jsonb(t)::text from public.restaurants t
  )
  select distinct m[1]
    from filas,
         pg_catalog.regexp_matches(
           filas.texto,
           'restaurant-assets/(' || p_restaurant_id::text || '/[^"?#\s\\]+)',
           'g'
         ) as m
   where filas.dueno is distinct from p_restaurant_id::text
     and filas.texto like '%restaurant-assets/' || p_restaurant_id::text || '/%'
$$;

revoke all on function public.leogin_archivos_en_uso(uuid) from public, anon, authenticated;
grant execute on function public.leogin_archivos_en_uso(uuid) to service_role;

comment on function public.leogin_archivos_en_uso(uuid) is
  'Rutas de restaurant-assets/<local>/ que otra fila (otro local, plantilla o grupo) sigue usando. LZ-10.';
