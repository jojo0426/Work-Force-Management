import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function expect(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

const app = readFileSync(resolve(process.cwd(), '../mobile/App.tsx'), 'utf8');
const sync = readFileSync(resolve(process.cwd(), '../mobile/src/services/workOrderSync.ts'), 'utf8');

expect('foreground management reconciliation is installed', app.includes("AppState.addEventListener('change'") && app.includes("state==='active'"));
expect('periodic reconciliation uses bounded sync interval', app.includes('setInterval(sync,WORK_ORDER_SYNC_INTERVAL_MS)') && sync.includes('WORK_ORDER_SYNC_INTERVAL_MS = 15_000'));
expect('Start revalidates server state immediately before mutation', app.includes("await refresh(session.token);if(jobRef.current?.status!=='ASSIGNED')") && app.includes('await startWorkOrder'));
expect('Field Issue revalidates WORKING immediately before mutation', app.includes("await refresh(session.token);if(jobRef.current?.status!=='WORKING')") && app.includes('await reportFieldException'));
expect('Evidence upload revalidates WORKING before ticket creation', app.includes("Management changed this work order. Evidence upload was stopped.") && app.includes('await createEvidenceUploadTicket'));
expect('Finish revalidates WORKING before completion mutation', app.includes("Management changed this work order. Finish was stopped.") && app.includes('await finishWorkOrder'));
expect('management transition invalidates unfinished local workflow', app.includes('if(sync.invalidateLocalWorkflow){clearWorkflow()'));
expect('authoritative refresh updates ref before guarded actions continue', app.includes('jobRef.current=sync.selected'));
expect('removed management work order clears selected job', sync.includes('selectedRemoved: true') && sync.includes('selected: null'));
expect('WORKING to non-WORKING transition invalidates stale workflow', sync.includes("currentSelected.status === 'WORKING'") && sync.includes("latest.status !== 'WORKING'"));

console.log('Mobile stale-action / management-race regression gate passed.');
