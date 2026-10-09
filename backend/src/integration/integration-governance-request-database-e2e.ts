import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { IntegrationWorkerGovernanceService } from './integration-worker-governance.service';
import { IntegrationGovernedWorkerMutationService } from './integration-governed-worker-mutation.service';
import { IntegrationLegacyCredentialInventoryService } from './integration-legacy-credential-inventory.service';
import { CI_GOVERNANCE_KEY, CI_NOW, syntheticGovernanceSession } from './integration-governance-session-test-fixture';

function check(label: string, value: boolean): void {
  if (!value) throw new Error('FAIL: ' + label);
  console.log('PASS: ' + label);
}
async function main(): Promise<void> {
  if (process.env.GITHUB_ACTIONS !== 'true' ||
      !/\/wfm_ci(?:\?|$)/.test(process.env.DATABASE_URL || '')) {
    throw new Error('Isolated CI PostgreSQL wfm_ci required');
  }
  const a = new PrismaClient(), b = new PrismaClient();
  const id = 'phase5e2ai-request-' + Date.now();
  const requestA = 'request-A-' + id, requestB = 'request-B-' + id;
  const secret = 'synthetic-high-entropy-credential-' + id;
  const fingerprint = createHash('sha256').update(secret).digest('hex');
  const governance = new IntegrationWorkerGovernanceService(a as any);
  const mutation = new IntegrationGovernedWorkerMutationService(b as any);
  const proposal = syntheticGovernanceSession('ci_proposer_' + id, 'ci-proposal-session-123456');
  const approval = syntheticGovernanceSession('ci_reviewer_' + id, 'ci-reviewer-session-123456');
  try {
    await a.integrationFleetControl.upsert({
      where: { id: 'GLOBAL' },
      create: { id: 'GLOBAL', enabled: false, generation: 0n },
      update: { enabled: false },
    });
    check('request A proposed', await governance.recordAuthenticated(id, 'ENROLL', 'PROPOSE',
      proposal, CI_GOVERNANCE_KEY, CI_NOW, fingerprint, requestA));
    check('request B cannot borrow request A proposal',
      !(await governance.recordAuthenticated(id, 'ENROLL', 'APPROVE',
        approval, CI_GOVERNANCE_KEY, CI_NOW, fingerprint, requestB)));
    check('request A independently approved', await governance.recordAuthenticated(id, 'ENROLL',
      'APPROVE', approval, CI_GOVERNANCE_KEY, CI_NOW, fingerprint, requestA));
    check('request B cannot borrow request A approval',
      !(await mutation.applyAuthenticated(id, 'ENROLL', approval, CI_GOVERNANCE_KEY,
        CI_NOW, secret, requestB)));
    check('wrong credential cannot borrow request A approval',
      !(await mutation.applyAuthenticated(id, 'ENROLL', approval, CI_GOVERNANCE_KEY,
        CI_NOW, secret + '-altered', requestA)));
    check('exact request and credential can enroll', await mutation.applyAuthenticated(
      id, 'ENROLL', approval, CI_GOVERNANCE_KEY, CI_NOW, secret, requestA));
    check('approval cannot be reused', !(await mutation.applyAuthenticated(
      id, 'ENROLL', approval, CI_GOVERNANCE_KEY, CI_NOW, secret, requestA)));
    const consumed = await b.integrationWorkerGovernanceConsumption.count({
      where: { workerId: id, operation: 'ENROLL' },
    });
    check('exactly one approval consumed', consumed === 1);
    const report = await new IntegrationLegacyCredentialInventoryService(a as any).assess();
    check('inventory returns aggregate-only fail-closed report',
      !!report && report.migrationAuthorized === false &&
      report.externallyQuiescent === false && report.total >= 0 &&
      !('instanceToken' in report));
    console.log('Phase 5E.2AI request correlation and read-only inventory E2E passed.');
  } finally { await Promise.all([a.$disconnect(), b.$disconnect()]); }
}
main().catch(e => { console.error(e); process.exit(1); });
