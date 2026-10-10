export type OfflineAction = 'START_WORK_ORDER' | 'FINISH_WORK_ORDER' | 'FIELD_EXCEPTION';
export type QueuedAction = { id: number; ownerId: string; action: OfflineAction; payload: string; createdAt: string };
export interface QueueStore {
  insert(ownerId: string, action: OfflineAction, payload: string, createdAt: string): Promise<void>;
  list(ownerId: string): Promise<QueuedAction[]>;
  remove(id: number, ownerId: string): Promise<void>;
}
/** A sender must reconcile current server state and acknowledge success explicitly. */
export function createOfflineQueue(store: QueueStore) {
  let syncing = false;
  return {
    async enqueue(ownerId: string, action: OfflineAction, payload: unknown) {
      if (!ownerId.trim() || !['START_WORK_ORDER', 'FINISH_WORK_ORDER', 'FIELD_EXCEPTION'].includes(action)) {
        throw new Error('Queue owner and supported action are required');
      }
      const encoded = JSON.stringify(payload);
      if (!encoded || encoded.length > 100_000) throw new Error('Invalid offline payload');
      await store.insert(ownerId, action, encoded, new Date().toISOString());
    },
    async sync(ownerId: string, send: (item: QueuedAction) => Promise<boolean>) {
      if (!ownerId.trim() || typeof send !== 'function') throw new Error('Queue owner and sender are required');
      if (syncing) return { synced: 0, busy: true };
      syncing = true;
      let synced = 0;
      try {
        for (const item of await store.list(ownerId)) {
          if (item.ownerId !== ownerId) throw new Error('Offline queue owner mismatch');
          // Preserve order and stop on ambiguity; never erase a failed/unknown action.
          let confirmed = false;
          try { confirmed = await send(item); } catch { break; }
          if (confirmed !== true) break;
          await store.remove(item.id, ownerId);
          synced++;
        }
        return { synced, busy: false };
      } finally { syncing = false; }
    },
  };
}
