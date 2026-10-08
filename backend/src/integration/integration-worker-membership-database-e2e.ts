import { PrismaClient } from '@prisma/client';
import { IntegrationWorkerMembershipService } from './integration-worker-membership.service';
import { IntegrationFleetControlService } from './integration-fleet-control.service';

function check(label: string, ok: boolean): void {
  if (!ok) throw new Error('FAIL: ' + label);
  console.log('PASS: ' + label);
}
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL || '';
  if (process.env.GITHUB_ACTIONS !== 'true' || !/\/wfm_ci(?:\?|$)/.test(url)) {
    throw new Error('Isolated CI PostgreSQL wfm_ci required');
  }
  const a = new PrismaClient();
  const b = new PrismaClient();
  const id = 'phase5e2ae-' + Date.now();
  const token = 'synthetic-instance-token-' + id;
  const membershipA = new IntegrationWorkerMembershipService(a as any);
  const membershipB = new IntegrationWorkerMembershipService(b as any);
  const fleet = new IntegrationFleetControlService(b as any);
  try {
    const control = await a.integrationFleetControl.upsert({
      where: { id: 'GLOBAL' },
      create: { id: 'GLOBAL', enabled: true, generation: 0n },
      update: { enabled: true },
    });
    const generation = control.generation;
    check('first replica registers', await membershipA.register(id, token, generation));
    check('duplicate registration fails closed',
      !(await membershipB.register(id, token + '-forged', generation)));
    check('stop acknowledgment rejected while enabled',
      !(await membershipB.acknowledgeStop(id, token, generation)));
    const stop = await fleet.stopFleet('ci_operator', 'SYNTHETIC_STOP');
    check('second replica stopped fleet', stop.stopped && stop.generation !== null);
    const stoppedGeneration = stop.generation!;
    check('stale generation acknowledgment denied',
      !(await membershipA.acknowledgeStop(id, token, generation)));
    check('forged token denied',
      !(await membershipA.acknowledgeStop(id, token + '-forged', stoppedGeneration)));
    const before = await membershipB.inspectStoppedFleet([id]);
    check('unacknowledged worker fails closed',
      before.admissionsClosed && !before.allAcknowledged &&
      !before.externallyQuiescent);
    const results = await Promise.all([
      membershipA.acknowledgeStop(id, token, stoppedGeneration),
      membershipB.acknowledgeStop(id, token, stoppedGeneration),
    ]);
    check('concurrent stop acknowledgment recorded exactly once',
      results.filter(Boolean).length === 1);
    const record = await b.integrationWorkerMembership.findUnique({ where: { workerId: id } });
    check('durable acknowledgment visible across database connections',
      record?.stopAckGeneration === stoppedGeneration && record.stopAckAt !== null);
    const missing = await membershipA.inspectStoppedFleet([id, id + '-missing']);
    check('missing expected replica blocks all-acknowledged',
      !missing.allAcknowledged && !missing.externallyQuiescent);
    const final = await membershipB.inspectStoppedFleet([id]);
    check('local acknowledgement does not prove provider quiescence',
      final.allAcknowledged && final.externallyQuiescent === false);
    const invalid = await membershipB.inspectStoppedFleet([]);
    check('empty roster rejected', invalid.reason === 'INVALID_ROSTER');
    console.log('Phase 5E.2AE isolated worker membership database E2E passed.');
  } finally {
    await Promise.all([a.$disconnect(), b.$disconnect()]);
  }
}
main().catch(error => { console.error(error); process.exit(1); });
