import type { WeeklyHours, HourExceptions } from '@/lib/hours';

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
    personal: boolean;
    finanzas: boolean;
    multi_branch: boolean;
    /** "Gestionado por Leogin" de módulos activables (true = forzado ON + oculto). */
    fel?: boolean;
    proveedores?: boolean;
    loyalty?: boolean;
    reservaciones?: boolean;
    lista_espera?: boolean;
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
  /** Excepciones puntuales por fecha (feriados) — migración 083. */
  hour_exceptions: HourExceptions | null;
  orders_paused: boolean;
  pause_message: string | null;
  // Pedidos por WhatsApp + cobertura de delivery (migración 010)
  orders_whatsapp: string | null;
  /** Si es false, el checkout no ofrece enviar el pedido por WhatsApp aunque haya número configurado (migración 096). */
  orders_whatsapp_enabled: boolean;
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
  /** Idiomas adicionales al español activos en el menú público (migración 086). Vacío = selector oculto. */
  menu_languages?: string[] | null;
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
  /** Traducción al inglés del nombre (migración 086); vacío = usa `name` (fallback). */
  name_en?: string | null;
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

/** Variante de un componente de combo (ej. sabor de bebida, tipo de papas). */
export interface ProductVariant {
  id: string;
  name: string;
  priceDelta: number;
}

export interface ProductOptionChoice {
  id: string;
  name: string;
  /** Cuánto suma (o resta) al precio base. */
  priceDelta: number;
  /**
   * Variantes del componente (migración 077 combos+variantes). Solo tiene
   * sentido en choices de un grupo tipo 'combo': si están presentes, el
   * cliente/mesero debe elegir una para poder incluir este componente
   * (ej. "Bebida" → Coca-Cola / Fanta / Agua).
   */
  variants?: ProductVariant[];
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
  /** Traducciones opcionales al inglés (migración 086); vacío = usa el español (fallback). */
  name_en?: string | null;
  description_en?: string | null;
  price: number;
  /** Costo del producto (migración 019). Margen = price - cost. NULL = sin costo. */
  cost: number | null;
  image_url: string | null;
  icon: string | null;
  tags: string[] | null;
  /** Claves de alérgenos/dietas del vocabulario fijo (migración 085, ver lib/dietary-tags.ts). */
  dietary_tags?: string[] | null;
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
  role: 'SUPER_ADMIN' | 'RESTAURANT_OWNER' | 'RESTAURANT_STAFF' | 'RESTAURANT_WAITER';
  full_name: string | null;
  /** Secciones permitidas para RESTAURANT_STAFF (migración 023); null = todas. */
  permissions: string[] | null;
  /** El grupo que administra, si administra alguno. Desde la migración 116
      esto —y no un rol— es lo que define a un jefe de cadena. */
  organization_id: string | null;
  /**
   * Cuándo confirmó su correo abriendo el enlace que le mandamos (migración
   * 109); null = todavía no. No confundir con auth.users.email_confirmed_at,
   * que el alta self-serve pone siempre para que la cuenta nazca usable.
   */
  email_verified_at: string | null;
}

export type OrderStatus = 'NEW' | 'PREP' | 'READY' | 'TRANSIT' | 'SERVED' | 'DELIVERED' | 'CANCEL';

/** Canal por el que ENTRÓ el pedido (migración 101). Ortogonal a order_type,
 *  que es cómo se entrega: un pedido puede ser WHATSAPP + PICKUP a la vez. */
export type OrderSource = 'LEOGIN' | 'WHATSAPP' | 'PEDIDOSYA' | 'RAPPI' | 'UBEREATS' | 'OTRO';

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
  /** Descuento aplicado (migración 022, cupón desde migración 093); total = subtotal + envío - descuento. */
  discount: number;
  coupon_id: string | null;
  coupon_code: string | null;
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
  /** Plato servido en mesa, sin cerrar la mesa todavía (migración 071). */
  served_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  /** Cierre automático por abandono >24h, no manual (migración 080). */
  auto_archived_at: string | null;
  updated_at: string;
  /** Mesero que tomó el pedido (migración 030); null = pedido online del cliente. */
  waiter_id: string | null;
  /** Se tomó sin conexión (hub local) y se sincronizó después (migración 062). */
  synced_from_hub: boolean;
  /** Canal de entrada (migración 101); 'LEOGIN' = propio (QR, mesero, kiosko, hub). */
  source: OrderSource;
  /* ── Reparto propio (migración 103) ── */
  /** Repartidor asignado; null = sin asignar o no es a domicilio. */
  driver_id: string | null;
  assigned_at: string | null;
  /** Cuándo salió el repartidor con el pedido. */
  picked_up_at: string | null;
  /** Efectivo realmente recibido en la puerta (para cuadrar caja). */
  cash_collected: number | null;
  delivery_zone_id: string | null;
}

/** Auditoría de anulación de pedido/ítem (migración 079): motivo obligatorio
 *  + aprobación de encargado si el pedido ya se envió a cocina. */
export interface OrderVoid {
  id: string;
  order_id: string;
  /** NULL = se anuló el pedido completo; si no, el order_item anulado. */
  item_id: string | null;
  /** Unidades anuladas de ese ítem; NULL cuando item_id es NULL. */
  quantity: number | null;
  reason: string;
  requested_by: string;
  /** NULL = el propio solicitante ya tenía permiso de encargado (auto-aprobado). */
  approved_by: string | null;
  created_at: string;
}

/** Opción elegida congelada en el pedido. */
export interface OrderItemOption {
  group: string;
  choice: string;
  priceDelta: number;
  /** Variante elegida del componente (ej. "Coca-Cola"), si aplicaba. */
  variant?: string;
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
  /** Nota libre del mesero/comensal para este plato (ej. "sin cebolla"). */
  note: string | null;
}

/* ── Carrito ──────────────────────────────────────────────── */

export interface CartItemOption {
  groupId: string;
  groupName: string;
  choiceId: string;
  choiceName: string;
  /** Precio del componente + de la variante elegida (si tenía). */
  priceDelta: number;
  /** Variante elegida del componente (ej. sabor de bebida), si tenía. */
  variantId?: string;
  variantName?: string;
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
