import type { WeeklyHours } from '@/lib/hours';

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
  // Operación (migración 009)
  timezone: string;
  hours: WeeklyHours | null;
  orders_paused: boolean;
  pause_message: string | null;
  // Pedidos por WhatsApp + cobertura de delivery (migración 010)
  orders_whatsapp: string | null;
  delivery_zones: string[] | null;
  // Geolocalización de delivery (migración 011)
  location_lat: number | null;
  location_lng: number | null;
  delivery_radius_km: number | null;
  created_at: string;
}

/** Cliente final, creado/actualizado automáticamente al pedir (migración 010). */
export interface Customer {
  id: string;
  restaurant_id: string;
  name: string;
  phone: string;
  email: string | null;
  default_address: string | null;
  default_zone: string | null;
  total_orders: number;
  total_spent: number;
  first_order_at: string | null;
  last_order_at: string | null;
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

/* ── Variantes / extras de producto (migración 009) ───────── */

export interface ProductOptionChoice {
  id: string;
  name: string;
  /** Cuánto suma (o resta) al precio base. */
  priceDelta: number;
}

export interface ProductOptionGroup {
  id: string;
  name: string;            // "Tamaño", "Extras", "Incluye"…
  type: 'single' | 'multi' | 'combo';
  /** Solo single: el comensal DEBE elegir una opción. */
  required?: boolean;
  /** Solo multi: máximo de opciones (0/ausente = sin límite). */
  max?: number;
  choices: ProductOptionChoice[];
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
  options: ProductOptionGroup[] | null;
  is_available: boolean;
  /** Timestamp de cuando se marcó no-disponible; NULL si está disponible. */
  unavailable_at: string | null;
  /** false = oculto permanentemente del menú hasta que el restaurante lo reactive. */
  is_active: boolean;
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
  order_type: 'PICKUP' | 'DELIVERY' | 'DINE_IN';
  address: string | null;
  delivery_zone: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  customer_id: string | null;
  payment_method: string;
  status: OrderStatus;
  subtotal: number;
  delivery_fee: number;
  total: number;
  notes: string | null;
  public_token: string;
  created_at: string;
}

/** Opción elegida congelada en el pedido. */
export interface OrderItemOption {
  group: string;
  choice: string;
  priceDelta: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  name_snapshot: string;
  price_snapshot: number;
  quantity: number;
  subtotal: number;
  options_snapshot: OrderItemOption[] | null;
}

/* ── Carrito ──────────────────────────────────────────────── */

export interface CartItemOption {
  groupId: string;
  groupName: string;
  choiceId: string;
  choiceName: string;
  priceDelta: number;
}

export interface CartItem {
  /** Línea única: mismo producto con opciones distintas = líneas distintas. */
  lineId: string;
  productId: string;
  name: string;
  /** Precio unitario FINAL (base + deltas de opciones). */
  price: number;
  quantity: number;
  image_url: string | null;
  options?: CartItemOption[];
}
