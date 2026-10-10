import { strict as assert } from 'assert';
import { createOfflineQueue } from './offlineQueueCore.ts';
import type { QueuedAction } from './offlineQueueCore.ts';
async function main() {
  let rows: QueuedAction[] = [], next = 1;
  const queue = createOfflineQueue({
    async insert(ownerId, action, payload, createdAt) { rows.push({ id: next++, ownerId, action, payload, createdAt }); },
    async list(ownerId) { return rows.filter(item => item.ownerId === ownerId); },
    async remove(id, ownerId) { rows = rows.filter(item => item.id !== id || item.ownerId !== ownerId); },
  });
  await queue.enqueue('alice', 'START_WORK_ORDER', { workOrderId: 'wo1' });
  await queue.enqueue('alice', 'FINISH_WORK_ORDER', { workOrderId: 'wo1' });
  await queue.enqueue('bob', 'FIELD_EXCEPTION', { workOrderId: 'wo2' });
  assert.equal((await queue.sync('alice', async () => false)).synced, 0);
  assert.equal(rows.length, 3);
  assert.equal((await queue.sync('alice', async () => { throw new Error('response lost'); })).synced, 0);
  assert.equal(rows.length, 3);
  let release!: () => void;
  const pending = new Promise<boolean>(resolve => { release = () => resolve(true); });
  const active = queue.sync('alice', async () => pending);
  assert.equal((await queue.sync('alice', async () => true)).busy, true);
  release();
  assert.equal((await active).synced, 2);
  assert.equal(rows.length, 1); assert.equal(rows[0].ownerId, 'bob');
  assert.equal((await queue.sync('bob', async item => JSON.parse(item.payload).workOrderId === 'wo2')).synced, 1);
  assert.equal(rows.length, 0);
  await assert.rejects(queue.enqueue('', 'START_WORK_ORDER', {}));
  await assert.rejects(queue.enqueue('alice', 'UNKNOWN' as any, {}));
  await assert.rejects(queue.enqueue('alice', 'START_WORK_ORDER', undefined));
  console.log('PASS: failed/ambiguous actions retained; confirmed actions removed; replay serialized and account-isolated');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
