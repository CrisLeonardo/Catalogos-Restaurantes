/* ============================================================
   GEO — distancia y selección de sucursal más cercana (cliente)
   ------------------------------------------------------------
   Port TS de haversine_km() (migración 011). Lo usa el selector
   público de sucursal para ordenar/elegir sin ir al servidor.
   ============================================================ */

/** Distancia en km entre dos puntos WGS-84 (fórmula de Haversine). */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // radio medio de la Tierra (km)
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/** Punto/sucursal mínima necesaria para calcular cercanía. */
export interface GeoBranch {
  location_lat: number | null;
  location_lng: number | null;
  delivery_radius_km: number | null;
}

export interface NearestResult<T extends GeoBranch> {
  branch: T;
  distanceKm: number;
  /** true si está dentro del radio de reparto de esa sucursal. */
  withinRadius: boolean;
}

/**
 * Devuelve la sucursal más cercana a (lat,lng) y si el punto cae dentro de su
 * radio de reparto. Ignora sucursales sin coordenadas. null si ninguna tiene
 * ubicación configurada.
 */
export function nearestBranch<T extends GeoBranch>(
  branches: T[],
  lat: number,
  lng: number,
): NearestResult<T> | null {
  let best: NearestResult<T> | null = null;

  for (const branch of branches) {
    if (branch.location_lat == null || branch.location_lng == null) continue;
    const distanceKm = haversineKm(lat, lng, branch.location_lat, branch.location_lng);
    if (!best || distanceKm < best.distanceKm) {
      const radius = branch.delivery_radius_km;
      best = {
        branch,
        distanceKm,
        // Sin radio configurado = sin restricción → se considera cubierto.
        withinRadius: radius == null || distanceKm <= radius,
      };
    }
  }

  return best;
}
