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
  // Motor de personalización (migración 007): overrides parciales + CSS propio.
  config: Record<string, unknown> | null;
  content: Record<string, unknown> | null;
  custom_css: string | null;
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
  icon: string | null;
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

export type OrderStatus = 'NEW' | 'PREP' | 'READY' | 'TRANSIT' | 'DELIVERED' | 'CANCEL';

export interface Order {
  id: string;
  restaurant_id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  order_type: 'PICKUP' | 'DELIVERY';
  address: string | null;
  payment_method: string;
  status: OrderStatus;
  subtotal: number;
  delivery_fee: number;
  total: number;
  notes: string | null;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  name_snapshot: string;
  price_snapshot: number;
  quantity: number;
  subtotal: number;
}

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image_url: string | null;
}
