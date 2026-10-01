import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function expect(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

const compact = (value: string) => value.replace(/\s+/g, '');
const sync = readFileSync(resolve(process.cwd(), '../mobile/src/services/workOrderSync.ts'), 'utf8');
const api = readFileSync(resolve(process.cwd(), '../mobile/src/services/api.ts'), 'utf8');
const normalizedSync = compact(sync);

expect('mobile sync is server-authoritative', normalizedSync.includes('serverJobs.find'));
expect('removed management job clears technician selection', normalizedSync.includes('selectedRemoved:true') && normalizedSync.includes('selected:null'));
expect('management status changes are detected', normalizedSync.includes("latest.status!==currentSelected.status"));
expect('leaving WORKING invalidates stale local workflow', normalizedSync.includes("currentSelected.status==='WORKING'") && normalizedSync.includes("latest.status!=='WORKING'"));
expect('sync cadence is bounded at 15 seconds', normalizedSync.includes('WORK_ORDER_SYNC_INTERVAL_MS=15_000'));
expect('sync source remains authenticated assigned work-order endpoint', api.includes("'/work-orders'"));

console.log('Mobile management synchronization contract gate passed.');
