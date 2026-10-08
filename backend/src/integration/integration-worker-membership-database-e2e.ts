import { PrismaClient } from '@prisma/client';
import { IntegrationWorkerMembershipService } from './integration-worker-membership.service';

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
  const id = 'phase5e2ae-legacy-' + Date.now();
  const token = 'synthetic-legacy-token-' + id;
  try {
    const control = await a.integrationFleetControl.upsert({
      where: { id: 'GLOBAL' },
      create: { id: 'GLOBAL', enabled: false, generation: 0n },
      update: { enabled: false },
    });
    const legacyA = new IntegrationWorkerMembershipService(a as any);
    const legacyB = new IntegrationWorkerMembershipService(b as any);
    check('legacy registration denied on first connection',
      !(await legacyA.register(id, token, control.generation)));
    check('legacy registration denied on second connection',
      !(await legacyB.register(id, token, control.generation)));
    check('legacy stop acknowledgment denied',
      !(await legacyA.acknowledgeStop(id, token, control.generation)));
    const stored = await b.integrationWorkerMembership.findUnique({ where: { workerId: id } });
    check('legacy paths cannot create persisted credentials', stored === null);
    const invalid = await legacyB.inspectStoppedFleet([]);
    check('empty roster rejected', invalid.reason === 'INVALID_ROSTER');
    check('external quiescence never claimed', invalid.externallyQuiescent === false);
    console.log('Phase 5E.2AE legacy membership lockout PostgreSQL E2E passed.');
  } finally {
    await Promise.all([a.$disconnect(), b.$disconnect()]);
  }
}
main().catch(error => { console.error(error); process.exit(1); });
