import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

/* ============================================================
   GRUPO — datos PÚBLICOS para el selector de sucursal
   ------------------------------------------------------------
   El selector vive en `grupo-slug.dominio` y es anónimo. Usa el RPC
   `get_group_branches` (SECURITY DEFINER, mig. 026) que expone solo
   columnas públicas; nunca el SELECT directo a organizations/restaurants.
   ============================================================ */

export interface PublicBranch {
  slug: string;
  name: string;
  tagline: string | null;
  address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  delivery_radius_km: number | null;
  orders_enabled: boolean;
  logo_url: string;
}

export interface PublicGroup {
  name: string;
  slug: string;
  logo_url: string | null;
  color_primary: string;
  branches: PublicBranch[];
}

/**
 * Devuelve el grupo + sus sucursales públicas por slug, o null si no existe
 * (o Supabase no está configurado). Cacheado por request.
 */
export const getGroupBranches = cache(
  async (slug: string): Promise<PublicGroup | null> => {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      return null;
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('get_group_branches', {
      p_org_slug: slug,
    });

    if (error || !data) return null;
    return data as unknown as PublicGroup;
  },
);
