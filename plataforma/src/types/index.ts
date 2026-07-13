import type { WeeklyHours } from '@/lib/hours';

/** Grupo/cadena dueño de varias sucursales (migración 024). */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  color_primary: string;
  contact_email: string | null;
  created_at: string;
}

export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  plan_actual: 'BASICO' | 'ESTANDAR' | 'PREMIUM' | 'PRO';
  modules: {
    catalog: boolean;
    orders: boolean;
    whatsapp_notify: boolean;
    analitica: boolean;
    inventario: boolean;
    promociones: boolean;
    personal: boolean;
    finanzas: boolean;
    multi_branch: boolean;
    /** "Gestionado por Leogin" de módulos activables (true = forzado ON + oculto). */
    fel?: boolean;
    proveedores?: boolean;
    loyalty?: boolean;
    reservaciones?: boolean;
    llamada_mesero?: boolean;
    encuestas?: boolean;
    cupones?: boolean;
    recetas?: boolean;
  };
  /** On/off de módulos que controla el restaurante (migración 038). */
  module_settings?: import('@/lib/modules').ModuleSettings;
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
  /** Grupo dueño (migración 024); null = independiente. */
  organization_id: string | null;
  /** Dirección legible del local (migración 026). Se muestra en el selector de sucursal. */
  address: string | null;
  /** false = mostrar el asistente de configuración inicial (registro self-serve, mig. 047). */
  onboarding_done?: boolean;
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
  /** Cuenta de Supabase Auth (Google) enlazada a este cliente (migración 058). */
  auth_user_id?: string | null;
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
  /**
   * Horario de disponibilidad (migración 052). Mismo formato que
   * `restaurants.hours`. NULL = disponible siempre. Permite menús por
   * franja: desayuno / almuerzo / cena.
   */
  availability: WeeklyHours | null;
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
  /** Costo del producto (migración 019). Margen = price - cost. NULL = sin costo. */
  cost: number | null;
  image_url: string | null;
  icon: string | null;
  tags: string[] | null;
  options: ProductOptionGroup[] | null;
  is_available: boolean;
  /** Timestamp de cuando se marcó no-disponible; NULL si está disponible. */
  unavailable_at: string | null;
  /** false = oculto permanentemente del menú hasta que el restaurante lo reactive. */
  is_active: boolean;
  // Inventario (migración 021)
  track_stock: boolean;
  stock: number | null;
  low_stock_threshold: number;
  sort_order: number;
  /**
   * Puntos de lealtad que otorga UNA unidad de este producto (migración 058).
   * NULL = usar la regla general del restaurante (earn_rate × subtotal). 0 = ninguno.
   */
  loyalty_points?: number | null;
}

/** Recompensa canjeable por puntos (catálogo de lealtad, migración 058). */
export interface LoyaltyReward {
  id: string;
  restaurant_id: string;
  /** Producto del menú entregado como canje (NULL = recompensa suelta). */
  product_id: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  points_cost: number;
  active: boolean;
  sort_order: number;
  /** Inventario de la recompensa; NULL = ilimitado. */
  stock: number | null;
  /** Máximo de canjes por cliente; NULL = ilimitado. */
  per_customer_limit: number | null;
  created_at: string;
}

export interface Profile {
  id: string;
  restaurant_id: string | null;
  role: 'SUPER_ADMIN' | 'RESTAURANT_OWNER' | 'RESTAURANT_STAFF' | 'GROUP_OWNER' | 'RESTAURANT_WAITER';
  full_name: string | null;
  /** Secciones permitidas para RESTAURANT_STAFF (migración 023); null = todas. */
  permissions: string[] | null;
  /** Para GROUP_OWNER (migración 024): el grupo que administra. */
  organization_id: string | null;
}

/** Promoción / cupón a nivel de pedido (migración 022). */
export interface Promotion {
  id: string;
  restaurant_id: string;
  name: string;
  kind: 'PERCENT' | 'AMOUNT' | 'FREE_DELIVERY';
  value: number;
  code: string | null;
  min_order: number;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  usage_limit: number | null;
  used_count: number;
  created_at: string;
}

export type OrderStatus = 'NEW' | 'PREP' | 'READY' | 'TRANSIT' | 'SERVED' | 'DELIVERED' | 'CANCEL';

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
  cash_amount: number | null;
  status: OrderStatus;
  subtotal: number;
  delivery_fee: number;
  /** Descuento aplicado (migración 022); total = subtotal + envío - descuento. */
  discount: number;
  promo_id: string | null;
  promo_code: string | null;
  /** Propina aplicada (migración 027); solo DINE_IN cuando el restaurante la habilita. */
  tip: number;
  /** Canje de puntos de lealtad (migración 042): puntos usados y su descuento. */
  loyalty_points_redeemed: number;
  loyalty_discount: number;
  total: number;
  notes: string | null;
  public_token: string;
  created_at: string;
  // Marcas de tiempo de estado (migración 020) — analítica de tiempos.
  accepted_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  /** Mesero que tomó el pedido (migración 030); null = pedido online del cliente. */
  waiter_id: string | null;
  /** Se tomó sin conexión (hub local) y se sincronizó después (migración 062). */
  synced_from_hub: boolean;
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
  /** Costo congelado al vender (migración 019); NULL si no había costo. */
  cost_snapshot: number | null;
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
  /**
   * Si la línea es un canje de recompensa (migración 058): id de la recompensa
   * y su costo en puntos. El precio en Q es 0; los puntos se descuentan al
   * confirmar el pedido. No es apilable ni editable en cantidad.
   */
  rewardId?: string;
  pointsCost?: number;
}
