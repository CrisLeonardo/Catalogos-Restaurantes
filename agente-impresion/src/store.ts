// Almacén local del hub (Fase 2 offline): snapshot del menú + cola de
// pedidos tomados sin conexión. Un archivo JSON en disco — no SQLite: el
// volumen de datos es mínimo (el menú de un restaurante, unos pocos
// pedidos pendientes a la vez) y evita el riesgo de empaquetar un módulo
// nativo (better-sqlite3) o depender de una flag experimental (node:sqlite)
// dentro del .exe armado con Node SEA (ver build-exe.mjs).

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { installDir } from './setup.ts';
import { logger } from './logger.ts';

export interface MenuCategory {
  id: string;
  name: string;
  icon: string | null;
  sort_order: number;
}

// Mismo shape que PUBLIC_PRODUCT_COLUMNS en plataforma/src/lib/db/menu.ts.
export interface MenuProduct {
  id: string;
  category_id: string;
  name: string;
  price: number;
  is_available: boolean;
  options: unknown;
}

export type PendingOrderStatus = 'pending' | 'failed' | 'synced';

/** Datos ya resueltos (nombres y opciones legibles) para mostrar el pedido en
    el KDS local — se calculan al aceptar el pedido (order-intake.ts), cuando
    el snapshot de menú con el que se validó sigue a mano. */
export interface KdsDisplay {
  customerName: string;
  orderType: string;
  address: string | null;
  notes: string | null;
  total: number;
  items: { name: string; quantity: number; options: string[] }[];
}

export interface PendingOrder {
  /** UUID estable — el mismo que se manda a place_order (idempotente). */
  clientId: string;
  /** Payload completo, con la misma forma que createOrderSchema. */
  payload: unknown;
  orderNumber: string;
  status: PendingOrderStatus;
  error?: string;
  createdAt: string;
  /** Número real de la nube (ORD-…) una vez sincronizado. */
  syncedOrderNumber?: string;
  /** Marcado "listo" en el KDS local — solo presentación, no afecta el sync. */
  kdsDoneAt?: string;
  display?: KdsDisplay;
}

export interface MenuSnapshot {
  categories: MenuCategory[];
  products: MenuProduct[];
  restaurantName: string;
  kitchenTarget: string | null;
}

/** Certificado wildcard + hostname propio para el HTTPS del hub
    (migración 064, ARQUITECTURA_OFFLINE.md §8.1). Lo entrega la nube por
    /api/agent/hub-cert cuando el poll anuncia un certSha256 distinto. */
export interface HubTls {
  hostname: string;
  port: number;
  certPem: string;
  keyPem: string;
  expiresAt: string;
  certSha256: string;
}

interface StoreData {
  menu: MenuSnapshot | null;
  menuSyncedAt: string | null;
  pendingOrders: PendingOrder[];
  /** Token propio del hub para autenticar POST /orders (migración 063).
      Se genera una sola vez y se persiste — así sobrevive a reinicios. */
  hubOrderToken: string | null;
  tls: HubTls | null;
}

const EMPTY: StoreData = { menu: null, menuSyncedAt: null, pendingOrders: [], hubOrderToken: null, tls: null };

function storeDir(): string {
  const dir = installDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function storePath(): string {
  return join(storeDir(), 'hub-store.json');
}

function load(): StoreData {
  try {
    const raw = readFileSync(storePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    return {
      menu: parsed.menu ?? null,
      menuSyncedAt: parsed.menuSyncedAt ?? null,
      pendingOrders: Array.isArray(parsed.pendingOrders) ? parsed.pendingOrders : [],
      hubOrderToken: parsed.hubOrderToken ?? null,
      tls: parsed.tls ?? null,
    };
  } catch {
    return { ...EMPTY };
  }
}

/** Los pedidos sincronizados/fallidos se conservan un tiempo para el KDS
    local y para inspección; después se podan (los 'pending' nunca — deben
    sincronizar sí o sí). */
const RETAIN_MS = 48 * 60 * 60 * 1000;

function prune(orders: PendingOrder[]): PendingOrder[] {
  const cutoff = Date.now() - RETAIN_MS;
  return orders.filter((o) => {
    if (o.status === 'pending') return true;
    const ref = new Date(o.kdsDoneAt ?? o.createdAt).getTime();
    return !Number.isFinite(ref) || ref > cutoff;
  });
}

/** Escritura atómica: a .tmp y luego rename — evita dejar el archivo a medias. */
function save(data: StoreData): void {
  const path = storePath();
  const tmp = `${path}.tmp`;
  try {
    data.pendingOrders = prune(data.pendingOrders);
    writeFileSync(tmp, JSON.stringify(data), 'utf8');
    renameSync(tmp, path);
  } catch (e) {
    logger.warn('No se pudo guardar el store del hub:', (e as Error).message);
  }
}

export function getMenuSnapshot(): StoreData['menu'] {
  return load().menu;
}

export function saveMenuSnapshot(menu: StoreData['menu']): void {
  const data = load();
  data.menu = menu;
  data.menuSyncedAt = new Date().toISOString();
  save(data);
}

export function getPendingOrders(): PendingOrder[] {
  return load().pendingOrders;
}

export function enqueuePendingOrder(order: PendingOrder): void {
  const data = load();
  data.pendingOrders = [...data.pendingOrders.filter((o) => o.clientId !== order.clientId), order];
  save(data);
}

/** Sincronizado con la nube: se conserva (el KDS local lo sigue mostrando
    hasta que cocina lo marque listo), pero ya no se reenvía. */
export function markPendingOrderSynced(clientId: string, syncedOrderNumber?: string): void {
  const data = load();
  const order = data.pendingOrders.find((o) => o.clientId === clientId);
  if (order) {
    order.status = 'synced';
    if (syncedOrderNumber) order.syncedOrderNumber = syncedOrderNumber;
    save(data);
  }
}

/** Pedidos para el KDS local: los no marcados "listo", más viejos primero. */
export function getKdsOrders(): PendingOrder[] {
  return load()
    .pendingOrders.filter((o) => !o.kdsDoneAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function markOrderKdsDone(clientId: string): boolean {
  const data = load();
  const order = data.pendingOrders.find((o) => o.clientId === clientId);
  if (!order) return false;
  order.kdsDoneAt = new Date().toISOString();
  save(data);
  return true;
}

export function markPendingOrderFailed(clientId: string, error: string): void {
  const data = load();
  const order = data.pendingOrders.find((o) => o.clientId === clientId);
  if (order) {
    order.status = 'failed';
    order.error = error;
    save(data);
  }
}

export function getHubTls(): HubTls | null {
  return load().tls;
}

export function saveHubTls(tls: HubTls): void {
  const data = load();
  data.tls = tls;
  save(data);
}

/** Token que POST /orders exige (migración 063). Se genera al primer uso y
    queda fijo — se reporta al cloud en cada heartbeat (ver agent.ts) para
    que checkout/mesero lo reciban y lo manden de vuelta al hub. */
export function getHubOrderToken(): string {
  const data = load();
  if (data.hubOrderToken) return data.hubOrderToken;
  const token = randomBytes(24).toString('hex');
  data.hubOrderToken = token;
  save(data);
  return token;
}
