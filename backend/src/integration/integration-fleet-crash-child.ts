import { PrismaClient } from '@prisma/client';
import { IntegrationFleetControlService } from './integration-fleet-control.service';

// CI-only synthetic child process; never invokes any external adapter.
if (process.env.GITHUB_ACTIONS !== 'true' || !/\/wfm_ci(?:\?|$)/.test(process.env.DATABASE_URL || '')) {
  throw new Error('Isolated CI database required');
}
const [jobId, claimToken] = process.argv.slice(2);
if (!jobId || !claimToken) throw new Error('Synthetic job and claim token required');
const db = new PrismaClient();
const fleet = new IntegrationFleetControlService(db as any);
fleet.withFencedDispatch(jobId, claimToken, async () => {
  process.stdout.write('SYNTHETIC_CALLBACK_STARTED\n');
  await new Promise<void>(() => { /* parent terminates process */ });
}).then(() => process.exit(0)).catch(error => {
  console.error(error);
  process.exit(1);
});
