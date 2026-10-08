import { PrismaClient } from '@prisma/client';
import { IntegrationFleetControlService } from './integration-fleet-control.service';
import { IntegrationService } from './integration.service';

// Destructive fixture is restricted to the isolated GitHub Actions test database.
if (process.env.GITHUB_ACTIONS !== 'true' || !/\/wfm_ci(?:\?|$)/.test(process.env.DATABASE_URL || '')) {
  throw new Error('Phase 5E.2D database race test is restricted to isolated GitHub Actions wfm_ci');
}
const db = new PrismaClient();
const control = new IntegrationFleetControlService(db as any);
const queue = new IntegrationService(db as any);
const tag = 'phase5e2d-' + Date.now();
function check(name: string, yes: boolean): void {
  if (!yes) throw new Error('FAIL: ' + name);
  console.log('PASS: ' + name);
}
async function main(): Promise<void> {
  console.log('=== PHASE 5E.2D DATABASE STOP / RESERVATION RACE ===');
  const existing = await db.integrationFleetControl.findUnique({ where: { id: 'GLOBAL' } });
  check('isolated test has no pre-existing fleet control', existing === null);
  const job = await queue.queueIntegrationJob(tag, 'SANDBOX', { synthetic: true }, tag);
  try {
    const claim = await queue.claimNextJob(new Date(Date.now() + 1000));
    check('synthetic job claimed', claim?.id === job.job.id && !!claim?.claimToken);
    const missing = await control.reserveAdmission(claim!.id, claim!.claimToken!);
    check('missing singleton blocks reservation', !missing.admitted);
    const stopMissing = await control.stopFleet('ci-operator', 'TEST_STOP');
    check('missing singleton never acknowledges stop', !stopMissing.stopped);

    // Test-only enabled row: no adapters, no network, CI database only.
    await db.integrationFleetControl.create({ data: { id: 'GLOBAL', enabled: true, generation: 0n } });
    const [reserve, stop] = await Promise.all([
      control.reserveAdmission(claim!.id, claim!.claimToken!),
      control.stopFleet('ci-operator', 'TEST_STOP'),
    ]);
    check('concurrent stop acknowledged', stop.stopped && stop.generation === 1n);
    check('reservation either committed before stop or was rejected', typeof reserve.admitted === 'boolean');
    // Re-enable ONLY inside this isolated CI fixture for the held-lock dispatch race.
    await db.integrationFleetControl.update({ where: { id: 'GLOBAL' }, data: { enabled: true } });
    let entered!: () => void;
    let release!: () => void;
    const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
    const releasePromise = new Promise<void>(resolve => { release = resolve; });
    const dispatched = control.withFencedDispatch(claim!.id, claim!.claimToken!, async () => {
      entered();
      await releasePromise;
      return 'SYNTHETIC_ONLY';
    });
    await enteredPromise;
    let stopAcknowledged = false;
    const stopDuringDispatch = control.stopFleet('ci-operator', 'TEST_STOP').then(value => {
      stopAcknowledged = true;
      return value;
    });
    // Yield to the stop transaction while the callback retains the row lock.
    await new Promise(resolve => setTimeout(resolve, 150));
    check('stop not acknowledged while dispatch callback holds fence', !stopAcknowledged);
    release();
    const fenced = await dispatched;
    const stoppedAfter = await stopDuringDispatch;
    check('synthetic dispatch completes before stop acknowledgement', fenced.admitted && fenced.result === 'SYNTHETIC_ONLY' && stoppedAfter.stopped);
    check('second stop advances generation', stoppedAfter.generation === 2n);
    // A callback failure must not erase the already committed marker.
    await db.integrationFleetControl.update({ where: { id: 'GLOBAL' }, data: { enabled: true } });
    const beforeFailure = await db.integrationAdmission.count({ where: { jobId: claim!.id } });
    let syntheticFailureCaught = false;
    try {
      await control.withFencedDispatch(claim!.id, claim!.claimToken!, async () => {
        throw new Error('synthetic provider outcome unknown');
      });
    } catch {
      syntheticFailureCaught = true;
    }
    check('synthetic callback failure is observable', syntheticFailureCaught);
    const afterFailure = await db.integrationAdmission.count({ where: { jobId: claim!.id } });
    check('callback rollback does not erase committed dispatch marker', afterFailure === beforeFailure + 1);
    // Two independent Prisma connections simulate distinct backend replicas.
    const replicaDb = new PrismaClient();
    try {
      const replica = new IntegrationFleetControlService(replicaDb as any);
      const unresolvedBeforeStop = await replica.inspectDrain();
      check('second replica observes unresolved durable attempts', unresolvedBeforeStop.unresolved !== null && unresolvedBeforeStop.unresolved > 0);
      const marker = await replicaDb.integrationAdmission.findFirst({
        where: { jobId: claim!.id, status: 'MAY_HAVE_DISPATCHED' },
        orderBy: { admittedAt: 'desc' },
      });
      check('second replica sees independently committed marker', !!marker);
      const marked = await replica.markAttemptInFlight(marker!.id, claim!.id, claim!.claimToken!);
      check('second replica transitions owned attempt to IN_FLIGHT', marked);
      const uncertain = await control.markAttemptUncertain(marker!.id, claim!.id, claim!.claimToken!);
      check('first replica durably quarantines IN_FLIGHT as UNCERTAIN', uncertain);
      const persisted = await replicaDb.integrationAdmission.findUnique({ where: { id: marker!.id } });
      check('uncertain state visible across replica connections', persisted?.status === 'UNCERTAIN');
    } finally {
      await replicaDb.$disconnect();
    }
    const finalStop = await control.stopFleet('ci-operator', 'TEST_STOP');
    check('stop after callback failure succeeds', finalStop.stopped && finalStop.generation === 3n);
    const drainAfterStop = await control.inspectDrain();
    check('stopped fleet with uncertain attempt cannot claim drained', drainAfterStop.stopped && !drainAfterStop.drained && drainAfterStop.unresolved !== null && drainAfterStop.unresolved > 0);
    const after = await control.reserveAdmission(claim!.id, claim!.claimToken!);
    check('post-stop admission is blocked', !after.admitted);
    const row = await db.integrationFleetControl.findUnique({ where: { id: 'GLOBAL' } });
    check('stop persisted disabled and advanced generation', row?.enabled === false && row.generation === 3n);
    const admissions = await db.integrationAdmission.findMany({ where: { jobId: claim!.id } });
    check('no admission can have stopped generation', admissions.every(x => x.generation < 3n));
    check('at most one synthetic admission', admissions.length <= 3);
    console.log('PASS: database held-lock synthetic dispatch ordering verified; provider crash and ambiguous side effects NOT proven.');
  } finally {
    await db.integrationAdmission.deleteMany({ where: { jobId: job.job.id } });
    await db.integrationJob.deleteMany({ where: { sourceSystem: tag } });
    await db.integrationFleetControl.deleteMany({ where: { id: 'GLOBAL' } });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await db.$disconnect(); });
