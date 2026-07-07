/* ============================================================
   IDENTIDAD LOCAL DEL CLIENTE FINAL (sin contraseñas)
   ------------------------------------------------------------
   El cliente NO necesita crear cuenta: al hacer su primer pedido
   guardamos su perfil básico (nombre, teléfono, dirección, zona)
   y su historial de pedidos en localStorage, por restaurante.
   · El checkout se autocompleta en visitas siguientes.
   · "Mis pedidos" lista sus pedidos con el token de seguimiento,
     aunque haya cerrado la app a mitad del proceso.
   · visitor_id es un UUID anónimo por dispositivo para métricas.
   Todo es tolerante a fallos: si localStorage no existe (SSR,
   modo incógnito estricto), las funciones devuelven valores vacíos.
   ============================================================ */

export interface LocalCustomerProfile {
  name: string;
  phone: string;
  address?: string;
  zone?: string;
  deliveryType?: 'delivery' | 'pickup';
}

export interface LocalOrderRef {
  /** Vacío mientras el pedido no tenga token público todavía (aceptado por
      el hub local sin conexión, pendiente de sincronizar — ver clientId). */
  token: string;
  orderNumber: string;
  createdAt: string;       // ISO
  total: number;
  /** clientId del pedido — presente solo mientras token está vacío, para
      poder resolverlo después con getOrderRefByClientId (ver my-orders.tsx). */
  clientId?: string;
}

const profileKey = (restaurantId: string) => `customer-${restaurantId}`;
const ordersKey  = (restaurantId: string) => `myorders-${restaurantId}`;
const VISITOR_KEY = 'leogin-visitor-id';
const MAX_ORDERS = 25;

/* ── Perfil ───────────────────────────────────────────────── */

export function getLocalProfile(restaurantId: string): LocalCustomerProfile | null {
  try {
    const raw = localStorage.getItem(profileKey(restaurantId));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<LocalCustomerProfile>;
    if (typeof p?.name !== 'string' || typeof p?.phone !== 'string') return null;
    return {
      name: p.name,
      phone: p.phone,
      address: typeof p.address === 'string' ? p.address : undefined,
      zone: typeof p.zone === 'string' ? p.zone : undefined,
      deliveryType: p.deliveryType === 'delivery' || p.deliveryType === 'pickup' ? p.deliveryType : undefined,
    };
  } catch {
    return null;
  }
}

export function saveLocalProfile(restaurantId: string, profile: LocalCustomerProfile): void {
  try {
    localStorage.setItem(profileKey(restaurantId), JSON.stringify(profile));
  } catch {}
}

/* ── Historial de pedidos del dispositivo ─────────────────── */

export function getLocalOrders(restaurantId: string): LocalOrderRef[] {
  try {
    const raw = localStorage.getItem(ordersKey(restaurantId));
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return (list as Partial<LocalOrderRef>[])
      .filter((o) => typeof o?.token === 'string' && typeof o?.orderNumber === 'string')
      .map((o) => ({
        token: o.token!,
        orderNumber: o.orderNumber!,
        createdAt: typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString(),
        total: Number(o.total) || 0,
        clientId: typeof o.clientId === 'string' ? o.clientId : undefined,
      }));
  } catch {
    return [];
  }
}

export function addLocalOrder(restaurantId: string, order: LocalOrderRef): void {
  try {
    // Dedupe por clientId cuando lo hay (reemplaza el registro "pendiente" de
    // un pedido de hub por el definitivo con token real), si no por token.
    const list = [
      order,
      ...getLocalOrders(restaurantId).filter((o) => {
        if (order.clientId && o.clientId === order.clientId) return false;
        if (order.token && o.token === order.token) return false;
        return true;
      }),
    ];
    localStorage.setItem(ordersKey(restaurantId), JSON.stringify(list.slice(0, MAX_ORDERS)));
  } catch {}
}

/* ── Sucursal preferida del grupo (selector geo) ──────────── */
// Recuerda a qué sucursal entró el cliente desde el link del grupo, para no
// volver a preguntarle en visitas siguientes (con escape "cambiar sucursal").

const branchKey = (orgSlug: string) => `group-branch-${orgSlug}`;

export function getPreferredBranch(orgSlug: string): string | null {
  try {
    const slug = localStorage.getItem(branchKey(orgSlug));
    return slug && /^[a-z0-9-]+$/i.test(slug) ? slug : null;
  } catch {
    return null;
  }
}

export function savePreferredBranch(orgSlug: string, branchSlug: string): void {
  try {
    localStorage.setItem(branchKey(orgSlug), branchSlug);
  } catch {}
}

export function clearPreferredBranch(orgSlug: string): void {
  try {
    localStorage.removeItem(branchKey(orgSlug));
  } catch {}
}

/* ── Visitante anónimo (métricas) ─────────────────────────── */

export function getVisitorId(): string | null {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}
