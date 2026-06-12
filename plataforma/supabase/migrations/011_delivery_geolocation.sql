-- ============================================================
--  Migración 011 — Geolocalización de delivery
--  · restaurants: ubicación exacta (lat/lng) + radio en km
--  · orders:      coordenadas del pin del cliente
--  · haversine_km(): distancia entre dos puntos (sin PostGIS)
--  · check_delivery_coverage(): RPC para validar cobertura
--  Ejecutar DESPUÉS de 001..010 en el SQL Editor de Supabase.
-- ============================================================

-- ── Restaurants: ubicación del local + radio de entrega ─────
alter table restaurants
  add column if not exists location_lat       float8,
  add column if not exists location_lng       float8,
  add column if not exists delivery_radius_km float4;

comment on column restaurants.location_lat is
  'Latitud WGS-84 de la ubicación física del restaurante.';
comment on column restaurants.location_lng is
  'Longitud WGS-84 de la ubicación física del restaurante.';
comment on column restaurants.delivery_radius_km is
  'Radio en km desde el restaurante dentro del cual se acepta delivery a domicilio. '
  'NULL = sin restricción geográfica (el restaurante no usa validación por radio).';

-- ── Orders: coordenadas del pin de entrega del cliente ───────
alter table orders
  add column if not exists delivery_lat float8,
  add column if not exists delivery_lng float8;

comment on column orders.delivery_lat is
  'Latitud del pin de entrega que el cliente colocó en el mapa (puede ser NULL si el '
  'restaurante no tiene geo configurado o el pedido es PICKUP).';
comment on column orders.delivery_lng is
  'Longitud del pin de entrega que el cliente colocó en el mapa.';

-- ── Haversine: distancia en km entre dos puntos (WGS-84) ────
-- No requiere PostGIS; usa solo funciones matemáticas estándar de PostgreSQL.
create or replace function haversine_km(
  lat1 float8, lng1 float8,
  lat2 float8, lng2 float8
) returns float8
language sql immutable strict
as $$
  select 6371.0 * 2.0 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2.0), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lng2 - lng1) / 2.0), 2)
  ))
$$;

comment on function haversine_km(float8, float8, float8, float8) is
  'Retorna la distancia en kilómetros entre (lat1,lng1) y (lat2,lng2) '
  'usando la fórmula de Haversine sobre el radio medio de la Tierra (6 371 km). '
  'No requiere la extensión PostGIS.';

-- ── RPC: verifica si un punto está dentro del radio del restaurante ──
create or replace function check_delivery_coverage(
  p_restaurant_id uuid,
  p_lat           float8,
  p_lng           float8
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lat    float8;
  v_lng    float8;
  v_radius float4;
  v_dist   float8;
begin
  select location_lat, location_lng, delivery_radius_km
    into v_lat, v_lng, v_radius
    from restaurants
   where id = p_restaurant_id;

  -- Sin configuración geográfica → cobertura ilimitada
  if v_lat is null or v_lng is null or v_radius is null then
    return jsonb_build_object(
      'covered',      true,
      'distance_km',  null,
      'radius_km',    null
    );
  end if;

  v_dist := haversine_km(v_lat, v_lng, p_lat, p_lng);

  return jsonb_build_object(
    'covered',     v_dist <= v_radius,
    'distance_km', round(v_dist::numeric, 2),
    'radius_km',   v_radius
  );
end;
$$;

comment on function check_delivery_coverage(uuid, float8, float8) is
  'Devuelve { covered: bool, distance_km: numeric|null, radius_km: numeric|null }. '
  'Si el restaurante no tiene geo configurado (location_lat/lng/delivery_radius_km), '
  'siempre retorna covered=true. Usado por createOrder para validar en el servidor.';
