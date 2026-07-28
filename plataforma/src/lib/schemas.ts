import { z } from 'zod';

/** Opción elegida por el comensal: solo IDs — nombres y precios se resuelven en el servidor. */
export const orderItemOptionSchema = z.object({
  groupId: z.string().min(1).max(60),
  choiceId: z.string().min(1).max(60),
  /** Variante elegida del componente (ej. sabor de bebida), si tenía. */
  variantId: z.string().min(1).max(60).optional(),
});

export const orderItemSchema = z.object({
  productId: z.string().uuid('ID de producto inválido'),
  name: z.string().min(1).max(200),
  price: z.number().positive().max(100_000),
  quantity: z.number().int().positive().max(99),
  options: z.array(orderItemOptionSchema).max(30).optional(),
});

/** Strips spaces, dashes, dots, parens from a phone string. */
export function stripPhoneFormatting(v: string): string {
  return v.replace(/[\s\-\(\)\.]/g, '').trim();
}

/** Returns true if v is a valid 8-digit Guatemala local number (after stripping). */
export function isValidGuatemalaPhone(raw: string): boolean {
  return /^\d{8}$/.test(stripPhoneFormatting(raw));
}

export const customerSchema = z.object({
  name: z
    .string({ required_error: 'El nombre es requerido' })
    .min(1, 'El nombre es requerido')
    .max(100, 'Nombre demasiado largo')
    .transform((v) => v.trim()),
  phone: z
    .string()
    .transform((v) => stripPhoneFormatting(v))
    .refine((v) => !v || /^\d{8}$/.test(v), {
      message: 'Número inválido. Ingresa 8 dígitos guatemaltecos (ej. 5555 0000)',
    })
    .default(''),
  type: z.enum(['PICKUP', 'DELIVERY', 'DINE_IN']),
  address: z.string().max(300).transform((v) => v.trim()).optional(),
  /** Zona de cobertura elegida (solo si el restaurante configuró zonas). */
  zone: z.string().max(80).transform((v) => v.trim()).optional(),
  notes: z.string().max(500).transform((v) => v.trim()).optional(),
  /** Coordenadas del pin de entrega (solo si el restaurante tiene geo configurado). */
  deliveryLat: z.number().min(-90).max(90).optional(),
  deliveryLng: z.number().min(-180).max(180).optional(),
  /** Solo para DINE_IN: número de mesa. */
  tableNumber: z.number().int().min(1).max(200).optional(),
  /** Solo para DINE_IN: preferencia de orden de servicio. */
  coursePreference: z.string().max(200).transform((v) => v.trim()).optional(),
});

export const createOrderSchema = z
  .object({
    restaurantId: z.string().uuid('ID de restaurante inválido'),
    items: z
      .array(orderItemSchema)
      .max(50, 'Demasiados ítems')
      .default([]),
    /**
     * Recompensas de lealtad canjeadas (migración 058). El cliente solo manda
     * el id; el servidor resuelve producto, precio (Q0) y costo en puntos, y
     * descuenta los puntos de forma autoritativa. Van como ítems con precio 0.
     */
    rewardLines: z
      .array(z.object({ rewardId: z.string().uuid() }))
      .max(10, 'Demasiadas recompensas')
      .default([]),
    customer: customerSchema,
    deliveryFee: z.number().min(0).max(10_000).default(0),
    /** Código de cupón opcional escrito en el checkout. */
    couponCode: z.string().max(40).transform((v) => v.trim()).optional(),
    /** Método de pago elegido por el cliente. DINE_IN no lleva método (el mesero lo maneja). */
    paymentMethod: z.enum(['CASH', 'CARD']).default('CASH'),
    /** Monto en efectivo que el cliente dará (para que el repartidor lleve cambio). Solo DELIVERY+CASH. */
    cashAmount: z.number().min(0).max(1_000_000).optional(),
    /** Indica si el cliente aceptó incluir propina. Solo cuenta en los tipos de pedido que el restaurante habilitó (tipOrderTypes). */
    tipAccepted: z.boolean().default(false),
    /**
     * ID idempotente generado por el cliente (estable entre reintentos del
     * mismo pedido). Ver migración 061 — evita duplicar el pedido si la
     * cola offline reintenta un envío cuya respuesta se perdió.
     */
    clientId: z.string().uuid().optional(),
    /**
     * Mesero que tomó el pedido — solo relevante para el camino del hub
     * offline (offline-orders/route.ts): createWaiterOrder() ya resuelve el
     * mesero de la sesión real y lo ignora si viene en el payload.
     */
    waiterId: z.string().uuid().optional(),
  })
  .refine((data) => data.items.length + data.rewardLines.length >= 1, {
    message: 'El carrito está vacío',
    path: ['items'],
  })
  .refine(
    (data) => {
      if (data.customer.type !== 'DELIVERY') return true;
      // Si hay coordenadas geo, la dirección de texto es opcional
      if (data.customer.deliveryLat != null && data.customer.deliveryLng != null) return true;
      return (data.customer.address?.length ?? 0) > 3;
    },
    {
      message: 'La dirección es requerida para envío a domicilio',
      path: ['customer', 'address'],
    },
  )
  .refine(
    (data) => {
      if (data.customer.type === 'DINE_IN') return true;
      return !!data.customer.phone && /^\d{8}$/.test(data.customer.phone);
    },
    { message: 'El teléfono es requerido', path: ['customer', 'phone'] },
  );

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
