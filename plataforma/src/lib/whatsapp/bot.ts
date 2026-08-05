/* ============================================================
   BOT DE PEDIDOS POR WHATSAPP (Fase 1B)
   ------------------------------------------------------------
   Máquina de estados determinista: sin IA. El comensal arma el pedido
   dentro de WhatsApp y nunca va al menú web — que es la brecha real
   frente a OlaClick, porque el enlace wa.me de antes lo devolvía a la web.

   DOS REGLAS QUE ORDENAN TODO ESTE ARCHIVO:

   1. El bot no calcula dinero. Los precios salen del catálogo del tenant y
      el TOTAL lo produce createOrder(), el mismo que usa el checkout web.
      Duplicar aquí el cálculo de envío, cupón o propina garantizaría que
      un día WhatsApp cobre distinto que la web por el mismo pedido.

   2. El bot no adivina. Ante cualquier cosa que no entiende, repite la
      pregunta o entrega la conversación a una persona. Un bot que
      interpreta de más toma pedidos equivocados, y un pedido equivocado
      cuesta comida real.

   La Fase 1C (agente con IA) se monta encima de esto y lo conserva como
   respaldo: si la IA falla o el dueño la apaga, este flujo sigue vendiendo.
   ============================================================ */

import { createServiceClient } from '@/lib/supabase/service';
import { getMenuDataCached } from '@/lib/db/menu';
import { getDeliveryZones } from '@/lib/db/zones';
import { createOrder } from '@/lib/actions/orders';
import {
  sendWhatsAppText, sendWhatsAppButtons, sendWhatsAppList,
  WA_MAX_LIST_ROWS,
} from '@/lib/whatsapp/client';

/** Cuánto calla el bot cuando el cliente pide hablar con una persona. */
const HANDOFF_MS = 2 * 60 * 60 * 1000;

export type BotStep =
  | 'MENU' | 'CATEGORIA' | 'PRODUCTO' | 'CANTIDAD' | 'CARRITO'
  | 'TIPO' | 'NOMBRE' | 'DIRECCION' | 'ZONA' | 'PAGO' | 'CONFIRMAR';

