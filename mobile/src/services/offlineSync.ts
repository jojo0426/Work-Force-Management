import * as SQLite from 'expo-sqlite';
import { createOfflineQueue, OfflineAction, QueuedAction } from './offlineQueueCore';

let database: Promise<SQLite.SQLiteDatabase> | undefined;
async function getDatabase() {
  if (!database) {
    database = (async () => {
      const db = await SQLite.openDatabaseAsync('fiberblaze.db');
      await db.execAsync(`CREATE TABLE IF NOT EXISTS offline_queue_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ownerId TEXT NOT NULL, action TEXT NOT NULL,
        payload TEXT NOT NULL, createdAt TEXT NOT NULL
      ); CREATE INDEX IF NOT EXISTS offline_queue_v2_owner ON offline_queue_v2(ownerId, id);`);
      return db;
    })().catch(error => { database = undefined; throw error; });
  }
  return database;
}

// No token persistence and no automatic network replay. Caller supplies its
// current authenticated session and server-state reconciliation in send().
export const offlineQueue = createOfflineQueue({
  async insert(ownerId: string, action: OfflineAction, payload: string, createdAt: string) {
    await (await getDatabase()).runAsync(
      'INSERT INTO offline_queue_v2 (ownerId, action, payload, createdAt) VALUES (?, ?, ?, ?)',
      ownerId, action, payload, createdAt);
  },
  async list(ownerId: string) {
    return (await getDatabase()).getAllAsync<QueuedAction>(
      'SELECT * FROM offline_queue_v2 WHERE ownerId = ? ORDER BY id ASC', ownerId);
  },
  async remove(id: number, ownerId: string) {
    await (await getDatabase()).runAsync('DELETE FROM offline_queue_v2 WHERE id = ? AND ownerId = ?', id, ownerId);
  },
});
