import { PrismaClient } from '@prisma/client';
import { IntegrationFleetControlService } from './integration-fleet-control.service';

function check(name: string, condition: boolean): void {
  if (!condition) throw new Error('FAIL: ' + name);
  console.log('PASS: ' + name);
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL || '';
  if (process.env.GITHUB_ACTIONS !== 'true' || !/\/wfm_ci(?:\?|$)/.test(url)) {
    throw new Error('Phase 5E.2AB race contract test requires isolated GitHub Actions wfm_ci');
  }
  const a = new PrismaClient();
  const b = new PrismaClient();
  const tag = 'phase5e2ab-' + Date.now();
  const jobId = tag + '-job';
  const claimToken = tag + '-claim';
  const controlA = new IntegrationFleetControlService(a as any);
  const controlB = new IntegrationFleetControlService(b as any);
  const arrived = deferred();
  const release = deferred();
  const startNetwork = deferred();
  let callbackEntered = false;
  let externalRequestStarted = false;
  try {
    // This test intentionally enables the synthetic gate in the disposable
    // CI database only. No adapter, HTTP client or real provider is invoked.
    await a.integrationFleetControl.upsert({
      where: { id: 'GLOBAL' },
      create: { id: 'GLOBAL', enabled: true, generation: 0n },
      update: { enabled: true },
    });
    await a.integrationJob.create({
      data: {
        id: jobId, sourceSystem: 'PHASE5E2AB_SYNTHETIC',
        targetSystem: 'MOCK', payload: { synthetic: true },
        status: 'PROCESSING', claimToken,
      },
    });
    const pending = controlA.withFencedDispatch(jobId, claimToken, async () => {
      callbackEntered = true;
      arrived.resolve();
      // Deliberately pause after DB authorization but before a simulated
      // external request start: a real worker may pause here as well.
      await startNetwork.promise;
      externalRequestStarted = true;
      await release.promise;
      return 'SYNTHETIC_SUCCESS';
    });
    await arrived.promise;
    check('callback admitted on first replica', callbackEntered);
    check('no synthetic external request started yet', !externalRequestStarted);
    const stopped = await controlB.stopAndInspect('ci_operator', 'SYNTHETIC_STOP');
    check('second replica acknowledges admissions closure', stopped.acknowledged);
    check('stop never claims external drain', stopped.externallyDrained === false);
    const safety = await controlA.inspectStopSafety();
    check('first replica observes stopped gate and conservative safety',
      safety.admissionsClosed && safety.externalQuiescenceVerified === false);
    check('stop sees unresolved attempt', (safety.unresolvedAttempts || 0) > 0);
    check('simulated external request still not started at stop acknowledgment',
      !externalRequestStarted);
    startNetwork.resolve();
    // This is a known counterexample, not a success claim for strict shutdown.
    // Stop acknowledgement does not prevent already authorized callbacks from
    // starting an external operation later.
    await Promise.resolve();
    check('post-acknowledgment external-start counterexample is observable',
      externalRequestStarted);
    release.resolve();
    const result = await pending;
    check('prior authorized callback may finish after stop',
      result.admitted && result.result === 'SYNTHETIC_SUCCESS');
    const attempts = await b.integrationAdmission.findMany({
      where: { jobId }, select: { status: true },
    });
    check('durable attempt remains unresolved until explicit settlement',
      attempts.length === 1 && attempts[0].status === 'IN_FLIGHT');
    const after = await controlB.inspectStopSafety();
    check('no false external-quiescence claim after callback',
      after.externalQuiescenceVerified === false);
    const blocked = await controlA.reserveAdmission(jobId, claimToken);
    check('new admission rejected after stop', !blocked.admitted);
    console.log('Phase 5E.2AB known limitation and two-replica stop contract passed.');
  } finally {
    startNetwork.resolve();
    release.resolve();
    await Promise.all([a.$disconnect(), b.$disconnect()]);
  }
}
main().catch(error => { console.error(error); process.exit(1); });
