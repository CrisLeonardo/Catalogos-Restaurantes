'use client';

/* ============================================================
   OUTBOX OFFLINE (Fase 1 del plan) — cola local de pedidos
   ------------------------------------------------------------
   Un pedido que no pudo enviarse por falta de señal se guarda aquí
   (IndexedDB) con su `clientId` (UUID) y se reenvía al reconectar.
   La BD deduplica por client_id (migración 061): reintentar nunca
   duplica.

   Estados de una entrada:
   · pending → aún no se ha logrado enviar (fallo de RED). Se
     reintenta automáticamente (evento online + intervalo).
   · failed  → el servidor SÍ respondió pero rechazó el pedido
     (validación: producto agotado, mesa inválida…). NO se
     reintenta solo — el mesero decide (descartar), porque el
     platillo ya se sirvió físicamente.

   Sin librerías: wrapper mínimo de IndexedDB con promesas.
   localStorage NO sirve aquí (síncrono, ~5 MB, sin índices).
   ============================================================ */

export type OutboxKind = 'waiter' | 'public';

export interface OutboxEntry {
  clientId: string;
  kind: OutboxKind;
  restaurantId: string;
  /** Input completo del server action (ya incluye clientId). */
  payload: unknown;
  /** Descripción corta para la UI ("Mesa 4 · 3 productos"). */
  label: string;
  createdAt: number;
  tries: number;
  status: 'pending' | 'failed';
  lastError: string | null;
}

const DB_NAME = 'leogin-offline';
const DB_VERSION = 1;
const STORE = 'outbox';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'clientId' });
        store.createIndex('by-kind', 'kind');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await reqAsPromise(fn(db.transaction(STORE, mode).objectStore(STORE)));
  } finally {
    db.close();
  }
}

export async function outboxAdd(entry: OutboxEntry): Promise<void> {
  await withStore('readwrite', (s) => s.put(entry));
  notifyChanged();
}

export async function outboxUpdate(entry: OutboxEntry): Promise<void> {
  await withStore('readwrite', (s) => s.put(entry));
  notifyChanged();
}

export async function outboxRemove(clientId: string): Promise<void> {
  await withStore('readwrite', (s) => s.delete(clientId));
  notifyChanged();
}

export async function outboxList(kind: OutboxKind, restaurantId?: string): Promise<OutboxEntry[]> {
  const all = await withStore('readonly', (s) => s.getAll() as IDBRequest<OutboxEntry[]>);
  return all
    .filter((e) => e.kind === kind && (!restaurantId || e.restaurantId === restaurantId))
    .sort((a, b) => a.createdAt - b.createdAt);
}

/* Aviso de cambios para que los hooks re-lean (misma pestaña). */
const CHANGE_EVENT = 'leogin:outbox-changed';
function notifyChanged() {
  try { window.dispatchEvent(new Event(CHANGE_EVENT)); } catch { /* SSR */ }
}
export function onOutboxChange(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb);
  return () => window.removeEventListener(CHANGE_EVENT, cb);
}

/* ── Sincronización ─────────────────────────────────────────
   sender = el server action correspondiente. Contrato:
   · resuelve { error?: string } → respuesta del servidor:
       - sin error → enviado: se elimina de la cola.
       - con error → rechazo de NEGOCIO: pasa a 'failed' (manual).
   · lanza (fetch falló) → sin red: se queda 'pending' y se
     reintentará en el próximo ciclo.                            */

let flushing = false;

export async function flushOutbox(
  kind: OutboxKind,
  restaurantId: string,
  sender: (payload: unknown) => Promise<{ error?: string }>,
): Promise<{ sent: number; stillPending: number }> {
  if (flushing) return { sent: 0, stillPending: 0 };
  flushing = true;
  let sent = 0;
  try {
    const entries = (await outboxList(kind, restaurantId)).filter((e) => e.status === 'pending');
    for (const entry of entries) {
      try {
        const result = await sender(entry.payload);
        if (result?.error) {
          await outboxUpdate({ ...entry, status: 'failed', lastError: result.error, tries: entry.tries + 1 });
        } else {
          await outboxRemove(entry.clientId);
          sent += 1;
        }
      } catch {
        // Sin red todavía: conservar y cortar el ciclo (las demás fallarían igual).
        await outboxUpdate({ ...entry, tries: entry.tries + 1 });
        break;
      }
    }
    const remaining = (await outboxList(kind, restaurantId)).filter((e) => e.status === 'pending').length;
    return { sent, stillPending: remaining };
  } finally {
    flushing = false;
  }
}
