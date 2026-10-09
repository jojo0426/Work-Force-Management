import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { IntegrationTrustedWorkerService } from './integration-trusted-worker.service';
import { IntegrationFleetControlService } from './integration-fleet-control.service';

function check(name: string, condition: boolean): void {
  if (!condition) throw new Error('FAIL: ' + name);
  console.log('PASS: ' + name);
}
async function main(): Promise<void> {
  if (process.env.GITHUB_ACTIONS !== 'true' ||
      !/\/wfm_ci(?:\?|$)/.test(process.env.DATABASE_URL || '')) {
    throw new Error('Isolated CI PostgreSQL wfm_ci required');
  }
  const a = new PrismaClient();
  const b = new PrismaClient();
  const workerId = 'phase5e2af-' + Date.now();
  const secondId = workerId + '-second';
  const secret = 'synthetic-secret-' + workerId + '-credential';
  const trustedA = new IntegrationTrustedWorkerService(a as any);
  const trustedB = new IntegrationTrustedWorkerService(b as any);
  try {
    const fleet = await a.integrationFleetControl.upsert({
      where: { id: 'GLOBAL' },
      create: { id: 'GLOBAL', enabled: true, generation: 0n },
      update: { enabled: true },
    });
    check('legacy enrollment locked out', !(await trustedA.enroll(workerId, secret, 'ci_controller')));
    await a.integrationExpectedWorker.create({ data: { workerId,
      credentialHash: createHash('sha256').update(secret).digest('hex'), approvedBy: 'ci_fixture' } });
    await a.integrationExpectedWorker.create({ data: { workerId: secondId,
      credentialHash: createHash('sha256').update(secret + '-2').digest('hex'), approvedBy: 'ci_fixture' } });
    check('unapproved identity cannot register',
      !(await trustedB.register(workerId + '-rogue', secret, fleet.generation)));
    check('wrong credential rejected',
      !(await trustedB.register(workerId, secret + '-forged', fleet.generation)));
    check('approved worker registered', await trustedA.register(workerId, secret, fleet.generation));
    const stored = await b.integrationWorkerMembership.findUnique({ where: { workerId } });
    check('no raw credential persisted in membership', stored?.instanceToken !== secret &&
      stored?.instanceToken.length === 64);
    check('duplicate and restart takeover rejected',
      !(await trustedB.register(workerId, secret, fleet.generation)));
    const stop = await new IntegrationFleetControlService(b as any)
      .stopFleet('ci_operator', 'SYNTHETIC_STOP');
    check('stop acknowledged', stop.stopped && stop.generation !== null);
    check('stale generation acknowledgment rejected',
      !(await trustedA.acknowledgeStop(workerId, secret, fleet.generation)));
    check('forged acknowledgment rejected',
      !(await trustedA.acknowledgeStop(workerId, secret + '-forged', stop.generation!)));
    check('trusted worker acknowledged',
      await trustedA.acknowledgeStop(workerId, secret, stop.generation!));
    check('duplicate acknowledgment rejected',
      !(await trustedB.acknowledgeStop(workerId, secret, stop.generation!)));
    const inspection = await trustedB.inspect();
    check('DB-derived roster includes missing second worker',
      inspection.admissionsClosed && !inspection.allAcknowledged &&
      inspection.reason === 'WORKERS_UNCONFIRMED');
    check('no external quiescence claim', !inspection.externallyQuiescent);
    const restarted = new IntegrationTrustedWorkerService(b as any);
    check('new service instance cannot seize registered identity',
      !(await restarted.register(workerId, secret, stop.generation!)));
    check('legacy retirement locked out', !(await trustedB.retire(secondId, 'ci_controller')));
    check('no external quiescence claim', (await trustedA.inspect()).externallyQuiescent === false);
    console.log('Phase 5E.2AF trusted membership PostgreSQL E2E passed.');
  } finally {
    await Promise.all([a.$disconnect(), b.$disconnect()]);
  }
}
main().catch(error => { console.error(error); process.exit(1); });