export interface BotCartLine {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface BotState {
  step: BotStep;
  cart: BotCartLine[];
  categoryId?: string;
  pending?: { productId: string; name: string; price: number };
  type?: 'DELIVERY' | 'PICKUP';
  name?: string;
  address?: string;
  zone?: string;
  payment?: 'CASH' | 'CARD';
}

const EMPTY: BotState = { step: 'MENU', cart: [] };

/** Palabras con las que el cliente pide una persona. */
const HANDOFF_WORDS = ['humano', 'agente', 'persona', 'asesor', 'ayuda real'];
/** Palabras que reinician la conversación desde cero. */
const RESET_WORDS = ['hola', 'menu', 'menú', 'inicio', 'empezar', 'buenas'];

function money(n: number): string {
  return `Q${n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function cartSubtotal(cart: BotCartLine[]): number {
  return cart.reduce((s, l) => s + l.price * l.quantity, 0);
}

function cartResumen(cart: BotCartLine[]): string {
  if (cart.length === 0) return 'Tu carrito está vacío.';
  const lineas = cart
    .map((l) => `· ${l.quantity} × ${l.name} — ${money(l.price * l.quantity)}`)
    .join('\n');
  return `${lineas}\n\nSubtotal: *${money(cartSubtotal(cart))}*`;
}

/* ── Persistencia del estado ─────────────────────────────── */

async function saveState(conversationId: string, state: BotState): Promise<void> {
  const db = createServiceClient();
  await db
    .from('whatsapp_conversations')
    .update({ estado: state, updated_at: new Date().toISOString() })
    .eq('id', conversationId);
}

async function startHandoff(conversationId: string): Promise<void> {
  const db = createServiceClient();
  await db
    .from('whatsapp_conversations')
    .update({
      handoff_hasta: new Date(Date.now() + HANDOFF_MS).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);
}

/* ── Entrada principal ───────────────────────────────────── */

export interface BotInput {
  restaurantId: string;
  waId: string;
  conversationId: string;
  /** Texto escrito, o null si el cliente tocó un botón/lista. */
  text: string | null;
  /** id del botón o fila que tocó, si aplica. */
  interactiveId: string | null;
  /** Estado guardado del hilo. */
  state: BotState | null;
  handoffHasta: string | null;
  bloqueado: boolean;
}

/**
 * Procesa un mensaje del cliente y responde.
 * No lanza nunca: un fallo del bot no puede tumbar el webhook.
 */
export async function handleBotMessage(input: BotInput): Promise<void> {
  try {
    const { restaurantId, waId, conversationId } = input;

    // Bloqueado por el restaurante: se avisa una vez y no se sigue.
    if (input.bloqueado) {
      await sendWhatsAppText(
        restaurantId, waId,
        'Por el momento no podemos tomar pedidos por este medio. Comunicate directamente con el restaurante.',
      );
      return;
    }

    // Conversación en manos de una persona: el bot no se mete.
    if (input.handoffHasta && new Date(input.handoffHasta).getTime() > Date.now()) return;

    const raw = (input.text ?? '').trim();
    const lower = raw.toLowerCase();
    const choice = input.interactiveId;

    // El pedido de hablar con alguien gana sobre cualquier estado.
    if (choice === 'handoff' || HANDOFF_WORDS.some((w) => lower.includes(w))) {
      await startHandoff(conversationId);
      await sendWhatsAppText(
        restaurantId, waId,
        'Listo, le aviso al restaurante para que te escriba una persona. 👍',
      );
      return;
    }

    let state: BotState = input.state ?? { ...EMPTY };

    // Reinicio explícito. También cubre el primer mensaje de alguien nuevo.
    if (choice === 'inicio' || (!choice && RESET_WORDS.includes(lower))) {
      state = { ...EMPTY, cart: state.cart };
      await sendGreeting(restaurantId, waId, state);
      await saveState(conversationId, state);
      return;
    }

    const next = await step(input, state, raw, choice);
    await saveState(conversationId, next);
  } catch {
    /* best-effort: el canal jamás rompe la operación */
  }
}

/* ── Pantallas ───────────────────────────────────────────── */

async function sendGreeting(restaurantId: string, waId: string, state: BotState): Promise<void> {
  const hayCarrito = state.cart.length > 0;
  await sendWhatsAppButtons(
    restaurantId, waId,
    hayCarrito
      ? `¡Hola! 👋 Tenés un pedido a medias:\n\n${cartResumen(state.cart)}`
      : '¡Hola! 👋 Puedo tomarte el pedido por aquí mismo.',
    [
      { id: 'ver_menu', title: 'Ver el menú' },
      ...(hayCarrito ? [{ id: 'ver_carrito', title: 'Ver mi pedido' }] : []),
      { id: 'handoff', title: 'Hablar con alguien' },
    ],
  );
}

async function showCategories(restaurantId: string, waId: string): Promise<boolean> {
  const menu = await getMenuDataCached(restaurantId);
  const disponibles = menu.categories.filter((c) =>
    menu.products.some((p) => p.category_id === c.id && p.is_available),
  );

  if (disponibles.length === 0) {
    await sendWhatsAppText(restaurantId, waId, 'Ahorita no tengo productos disponibles. Probá más tarde.');
    return false;
  }

  await sendWhatsAppList(
    restaurantId, waId,
    '¿Qué se te antoja?',
    'Ver categorías',
    disponibles.map((c) => ({ id: `cat:${c.id}`, title: c.name })),
  );

  // Aviso honesto cuando el catálogo no cabe en una lista de Meta.
  if (disponibles.length > WA_MAX_LIST_ROWS) {
    await sendWhatsAppText(
      restaurantId, waId,
      'Tengo más categorías de las que caben en la lista. Si no ves la que buscás, escribime su nombre.',
    );
  }
  return true;
}

async function showProducts(restaurantId: string, waId: string, categoryId: string): Promise<boolean> {
  const menu = await getMenuDataCached(restaurantId);
  const productos = menu.products.filter((p) => p.category_id === categoryId && p.is_available);

  if (productos.length === 0) {
    await sendWhatsAppText(restaurantId, waId, 'Esa categoría no tiene nada disponible ahorita.');
    return false;
  }

  await sendWhatsAppList(
    restaurantId, waId,
    'Elegí un plato:',
    'Ver platos',
    productos.map((p) => ({
      id: `prod:${p.id}`,
      title: p.name,
      description: money(Number(p.price)),
    })),
  );
  return true;
}

async function showCart(restaurantId: string, waId: string, state: BotState): Promise<void> {
  await sendWhatsAppButtons(
    restaurantId, waId,
    cartResumen(state.cart),
    [
      { id: 'agregar_mas', title: 'Agregar más' },
      { id: 'confirmar', title: 'Confirmar' },
      { id: 'vaciar', title: 'Vaciar' },
    ],
  );
}

/* ── Transiciones ────────────────────────────────────────── */

async function step(
  input: BotInput,
  state: BotState,
  raw: string,
  choice: string | null,
): Promise<BotState> {
  const { restaurantId, waId } = input;

  // Selecciones que valen desde cualquier pantalla.
  if (choice === 'ver_menu' || choice === 'agregar_mas') {
    const ok = await showCategories(restaurantId, waId);
    return ok ? { ...state, step: 'CATEGORIA' } : state;
  }
  if (choice === 'ver_carrito') {
    await showCart(restaurantId, waId, state);
    return { ...state, step: 'CARRITO' };
  }
  if (choice === 'vaciar') {
    await sendWhatsAppText(restaurantId, waId, 'Listo, vacié tu pedido. Escribime *menú* cuando quieras empezar de nuevo.');
    return { ...EMPTY };
  }
  if (choice?.startsWith('cat:')) {
    const categoryId = choice.slice(4);
    const ok = await showProducts(restaurantId, waId, categoryId);
    return ok ? { ...state, step: 'PRODUCTO', categoryId } : state;
  }
  if (choice?.startsWith('prod:')) {
    const productId = choice.slice(5);
    const menu = await getMenuDataCached(restaurantId);
    const prod = menu.products.find((p) => p.id === productId && p.is_available);
    if (!prod) {
      await sendWhatsAppText(restaurantId, waId, 'Ese plato ya no está disponible. Elegí otro.');
      return state;
    }
    await sendWhatsAppText(restaurantId, waId, `*${prod.name}* — ${money(Number(prod.price))}\n\n¿Cuántos querés? Respondé con un número.`);
    return {
      ...state,
      step: 'CANTIDAD',
      pending: { productId: prod.id, name: prod.name, price: Number(prod.price) },
    };
  }

  switch (state.step) {
    case 'CANTIDAD': {
      const qty = parseInt(raw, 10);
      if (!Number.isFinite(qty) || qty < 1 || qty > 99 || !state.pending) {
        await sendWhatsAppText(restaurantId, waId, 'Necesito un número del 1 al 99. ¿Cuántos querés?');
        return state;
      }
      const cart = [...state.cart];
      const existente = cart.find((l) => l.productId === state.pending!.productId);
      if (existente) existente.quantity = Math.min(99, existente.quantity + qty);
      else cart.push({ ...state.pending, quantity: qty });

      const nuevo: BotState = { ...state, cart, pending: undefined, step: 'CARRITO' };
      await showCart(restaurantId, waId, nuevo);
      return nuevo;
    }

    case 'CARRITO': {
      if (choice === 'confirmar') {
        if (state.cart.length === 0) {
          await sendWhatsAppText(restaurantId, waId, 'Tu carrito está vacío. Escribime *menú* para empezar.');
          return { ...EMPTY };
        }
        await sendWhatsAppButtons(restaurantId, waId, '¿Cómo lo querés?', [
          { id: 'tipo:DELIVERY', title: 'A domicilio' },
          { id: 'tipo:PICKUP', title: 'Recoger' },
        ]);
        return { ...state, step: 'TIPO' };
      }
      await showCart(restaurantId, waId, state);
      return state;
    }

    case 'TIPO': {
      if (choice === 'tipo:DELIVERY' || choice === 'tipo:PICKUP') {
        const type = choice === 'tipo:DELIVERY' ? 'DELIVERY' : 'PICKUP';
        await sendWhatsAppText(restaurantId, waId, '¿A nombre de quién?');
        return { ...state, step: 'NOMBRE', type };
      }
      await sendWhatsAppButtons(restaurantId, waId, '¿Cómo lo querés?', [
        { id: 'tipo:DELIVERY', title: 'A domicilio' },
        { id: 'tipo:PICKUP', title: 'Recoger' },
      ]);
      return state;
    }

    case 'NOMBRE': {
      if (raw.length < 2) {
        await sendWhatsAppText(restaurantId, waId, 'Decime tu nombre para anotarlo en el pedido.');
        return state;
      }
      const name = raw.slice(0, 100);
      if (state.type === 'PICKUP') return await askPayment(restaurantId, waId, { ...state, name });

      await sendWhatsAppText(restaurantId, waId, 'Pasame tu dirección completa (calle, número, referencias).');
      return { ...state, step: 'DIRECCION', name };
    }

    case 'DIRECCION': {
      if (raw.length < 4) {
        await sendWhatsAppText(restaurantId, waId, 'Necesito una dirección más completa para poder llegar.');
        return state;
      }
      const address = raw.slice(0, 300);
      const zones = await getDeliveryZones(restaurantId);
      if (zones.length === 0) return await askPayment(restaurantId, waId, { ...state, address });

      await sendWhatsAppList(
        restaurantId, waId,
        '¿En qué zona estás? El costo de envío depende de eso.',
        'Ver zonas',
        zones.map((z) => ({
          id: `zona:${z.nombre}`,
          title: z.nombre,
          description: z.tarifa > 0 ? `Envío ${money(z.tarifa)}` : 'Envío gratis',
        })),
      );
      return { ...state, step: 'ZONA', address };
    }

    case 'ZONA': {
      if (!choice?.startsWith('zona:')) {
        await sendWhatsAppText(restaurantId, waId, 'Elegí tu zona de la lista para poder calcular el envío.');
        return state;
      }
      return await askPayment(restaurantId, waId, { ...state, zone: choice.slice(5) });
    }

    case 'PAGO': {
      if (choice !== 'pago:CASH' && choice !== 'pago:CARD') {
        return await askPayment(restaurantId, waId, state);
      }
      const payment = choice === 'pago:CASH' ? 'CASH' : 'CARD';
      const conPago: BotState = { ...state, payment, step: 'CONFIRMAR' };

      const donde = conPago.type === 'DELIVERY'
        ? `Envío a: ${conPago.address}${conPago.zone ? ` (${conPago.zone})` : ''}`
        : 'Para recoger en el local';

      await sendWhatsAppButtons(
        restaurantId, waId,
        `Repasemos:\n\n${cartResumen(conPago.cart)}\n\n${donde}\nPago: ${payment === 'CASH' ? 'efectivo' : 'tarjeta al recibir'}\n\n_Al envío se le suma el costo de tu zona._\n\n¿Lo confirmo?`,
        [
          { id: 'crear', title: 'Sí, confirmar' },
          { id: 'ver_carrito', title: 'Cambiar algo' },
        ],
      );
      return conPago;
    }

    case 'CONFIRMAR': {
      if (choice !== 'crear') {
        await sendWhatsAppText(restaurantId, waId, 'Tocá *Sí, confirmar* para mandarlo, o *Cambiar algo* para corregirlo.');
        return state;
      }
      return await placeOrder(input, state);
    }

    default: {
      await sendGreeting(restaurantId, waId, state);
      return { ...state, step: 'MENU' };
    }
  }
}

async function askPayment(restaurantId: string, waId: string, state: BotState): Promise<BotState> {
  await sendWhatsAppButtons(restaurantId, waId, '¿Cómo vas a pagar?', [
    { id: 'pago:CASH', title: 'Efectivo' },
    { id: 'pago:CARD', title: 'Tarjeta al recibir' },
  ]);
  return { ...state, step: 'PAGO' };
}

/* ── Creación del pedido ─────────────────────────────────── */

/**
 * Arma la entrada de createOrder y delega. El total, el envío, el cupón y
 * la propina los calcula ESE camino — el mismo del checkout web.
 */
async function placeOrder(input: BotInput, state: BotState): Promise<BotState> {
  const { restaurantId, waId } = input;

  // wa_id viene como E.164 sin '+', y el esquema del pedido espera los 8
  // dígitos locales de Guatemala: se quita el código de país.
  const localPhone = waId.startsWith('502') ? waId.slice(3) : waId;

  const result = await createOrder({
    restaurantId,
    items: state.cart.map((l) => ({
      productId: l.productId,
      name: l.name,
      price: l.price,
      quantity: l.quantity,
    })),
    customer: {
      name: state.name ?? 'Cliente WhatsApp',
      phone: localPhone,
      type: state.type ?? 'PICKUP',
      ...(state.address ? { address: state.address } : {}),
      ...(state.zone ? { zone: state.zone } : {}),
    },
    paymentMethod: state.payment ?? 'CASH',
  });

  if (result.error || !result.orderId) {
    await sendWhatsAppText(
      restaurantId, waId,
      `No pude cerrar el pedido: ${result.error ?? 'error desconocido'}\n\nEscribime *menú* para intentarlo de nuevo, o *humano* para que te atienda una persona.`,
    );
    return { ...state, step: 'CARRITO' };
  }

  // El canal queda registrado en el pedido: es lo que después permite medir
  // cuántas ventas entran por WhatsApp (migración 101).
  const db = createServiceClient();
  await db.from('orders').update({ source: 'WHATSAPP' }).eq('id', result.orderId);

  const { data: creado } = await db
    .from('orders')
    .select('total, order_number')
    .eq('id', result.orderId)
    .single();

  const total = creado ? money(Number(creado.total)) : null;

  await sendWhatsAppText(
    restaurantId, waId,
    `¡Listo! 🎉 Tu pedido *${result.orderNumber ?? ''}* quedó registrado.` +
    (total ? `\n\nTotal: *${total}*` : '') +
    '\n\nTe voy avisando por aquí cómo avanza.',
  );

  // Carrito limpio: el próximo mensaje empieza un pedido nuevo.
  return { ...EMPTY };
}
