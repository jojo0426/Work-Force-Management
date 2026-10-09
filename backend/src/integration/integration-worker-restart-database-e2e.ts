import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { IntegrationTrustedWorkerService } from './integration-trusted-worker.service';
import { IntegrationFleetControlService } from './integration-fleet-control.service';

function check(label: string, ok: boolean): void {
  if (!ok) throw new Error('FAIL: ' + label);
  console.log('PASS: ' + label);
}
async function main(): Promise<void> {
  if (process.env.GITHUB_ACTIONS !== 'true' ||
      !/\/wfm_ci(?:\?|$)/.test(process.env.DATABASE_URL || '')) {
    throw new Error('Isolated CI PostgreSQL wfm_ci required');
  }
  const datasourceUrl = process.env.DATABASE_URL!;
  const a = new PrismaClient({ datasources: { db: { url: datasourceUrl } } });
  const b = new PrismaClient({ datasources: { db: { url: datasourceUrl } } });
  const id = 'phase5e2ag-' + Date.now();
  const secret = 'synthetic-high-entropy-placeholder-' + id;
  const first = new IntegrationTrustedWorkerService(a as any);
  const second = new IntegrationTrustedWorkerService(b as any);
  try {
    const control = await a.integrationFleetControl.upsert({
      where: { id: 'GLOBAL' },
      create: { id: 'GLOBAL', enabled: true, generation: 0n },
      update: { enabled: true },
    });
    check('legacy enrollment locked out', !(await first.enroll(id, secret, 'ci_controller')));
    await a.integrationExpectedWorker.create({ data: { workerId: id,
      credentialHash: createHash('sha256').update(secret).digest('hex'), approvedBy: 'ci_fixture' } });
    const competing = await Promise.all([
      first.register(id, secret, control.generation),
      second.register(id, secret, control.generation),
    ]);
    check('concurrent registration exactly one winner',
      competing.filter(Boolean).length === 1);
    const persisted = await b.integrationWorkerMembership.findUnique({ where: { workerId: id } });
    check('credential stored only as fingerprint', persisted?.instanceToken.length === 64 &&
      persisted.instanceToken !== secret);
    check('restarted worker cannot reuse identity automatically',
      !(await second.register(id, secret, control.generation)));
    check('credential forgery rejected after restart',
      !(await second.acknowledgeStop(id, secret + '-forged', control.generation + 1n)));
    check('retirement denied while fleet enabled',
      !(await first.retire(id, 'ci_controller')));
    const stop = await new IntegrationFleetControlService(b as any)
      .stopFleet('ci_operator', 'SYNTHETIC_STOP');
    check('stop acknowledged', stop.stopped && stop.generation !== null);
    check('stale acknowledgment rejected',
      !(await second.acknowledgeStop(id, secret, control.generation)));
    const ack = await first.acknowledgeStop(id, secret, stop.generation!);
    check('stop acknowledgment durable after simulated process restart', ack);
    const newProcess = new IntegrationTrustedWorkerService(b as any);
    check('new process cannot overwrite existing membership',
      !(await newProcess.register(id, secret, stop.generation!)));
    const storedAck = await b.integrationWorkerMembership.findUnique({ where: { workerId: id } });
    check('acknowledgment survives independent connection',
      storedAck?.stopAckGeneration === stop.generation);
    check('external provider quiescence never inferred',
      (await newProcess.inspect()).externallyQuiescent === false);
    console.log('Phase 5E.2AG two-connection restart and identity race E2E passed.');
  } finally {
    await Promise.all([a.$disconnect(), b.$disconnect()]);
  }
}
main().catch(error => { console.error(error); process.exit(1); });
