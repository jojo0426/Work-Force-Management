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
    const after = await control.reserveAdmission(claim!.id, claim!.claimToken!);
    check('post-stop admission is blocked', !after.admitted);
    const row = await db.integrationFleetControl.findUnique({ where: { id: 'GLOBAL' } });
    check('stop persisted disabled and advanced generation', row?.enabled === false && row.generation === 1n);
    const admissions = await db.integrationAdmission.findMany({ where: { jobId: claim!.id } });
    check('no admission can have stopped generation', admissions.every(x => x.generation === 0n));
    check('at most one synthetic admission', admissions.length <= 1);
    console.log('PASS: database reservation/stop ordering only. Provider request-start fencing NOT proven.');
  } finally {
    await db.integrationAdmission.deleteMany({ where: { jobId: job.job.id } });
    await db.integrationJob.deleteMany({ where: { sourceSystem: tag } });
    await db.integrationFleetControl.deleteMany({ where: { id: 'GLOBAL' } });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await db.$disconnect(); });
