import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { CI_GOVERNANCE_KEY, CI_NOW, syntheticGovernanceSession } from './integration-governance-session-test-fixture';
import { IntegrationWorkerGovernanceService } from './integration-worker-governance.service';
import { IntegrationGovernedWorkerMutationService } from './integration-governed-worker-mutation.service';

function check(label: string, ok: boolean): void {
  if (!ok) throw new Error('FAIL: ' + label);
  console.log('PASS: ' + label);
}
async function main(): Promise<void> {
  if (process.env.GITHUB_ACTIONS !== 'true' ||
      !/\/wfm_ci(?:\?|$)/.test(process.env.DATABASE_URL || '')) {
    throw new Error('Isolated CI PostgreSQL wfm_ci required');
  }
  const a = new PrismaClient(), b = new PrismaClient();
  const id = 'phase5e2ah-gated-' + Date.now();
  const governance = new IntegrationWorkerGovernanceService(a as any);
  const mutationA = new IntegrationGovernedWorkerMutationService(a as any);
  const mutationB = new IntegrationGovernedWorkerMutationService(b as any);
  const proposer = { actorId: id + '-proposer', sessionHash: 'c'.repeat(64), privileged: true };
  const reviewer = { actorId: id + '-reviewer', sessionHash: 'd'.repeat(64), privileged: true };
  const secret = 'synthetic-long-secret-' + id;
  const credentialHash = createHash('sha256').update(secret).digest('hex');
  const requestId = 'request-' + id;
  const retirementRequestId = 'retire-' + id;
  try {
    await a.integrationFleetControl.upsert({
      where: { id: 'GLOBAL' },
      create: { id: 'GLOBAL', enabled: false, generation: 0n },
      update: { enabled: false },
    });
    check('enrollment denied without governance',
      !(await mutationA.applyAuthenticated(id, 'ENROLL', syntheticGovernanceSession(reviewer.actorId, 'reviewer-session-1234567890'), CI_GOVERNANCE_KEY, CI_NOW, secret, requestId)));
    check('proposal recorded', await governance.recordAuthenticated(id, 'ENROLL', 'PROPOSE', syntheticGovernanceSession(proposer.actorId, 'proposer-session-1234567890'), CI_GOVERNANCE_KEY, CI_NOW, credentialHash, requestId));
    check('proposal alone cannot authorize enrollment',
      !(await mutationA.applyAuthenticated(id, 'ENROLL', syntheticGovernanceSession(reviewer.actorId, 'reviewer-session-1234567890'), CI_GOVERNANCE_KEY, CI_NOW, secret, requestId)));
    check('independent approval recorded',
      await governance.recordAuthenticated(id, 'ENROLL', 'APPROVE', syntheticGovernanceSession(reviewer.actorId, 'reviewer-session-1234567890'), CI_GOVERNANCE_KEY, CI_NOW, credentialHash, requestId));
    check('wrong approver cannot execute',
      !(await mutationB.applyAuthenticated(id, 'ENROLL', syntheticGovernanceSession(proposer.actorId, 'proposer-session-1234567890'), CI_GOVERNANCE_KEY, CI_NOW, secret, requestId)));
    const concurrent = await Promise.all([
      mutationA.applyAuthenticated(id, 'ENROLL', syntheticGovernanceSession(reviewer.actorId, 'reviewer-session-1234567890'), CI_GOVERNANCE_KEY, CI_NOW, secret, requestId),
      mutationB.applyAuthenticated(id, 'ENROLL', syntheticGovernanceSession(reviewer.actorId, 'reviewer-session-1234567890'), CI_GOVERNANCE_KEY, CI_NOW, secret, requestId),
    ]);
    check('concurrent approved enrollment has exactly one winner',
      concurrent.filter(Boolean).length === 1);
    const enrolled = await b.integrationExpectedWorker.findUnique({ where: { workerId: id } });
    check('enrolled credential is hashed',
      enrolled?.credentialHash.length === 64 && enrolled.credentialHash !== secret);
    check('retirement cannot reuse enrollment approval',
      !(await mutationA.applyAuthenticated(id, 'RETIRE', syntheticGovernanceSession(reviewer.actorId, 'reviewer-session-1234567890'), CI_GOVERNANCE_KEY, CI_NOW, undefined, retirementRequestId)));
    check('retirement proposal recorded',
      await governance.recordAuthenticated(id, 'RETIRE', 'PROPOSE', syntheticGovernanceSession(proposer.actorId, 'proposer-session-1234567890'), CI_GOVERNANCE_KEY, CI_NOW, undefined, retirementRequestId));
    check('retirement approval recorded',
      await governance.recordAuthenticated(id, 'RETIRE', 'APPROVE', syntheticGovernanceSession(reviewer.actorId, 'reviewer-session-1234567890'), CI_GOVERNANCE_KEY, CI_NOW, undefined, retirementRequestId));
    const pending = await a.integrationAdmission.count({
      where: { status: { in: ['ADMITTED','MAY_HAVE_DISPATCHED','IN_FLIGHT','UNCERTAIN'] } },
    });
    const retired = await mutationB.applyAuthenticated(id, 'RETIRE', syntheticGovernanceSession(reviewer.actorId, 'reviewer-session-1234567890'), CI_GOVERNANCE_KEY, CI_NOW, undefined, retirementRequestId);
    check('retirement respects global unresolved ledger',
      pending === 0 ? retired : !retired);
    if (retired) {
      check('retirement cannot be replayed',
        !(await mutationA.applyAuthenticated(id, 'RETIRE', syntheticGovernanceSession(reviewer.actorId, 'reviewer-session-1234567890'), CI_GOVERNANCE_KEY, CI_NOW, undefined, retirementRequestId)));
    }
    console.log('Phase 5E.2AH governed mutation PostgreSQL E2E passed.');
  } finally {
    await Promise.all([a.$disconnect(), b.$disconnect()]);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
