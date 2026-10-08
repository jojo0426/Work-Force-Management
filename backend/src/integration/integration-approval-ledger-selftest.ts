import { IntegrationApprovalLedgerService } from './integration-approval-ledger.service';

function check(name: string, ok: boolean): void {
  if (!ok) throw new Error('FAIL: ' + name);
  console.log('PASS: ' + name);
}
async function main(): Promise<void> {
  const events: Array<{ action: string; actorUserId: string }> = [];
  const db: any = {
    $transaction: async (fn: (tx: any) => Promise<boolean>) => fn(db),
    user: {
      findUnique: async ({ where }: any) => ({
        id: where.id, role: where.id === 'operator-1' ? 'SUPERVISOR' : 'ADMINISTRATOR',
        isActive: true,
      }),
    },
    integrationProviderEvidence: {
      findUnique: async () => ({
        validated: true, admissionId: 'admission-1',
        operatorId: 'operator-1', reviewerId: 'reviewer-2',
      }),
    },
    integrationApprovalEvent: {
      findFirst: async () => events.find(event =>
        event.action === 'PROPOSE' && event.actorUserId === 'operator-1') || null,
      create: async ({ data }: any) => { events.push(data); },
    },
  };
  const svc = new IntegrationApprovalLedgerService(db);
  const operator = { userId: 'operator-1', role: 'SUPERVISOR' as const,
    sessionId: 'operator-session-token-123456' };
  const reviewer = { userId: 'reviewer-2', role: 'ADMINISTRATOR' as const,
    sessionId: 'reviewer-session-token-123456' };
  check('review before proposal denied',
    !(await svc.record(reviewer, 'admission-1', 'evidence-1', 'APPROVE')));
  check('operator proposal accepted',
    await svc.record(operator, 'admission-1', 'evidence-1', 'PROPOSE'));
  check('operator cannot self-approve',
    !(await svc.record(operator, 'admission-1', 'evidence-1', 'APPROVE')));
  check('independent reviewer approval accepted',
    await svc.record(reviewer, 'admission-1', 'evidence-1', 'APPROVE'));
  check('two distinct approval events', events.length === 2);
  console.log('Phase 5E.2S approval ledger selftest passed (mock-only).');
}
main().catch(error => { console.error(error); process.exit(1); });
