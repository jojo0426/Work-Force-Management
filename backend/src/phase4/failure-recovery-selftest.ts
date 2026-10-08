import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');
const compact = (value: string) => value.replace(/\s+/g, '');
function expect(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

const mobileStale = compact(read('work-orders/mobile-stale-action-selftest.ts'));
const evidence = compact(read('work-orders/evidence-lifecycle-selftest.ts'));
const startRace = compact(read('work-orders/start-race-selftest.ts'));
const finishRace = compact(read('work-orders/finish-race-selftest.ts'));
const assignmentRace = compact(read('work-orders/assignment-race-selftest.ts'));
const live = compact(read('phase4/live-operations.service.ts'));
const escalation = compact(read('phase4/escalation-policy.ts'));

// Mobile/session recovery: stale client actions must reconcile before mutation.
expect('recovery: foreground resumes authoritative reconciliation', mobileStale.includes("AppState.addEventListener('change'") && mobileStale.includes("state==='active'"));
expect('recovery: periodic reconciliation is bounded at 15 seconds', mobileStale.includes('WORK_ORDER_SYNC_INTERVAL_MS=15_000'));
expect('recovery: start revalidates authoritative state', mobileStale.includes("jobRef.current?.status!=='ASSIGNED'"));
expect('recovery: finish revalidates authoritative state', mobileStale.includes("jobRef.current?.status!=='WORKING'") && mobileStale.includes('awaitfinishWorkOrder'));
expect('recovery: evidence upload stops after management transition', mobileStale.includes('Evidenceuploadwasstopped'));
expect('recovery: management transition clears stale local workflow', mobileStale.includes('invalidateLocalWorkflow') && mobileStale.includes('clearWorkflow()'));

// Retry/idempotency: repeated network requests cannot duplicate lifecycle mutations.
expect('recovery: duplicate start creates one execution', startRace.includes('duplicate.executionIds.length===1&&duplicate.auditCount===1'));
expect('recovery: competing start cannot create execution or audit', startRace.includes('competing.executionIds.length===0&&competing.auditCount===0'));
expect('recovery: duplicate finish creates one completion and audit', finishRace.includes('duplicate.finishCount===1&&duplicate.auditCount===1'));
expect('recovery: lost finish claim cannot finalize', finishRace.includes('competing.finishCount===0&&competing.auditCount===0'));
expect('recovery: same-team assignment retry is idempotent', assignmentRace.includes('r.idempotent===true') && assignmentRace.includes('s.audits.length===0'));
expect('recovery: concurrent assignment loser cannot overwrite winner', assignmentRace.includes("s.teamId==='teamA'") && assignmentRace.includes('s.audits.length===1'));

// Evidence interruption/retry: only verified, consumed uploads become active evidence.
expect('recovery: expired upload ticket is rejected', evidence.includes("'expired'"));
expect('recovery: consumed upload ticket cannot be reused', evidence.includes("'alreadybeenconsumed'"));
expect('recovery: missing storage object is rejected', evidence.includes("{exists:false}") && evidence.includes("'notfound'"));
expect('recovery: interrupted or mismatched upload metadata is rejected', evidence.includes("'metadatadoesnotmatch'"));
expect('recovery: successful evidence consumes ticket once', evidence.includes("ok.ticket.status==='CONSUMED'"));
expect('recovery: replacement preserves audit history', evidence.includes("WORK_ORDER_EVIDENCE_REPLACED"));

// Location/attention recovery remains non-destructive and deduplicated.
expect('recovery: missing or stale GPS becomes attention rather than mutation', live.includes("kind:'LOCATION_STALE'") && !live.includes('.update(') && !live.includes('.create('));
expect('recovery: repeated attention has stable dedupe key', escalation.includes("signal.kind,signal.technicianId||'none',signal.workOrderNumber||'none'"));
expect('recovery: attention repeat cooldown exceeds refresh cadence', escalation.includes('cooldownSeconds:15*60') && live.includes('refreshRecommendedSeconds:15'));

console.log('Phase 4 failure/recovery readiness gate passed.');
