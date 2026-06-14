import { z } from 'zod';

/** Opción elegida por el comensal: solo IDs — nombres y precios se resuelven en el servidor. */
export const orderItemOptionSchema = z.object({
  groupId: z.string().min(1).max(60),
  choiceId: z.string().min(1).max(60),
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
    .string({ required_error: 'El teléfono es requerido' })
    .min(1, 'El teléfono es requerido')
    .transform((v) => stripPhoneFormatting(v))
    .refine((v) => /^\d{8}$/.test(v), {
      message: 'Número inválido. Ingresa 8 dígitos guatemaltecos (ej. 5555 0000)',
    }),
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
      .min(1, 'El carrito está vacío')
      .max(50, 'Demasiados ítems'),
    customer: customerSchema,
    deliveryFee: z.number().min(0).max(10_000).default(0),
    /** Código de cupón opcional escrito en el checkout. */
    promoCode: z.string().max(40).transform((v) => v.trim()).optional(),
    /** Método de pago elegido por el cliente. DINE_IN no lleva método (el mesero lo maneja). */
    paymentMethod: z.enum(['CASH', 'CARD']).default('CASH'),
    /** Monto en efectivo que el cliente dará (para que el repartidor lleve cambio). Solo DELIVERY+CASH. */
    cashAmount: z.number().min(0).max(1_000_000).optional(),
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
  );

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
