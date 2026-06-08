export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  plan_actual: 'CATALOGO' | 'PREMIUM';
  modules: { catalog: boolean; orders: boolean; whatsapp_notify: boolean };
  status: 'active' | 'suspended';
  whatsapp_number: string | null;
  contact_email: string | null;
  created_at: string;
}

export interface RestaurantTheme {
  restaurant_id: string;
  brand_name: string | null;
  logo_url: string | null;
  color_primary: string;
  color_bg: string;
  color_text: string;
  font_display: string;
  portada_style: 'spotlight' | 'poster' | 'stack';
  catalog_view: 'grid' | 'list';
  glass_intensity: 'translucido' | 'esmerilado' | 'solido';
  background_image: string | null;
}

export interface Category {
  id: string;
  restaurant_id: string;
  name: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface Product {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  tags: string[] | null;
  is_available: boolean;
  sort_order: number;
}

export interface Profile {
  id: string;
  restaurant_id: string | null;
  role: 'SUPER_ADMIN' | 'RESTAURANT_OWNER' | 'RESTAURANT_STAFF';
  full_name: string | null;
}
