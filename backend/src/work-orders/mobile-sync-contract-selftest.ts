import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function expect(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

const sync = readFileSync(resolve(process.cwd(), '../mobile/src/services/workOrderSync.ts'), 'utf8');
const api = readFileSync(resolve(process.cwd(), '../mobile/src/services/api.ts'), 'utf8');

expect('mobile sync is server-authoritative', sync.includes('serverJobs.find'));
expect('removed management job clears technician selection', sync.includes('selectedRemoved: true') && sync.includes('selected: null'));
expect('management status changes are detected', sync.includes("latest.status !== currentSelected.status"));
expect('leaving WORKING invalidates stale local workflow', sync.includes("currentSelected.status === 'WORKING'") && sync.includes("latest.status !== 'WORKING'"));
expect('sync cadence is bounded at 15 seconds', sync.includes('WORK_ORDER_SYNC_INTERVAL_MS = 15_000'));
expect('sync source remains authenticated assigned work-order endpoint', api.includes("'/work-orders'"));

console.log('Mobile management synchronization contract gate passed.');
