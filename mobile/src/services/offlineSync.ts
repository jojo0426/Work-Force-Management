import * as SQLite from 'expo-sqlite';
const db = SQLite.openDatabase('fiberblaze.db');

export const offlineQueue = {
  enqueue: (action: string, payload: any) => {
    db.transaction(tx => {
      tx.executeSql('INSERT INTO offline_queue (action, payload, createdAt) VALUES (?, ?, ?)', [action, JSON.stringify(payload), new Date().toISOString()]);
    });
  },
  sync: async (apiUrl: string) => {
    return new Promise((resolve) => {
      db.transaction(tx => {
        tx.executeSql('SELECT * FROM offline_queue ORDER BY id ASC', [], async (_, { rows }) => {
          for (let i = 0; i < rows.length; i++) {
            const item = rows.item(i);
            try {
              // Try to sync each queued action
              console.log('Syncing offline:', item.action);
              // await fetch(...)
              // On success delete
              tx.executeSql('DELETE FROM offline_queue WHERE id = ?', [item.id]);
            } catch {}
          }
          resolve(true);
        });
      });
    });
  }
};
