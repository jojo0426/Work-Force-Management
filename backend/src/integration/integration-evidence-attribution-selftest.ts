import { IntegrationEvidenceAttributionService } from './integration-evidence-attribution.service';

function check(label: string, ok: boolean): void {
  if (!ok) throw new Error('FAIL: ' + label);
  console.log('PASS: ' + label);
}
async function main(): Promise<void> {
  const events: any[] = [];
  let active = true;
  const db: any = {
    $transaction: async (fn: (tx: any) => Promise<boolean>) => fn(db),
    user: { findUnique: async ({ where }: any) => ({
      id: where.id, role: where.id === 'operator' ? 'SUPERVISOR' : 'ADMINISTRATOR',
      isActive: active,
    }) },
    integrationProviderEvidence: { findUnique: async () => ({
      id: 'evidence-1', admissionId: 'admission-1', provider: 'MOCK', validated: false,
    }) },
    integrationFleetControl: { findUnique: async () => ({ enabled: false }) },
    integrationAdmission: { findUnique: async () => ({ status: 'UNCERTAIN' }) },
    integrationEvidenceAttribution: {
      findFirst: async () => events.find(x => x.action === 'ATTEST') || null,
      create: async ({ data }: any) => { events.push(data); },
    },
  };
  const svc = new IntegrationEvidenceAttributionService(db);
  const operator = { userId: 'operator', role: 'SUPERVISOR' as const,
    sessionHash: 'a'.repeat(64) };
  const reviewer = { userId: 'reviewer', role: 'ADMINISTRATOR' as const,
    sessionHash: 'b'.repeat(64) };
  check('review before attestation denied',
    !(await svc.record(reviewer, 'evidence-1', 'REVIEW')));
  check('attestation recorded',
    await svc.record(operator, 'evidence-1', 'ATTEST'));
  check('same actor cannot review',
    !(await svc.record(operator, 'evidence-1', 'REVIEW')));
  active = false;
  check('inactive reviewer denied',
    !(await svc.record(reviewer, 'evidence-1', 'REVIEW')));
  active = true;
  check('independent reviewer recorded',
    await svc.record(reviewer, 'evidence-1', 'REVIEW'));
  check('two independently attributed records', events.length === 2);
  console.log('Phase 5E.2X attribution selftest passed.');
}
main().catch(error => { console.error(error); process.exit(1); });
