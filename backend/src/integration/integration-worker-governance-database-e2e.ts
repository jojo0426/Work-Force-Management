import { PrismaClient } from '@prisma/client';
import { CI_GOVERNANCE_KEY, CI_NOW, syntheticGovernanceSession } from './integration-governance-session-test-fixture';
import { IntegrationWorkerGovernanceService } from './integration-worker-governance.service';

function check(label: string, ok: boolean): void {
  if (!ok) throw new Error('FAIL: ' + label);
  console.log('PASS: ' + label);
}
async function main(): Promise<void> {
  if (process.env.GITHUB_ACTIONS !== 'true' ||
      !/\/wfm_ci(?:\?|$)/.test(process.env.DATABASE_URL || '')) {
    throw new Error('Isolated CI PostgreSQL wfm_ci required');
  }
  const a = new PrismaClient();
  const b = new PrismaClient();
  const id = 'phase5e2ah-' + Date.now();
  const svcA = new IntegrationWorkerGovernanceService(a as any);
  const svcB = new IntegrationWorkerGovernanceService(b as any);
  const alice = { actorId: id + '-alice', sessionHash: 'a'.repeat(64), privileged: true };
  const bob = { actorId: id + '-bob', sessionHash: 'b'.repeat(64), privileged: true };
  const requestId = 'request-' + id;
  try {
    await a.integrationFleetControl.upsert({
      where: { id: 'GLOBAL' },
      create: { id: 'GLOBAL', enabled: false, generation: 0n },
      update: { enabled: false },
    });
    check('review before proposal denied',
      !(await svcB.recordAuthenticated(id, 'ROTATE', 'APPROVE', syntheticGovernanceSession(bob.actorId, 'bob-session-1234567890'), CI_GOVERNANCE_KEY, CI_NOW, undefined, requestId)));
    check('unprivileged proposal denied',
      !(await svcA.recordAuthenticated(id, 'ROTATE', 'PROPOSE', syntheticGovernanceSession(alice.actorId, 'alice-session-1234567890', { role: 'VIEWER' }), CI_GOVERNANCE_KEY, CI_NOW, undefined, requestId)));
    check('first independent proposal accepted',
      await svcA.recordAuthenticated(id, 'ROTATE', 'PROPOSE', syntheticGovernanceSession(alice.actorId, 'alice-session-1234567890'), CI_GOVERNANCE_KEY, CI_NOW, undefined, requestId));
    check('same actor cannot approve',
      !(await svcA.recordAuthenticated(id, 'ROTATE', 'APPROVE', syntheticGovernanceSession(alice.actorId, 'alice-session-1234567890'), CI_GOVERNANCE_KEY, CI_NOW, undefined, requestId)));
    check('same session cannot approve under different actor',
      !(await svcB.recordAuthenticated(id, 'ROTATE', 'APPROVE', syntheticGovernanceSession(bob.actorId, 'alice-session-1234567890'), CI_GOVERNANCE_KEY, CI_NOW, undefined, requestId)));
    const concurrent = await Promise.all([
      svcA.recordAuthenticated(id, 'ROTATE', 'APPROVE', syntheticGovernanceSession(bob.actorId, 'bob-session-1234567890'), CI_GOVERNANCE_KEY, CI_NOW, undefined, requestId),
      svcB.recordAuthenticated(id, 'ROTATE', 'APPROVE', syntheticGovernanceSession(bob.actorId, 'bob-session-1234567890'), CI_GOVERNANCE_KEY, CI_NOW, undefined, requestId),
    ]);
    check('concurrent review exactly one winner', concurrent.filter(Boolean).length === 1);
    check('independent approval persists across database connections',
      await svcB.hasIndependentApproval(id, 'ROTATE'));
    const events = await b.integrationWorkerGovernanceEvent.findMany({ where: { workerId: id } });
    check('immutable ledger contains proposal and approval', events.length === 2);
    let rejected = false;
    try {
      await b.integrationWorkerGovernanceEvent.delete({ where: { id: events[0].id } });
    } catch { rejected = true; }
    check('database rejects audit deletion', rejected);
    check('unapproved operation cannot borrow approval',
      !(await svcA.hasIndependentApproval(id, 'RETIRE')));
    console.log('Phase 5E.2AH governance PostgreSQL E2E passed.');
  } finally {
    await Promise.all([a.$disconnect(), b.$disconnect()]);
  }
}
main().catch(error => { console.error(error); process.exit(1); });
