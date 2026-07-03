'use client';

/* Hook de sincronización del outbox offline (Fase 1).
   Mantiene la lista reactiva (pending/failed) y reenvía solo:
   al montar, al evento `online` y cada 20 s mientras haya pendientes. */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  flushOutbox, onOutboxChange, outboxList, outboxRemove,
  type OutboxEntry, type OutboxKind,
} from '@/lib/offline/outbox';

const RETRY_INTERVAL_MS = 20_000;

export function useOutbox(
  kind: OutboxKind,
  restaurantId: string,
  sender: (payload: unknown) => Promise<{ error?: string }>,
  onSynced?: (sent: number) => void,
) {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const entriesRef = useRef(entries);

  // Refs para no re-crear efectos cuando el llamador pasa lambdas nuevas.
  // (Se sincronizan en un efecto: React 19 prohíbe escribir refs en render.)
  const senderRef = useRef(sender);
  const onSyncedRef = useRef(onSynced);
  useEffect(() => {
    entriesRef.current = entries;
    senderRef.current = sender;
    onSyncedRef.current = onSynced;
  });

  const refresh = useCallback(async () => {
    try { setEntries(await outboxList(kind, restaurantId)); } catch { /* IDB no disponible */ }
  }, [kind, restaurantId]);

  const flush = useCallback(async () => {
    try {
      const { sent } = await flushOutbox(kind, restaurantId, (p) => senderRef.current(p));
      if (sent > 0) onSyncedRef.current?.(sent);
    } catch { /* best-effort */ }
  }, [kind, restaurantId]);

  useEffect(() => {
    refresh();
    const offChange = onOutboxChange(refresh);
    flush();
    window.addEventListener('online', flush);
    const timer = setInterval(() => {
      if (entriesRef.current.some((e) => e.status === 'pending')) flush();
    }, RETRY_INTERVAL_MS);
    return () => {
      offChange();
      window.removeEventListener('online', flush);
      clearInterval(timer);
    };
  }, [refresh, flush]);

  const discard = useCallback(async (clientId: string) => {
    try { await outboxRemove(clientId); } catch { /* best-effort */ }
  }, []);

  return {
    pending: entries.filter((e) => e.status === 'pending'),
    failed: entries.filter((e) => e.status === 'failed'),
    discard,
    flush,
  };
}
