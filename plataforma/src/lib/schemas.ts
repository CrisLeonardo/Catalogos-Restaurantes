import { z } from 'zod';

/** Opción elegida por el comensal: solo IDs — nombres y precios se resuelven en el servidor. */
export const orderItemOptionSchema = z.object({
  groupId: z.string().min(1).max(60),
  choiceId: z.string().min(1).max(60),
  /** Variante elegida del componente (ej. sabor de bebida), si tenía. */
  variantId: z.string().min(1).max(60).optional(),
});

export const orderItemSchema = z.object({
  productId: z.string().guid('ID de producto inválido'),
  name: z.string().min(1).max(200),
  price: z.number().positive().max(100_000),
  quantity: z.number().int().positive().max(99),
  options: z.array(orderItemOptionSchema).max(30).optional(),
  /** Nota libre para este plato (ej. "sin cebolla"), distinta de la nota del pedido completo. */
  note: z.string().max(140).transform((v) => v.trim()).optional(),
  /**
   * Asiento al que se le apunta el plato (migración 123). Solo lo manda el
   * panel de mesero: es lo que convierte «dividir la cuenta» en una lista ya
   * hecha en vez de un rompecabezas al final de la noche.
   */
  seat: z.number().int().min(1).max(40).optional(),
});

/**
 * Un artículo que NO está en la carta.
 * ------------------------------------------------------------
 * El plato del día que nadie dio de alta, un descorche, un recargo, una
 * torta que trajo el cliente (M-09). Sin esto, lo que no está en el
 * catálogo no se puede cobrar y el mesero acaba apuntando «Coca-Cola» y
 * sumando Q40 a mano en la calculadora — que es peor de todas las formas
 * posibles: no queda en el arqueo, ni en el informe, ni en la cuenta.
 *
 * Aquí el precio SÍ viene del cliente, y es la única línea del sistema de
 * la que eso es cierto. No hay alternativa —no existe catálogo contra el
 * que contrastarlo, ese es justo el punto— así que se acota por otro lado:
 *
 *  · solo lo acepta `createWaiterOrder`, nunca el checkout público
 *    (por eso vive en `waiterOrderSchema` y no en `createOrderSchema`;
 *    Zod descarta las claves que no conoce, así que el camino del cliente
 *    no puede colarlo aunque lo mande);
 *  · quien lo manda ya pasó por el permiso «mesero»;
 *  · y cada uno queda escrito en la bitácora con su nombre y su importe.
 */
export const openItemSchema = z.object({
  /* El `trim` va ANTES de comprobar que no está vacío. Al revés —que es
     como estaba— dos espacios pasaban `min(1)` y luego se recortaban a
     nada: una línea sin nombre en la cuenta de alguien, imposible de
     discutir cuando llega la hora de pagar. */
  name: z.string().max(80)
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, 'El artículo necesita un nombre'),
  price: z.number().min(0).max(100_000),
  quantity: z.number().int().positive().max(99),
  note: z.string().max(140).transform((v) => v.trim()).optional(),
  seat: z.number().int().min(1).max(40).optional(),
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
    .string({ error: (iss) => (iss.input === undefined ? 'El nombre es requerido' : undefined) })
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
  /** Solo para DINE_IN: cuánta gente se sentó (migración 123). */
  partySize: z.number().int().min(1).max(100).optional(),
});

/* El pedido, en dos piezas.
   ------------------------------------------------------------------
   `createOrderBase` son los CAMPOS; las tres reglas de abajo son lo que
   tiene que cumplir un pedido del público. Están separados porque el
   panel de mesero necesita los mismos campos con una regla distinta:
   una comanda de SOLO artículos libres —un descorche, un recargo— es
   un pedido legítimo suyo y sería «El carrito está vacío» con la regla
   del público, que exige al menos una línea de la carta.

   Antes esto era un solo `z.object().refine().refine().refine()`, y un
   objeto ya refinado no se puede extender: es lo que obligaba a que el
   mesero no pudiera tener su propia versión. */
const createOrderBase = z
  .object({
    restaurantId: z.string().guid('ID de restaurante inválido'),
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
      .array(z.object({ rewardId: z.string().guid() }))
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
    clientId: z.string().guid().optional(),
    /**
     * Mesero que tomó el pedido — solo relevante para el camino del hub
     * offline (offline-orders/route.ts): createWaiterOrder() ya resuelve el
     * mesero de la sesión real y lo ignora si viene en el payload.
     */
    waiterId: z.string().guid().optional(),
  });

/** A dónde va el pedido. Vale igual para el público y para el mesero. */
const REGLA_DIRECCION = {
  check: (data: z.infer<typeof createOrderBase>) => {
    if (data.customer.type !== 'DELIVERY') return true;
    // Si hay coordenadas geo, la dirección de texto es opcional
    if (data.customer.deliveryLat != null && data.customer.deliveryLng != null) return true;
    return (data.customer.address?.length ?? 0) > 3;
  },
  msg: { message: 'La dirección es requerida para envío a domicilio', path: ['customer', 'address'] as const },
};

const REGLA_TELEFONO = {
  check: (data: z.infer<typeof createOrderBase>) => {
    if (data.customer.type === 'DINE_IN') return true;
    return !!data.customer.phone && /^\d{8}$/.test(data.customer.phone);
  },
  msg: { message: 'El teléfono es requerido', path: ['customer', 'phone'] as const },
};

export const createOrderSchema = createOrderBase
  .refine((data) => data.items.length + data.rewardLines.length >= 1, {
    message: 'El carrito está vacío',
    path: ['items'],
  })
  .refine(REGLA_DIRECCION.check, { ...REGLA_DIRECCION.msg, path: [...REGLA_DIRECCION.msg.path] })
  .refine(REGLA_TELEFONO.check, { ...REGLA_TELEFONO.msg, path: [...REGLA_TELEFONO.msg.path] });

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/**
 * El pedido tal como lo manda el PANEL DE MESERO.
 *
 * Mismos campos que el del público más `openItems`, y una regla de «no
 * está vacío» que los cuenta: una comanda de solo artículos libres —un
 * descorche, un recargo por servicio— es un pedido legítimo aquí, y con
 * la regla del público sería «El carrito está vacío».
 *
 * Que sean DOS esquemas es lo que impide que el checkout público pueda
 * mandar precios: `createOrder` parsea con `createOrderSchema`, que no
 * conoce `openItems`, y Zod descarta lo que no conoce. No es una
 * comprobación que alguien tenga que acordarse de hacer: no existe la
 * forma de colarlo.
 */
export const waiterOrderSchema = createOrderBase
  .extend({
    openItems: z
      .array(openItemSchema)
      .max(20, 'Demasiados artículos libres')
      .default([]),
  })
  .refine(
    (data) => data.items.length + data.rewardLines.length + data.openItems.length >= 1,
    { message: 'El carrito está vacío', path: ['items'] },
  )
  .refine(REGLA_DIRECCION.check, { ...REGLA_DIRECCION.msg, path: [...REGLA_DIRECCION.msg.path] })
  .refine(REGLA_TELEFONO.check, { ...REGLA_TELEFONO.msg, path: [...REGLA_TELEFONO.msg.path] });

export type WaiterOrderInput = z.infer<typeof waiterOrderSchema>;
export type OpenItemInput = z.infer<typeof openItemSchema>;
