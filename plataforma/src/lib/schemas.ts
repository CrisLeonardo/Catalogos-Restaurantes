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

export const customerSchema = z.object({
  name: z
    .string({ required_error: 'El nombre es requerido' })
    .min(1, 'El nombre es requerido')
    .max(100, 'Nombre demasiado largo')
    .transform((v) => v.trim()),
  phone: z
    .string({ required_error: 'El teléfono es requerido' })
    .min(7, 'Teléfono inválido')
    .max(20, 'Teléfono inválido')
    .transform((v) => v.trim()),
  type: z.enum(['PICKUP', 'DELIVERY']),
  address: z.string().max(300).transform((v) => v.trim()).optional(),
  /** Zona de cobertura elegida (solo si el restaurante configuró zonas). */
  zone: z.string().max(80).transform((v) => v.trim()).optional(),
  notes: z.string().max(500).transform((v) => v.trim()).optional(),
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
  })
  .refine(
    (data) =>
      data.customer.type !== 'DELIVERY' ||
      (data.customer.address?.length ?? 0) > 3,
    {
      message: 'La dirección es requerida para envío a domicilio',
      path: ['customer', 'address'],
    },
  );

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
