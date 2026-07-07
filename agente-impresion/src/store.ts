// Almacén local del hub (Fase 2 offline): snapshot del menú + cola de
// pedidos tomados sin conexión. Un archivo JSON en disco — no SQLite: el
// volumen de datos es mínimo (el menú de un restaurante, unos pocos
// pedidos pendientes a la vez) y evita el riesgo de empaquetar un módulo
// nativo (better-sqlite3) o depender de una flag experimental (node:sqlite)
// dentro del .exe armado con Node SEA (ver build-exe.mjs).

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
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

export type PendingOrderStatus = 'pending' | 'failed';

export interface PendingOrder {
  /** UUID estable — el mismo que se manda a place_order (idempotente). */
  clientId: string;
  /** Payload completo, con la misma forma que createOrderSchema. */
  payload: unknown;
  orderNumber: string;
  status: PendingOrderStatus;
  error?: string;
  createdAt: string;
}

export interface MenuSnapshot {
  categories: MenuCategory[];
  products: MenuProduct[];
  restaurantName: string;
  kitchenTarget: string | null;
}

interface StoreData {
  menu: MenuSnapshot | null;
  menuSyncedAt: string | null;
  pendingOrders: PendingOrder[];
}

const EMPTY: StoreData = { menu: null, menuSyncedAt: null, pendingOrders: [] };

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
    };
  } catch {
    return { ...EMPTY };
  }
}

/** Escritura atómica: a .tmp y luego rename — evita dejar el archivo a medias. */
function save(data: StoreData): void {
  const path = storePath();
  const tmp = `${path}.tmp`;
  try {
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

export function removePendingOrder(clientId: string): void {
  const data = load();
  data.pendingOrders = data.pendingOrders.filter((o) => o.clientId !== clientId);
  save(data);
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
