-- ============================================================
--  142 · Las fotos del menú también por membresía (PROD-01)
--  ------------------------------------------------------------
--  AUDITORIA_SALIDA_PRODUCCION_2026-10-09. Las reglas del bucket
--  `restaurant-assets` (migración 003) solo dejaban escribir en la carpeta
--  `get_my_restaurant_id()`, que es `profiles.restaurant_id`. El registro
--  self-serve deja ese campo en null a propósito (signup.ts) y el
--  restaurante se abre con una fila en `restaurant_members` (mi-cuenta.ts),
--  así que el dueño que se registra solo —y el que administra su segundo
--  local o un grupo— recibía «new row violates row-level security policy»
--  al subir la foto de un platillo o su logo. Las tablas ya miraban la
--  membresía; el almacenamiento era el único sitio con la regla vieja.
--
--  Ahora la carpeta `<restaurante>/…` se puede escribir si:
--    · es la del restaurante «de casa» del perfil (el caso de siempre), o
--    · `leogin_puede(<restaurante>, 'catalogo', 'personalizar')` (mig 140):
--      miembro activo con la sección Catálogo (fotos de platillos) o Diseño
--      (logo, ícono, fondo), dueño de grupo de esa sucursal, o Super Admin.
--
--  El primer segmento del nombre se compara como texto antes de convertirlo
--  a uuid: un nombre que no empiece por un uuid da «no», no un error.
--
--  Idempotente. Ejecutar DESPUÉS de 001..141 (necesita la 140). No depende
--  del código: se puede aplicar antes o después del despliegue.
-- ============================================================

create or replace function public.leogin_puede_subir_foto(p_name text)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when (string_to_array(p_name, '/'))[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.get_my_role() = 'SUPER_ADMIN'
    else
      (string_to_array(p_name, '/'))[1] = (public.get_my_restaurant_id())::text
      or public.leogin_puede(((string_to_array(p_name, '/'))[1])::uuid, 'catalogo', 'personalizar')
  end;
$$;

drop policy if exists "assets_insert_owner" on storage.objects;
create policy "assets_insert_owner"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'restaurant-assets'
    and public.leogin_puede_subir_foto(name)
  );

drop policy if exists "assets_update_owner" on storage.objects;
create policy "assets_update_owner"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'restaurant-assets'
    and public.leogin_puede_subir_foto(name)
  )
  with check (
    bucket_id = 'restaurant-assets'
    and public.leogin_puede_subir_foto(name)
  );

drop policy if exists "assets_delete_owner" on storage.objects;
create policy "assets_delete_owner"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'restaurant-assets'
    and public.leogin_puede_subir_foto(name)
  );
