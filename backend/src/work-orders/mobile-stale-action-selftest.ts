import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function expect(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

const compact = (value: string) => value.replace(/\s+/g, '');
const app = readFileSync(resolve(process.cwd(), '../mobile/App.tsx'), 'utf8');
const sync = readFileSync(resolve(process.cwd(), '../mobile/src/services/workOrderSync.ts'), 'utf8');
const normalizedApp = compact(app);
const normalizedSync = compact(sync);

expect('foreground management reconciliation is installed', normalizedApp.includes("AppState.addEventListener('change'") && normalizedApp.includes("state=>'active'") === false && normalizedApp.includes("state==='active'"));
expect('periodic reconciliation uses bounded sync interval', normalizedApp.includes('setInterval(sync,WORK_ORDER_SYNC_INTERVAL_MS)') && normalizedSync.includes('WORK_ORDER_SYNC_INTERVAL_MS=15_000'));
expect('Start revalidates server state immediately before mutation', normalizedApp.includes("awaitrefresh(session.token);if(jobRef.current?.status!=='ASSIGNED')") && normalizedApp.includes('awaitstartWorkOrder'));
expect('Field Issue revalidates WORKING immediately before mutation', normalizedApp.includes("awaitrefresh(session.token);if(jobRef.current?.status!=='WORKING')") && normalizedApp.includes('awaitreportFieldException'));
expect('Evidence upload revalidates WORKING before ticket creation', app.includes('Management changed this work order. Evidence upload was stopped.') && normalizedApp.includes('awaitcreateEvidenceUploadTicket'));
expect('Finish revalidates WORKING before completion mutation', app.includes('Management changed this work order. Finish was stopped.') && normalizedApp.includes('awaitfinishWorkOrder'));
expect('management transition invalidates unfinished local workflow', normalizedApp.includes('if(sync.invalidateLocalWorkflow){clearWorkflow()'));
expect('authoritative refresh updates ref before guarded actions continue', normalizedApp.includes('jobRef.current=sync.selected'));
expect('removed management work order clears selected job', normalizedSync.includes('selectedRemoved:true') && normalizedSync.includes('selected:null'));
expect('WORKING to non-WORKING transition invalidates stale workflow', normalizedSync.includes("currentSelected.status==='WORKING'") && normalizedSync.includes("latest.status!=='WORKING'"));

console.log('Mobile stale-action / management-race regression gate passed.');
