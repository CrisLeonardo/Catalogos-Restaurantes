-- ============================================================
--  Migración 026 — Selector público de sucursal (link único del grupo)
--  · restaurants.address: dirección legible para mostrar en el selector.
--  · get_group_branches(p_org_slug): RPC pública (anon) que devuelve el
--    grupo + sus sucursales activas con SOLO columnas públicas, para que
--    `grupo-slug.dominio` enrute al cliente a la sucursal más cercana.
--  Reutiliza la geo de la migración 011 (location_lat/lng, delivery_radius_km).
--  Ejecutar DESPUÉS de 001..025.
-- ============================================================

-- ── Dirección legible de la sucursal (para el selector y futuros usos) ──
alter table restaurants
  add column if not exists address text;

comment on column restaurants.address is
  'Dirección legible del local (ej. "5a Av. 10-23, Zona 1"). Se muestra en el '
  'selector público de sucursal del grupo. Opcional.';

-- ── RPC pública: sucursales de un grupo para el selector del cliente ──
-- SECURITY DEFINER: el selector es anónimo y la tabla organizations tiene RLS
-- solo-service-role (mig. 024); esta función expone EXCLUSIVAMENTE columnas
-- públicas (nada de finanzas, dueños, módulos internos, etc.).
create or replace function get_group_branches(p_org_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_org organizations%rowtype;
  v_branches jsonb;
begin
  select * into v_org from organizations where slug = p_org_slug;
  if v_org.id is null then
    return null; -- no existe ese grupo
  end if;

  select coalesce(jsonb_agg(b order by b.name), '[]'::jsonb)
    into v_branches
  from (
    select
      r.slug,
      r.name,
      r.tagline,
      r.address,
      r.location_lat,
      r.location_lng,
      r.delivery_radius_km,
      (r.modules->>'orders' = 'true')                  as orders_enabled,
      coalesce(rt.logo_url, '')                         as logo_url
    from restaurants r
    left join restaurant_themes rt on rt.restaurant_id = r.id
    where r.organization_id = v_org.id
      and r.status = 'active'
  ) b;

  return jsonb_build_object(
    'name',          v_org.name,
    'slug',          v_org.slug,
    'logo_url',      v_org.logo_url,
    'color_primary', v_org.color_primary,
    'branches',      v_branches
  );
end;
$$;

comment on function get_group_branches(text) is
  'Selector público de sucursal: devuelve { name, slug, logo_url, color_primary, '
  'branches[] } de un grupo por su slug, con solo columnas públicas de cada '
  'sucursal activa (slug, name, tagline, address, location_lat/lng, '
  'delivery_radius_km, orders_enabled, logo_url). NULL si el grupo no existe.';

grant execute on function get_group_branches(text) to anon, authenticated;
