import { createHash } from 'crypto';

/**
 * Stable synthetic attempt key. This is an application-side correlation key,
 * NOT evidence that a provider honors idempotency.
 */
export function deriveProviderAttemptKey(jobId: string, claimToken: string, targetSystem: string): string {
  const job = String(jobId || '').trim();
  const claim = String(claimToken || '').trim();
  const target = String(targetSystem || '').trim().toUpperCase();
  if (!job || !claim || !target) throw new Error('Attempt identity requires job, claim and target');
  return 'wfm-attempt-' + createHash('sha256')
    .update(JSON.stringify([job, claim, target]), 'utf8')
    .digest('hex');
}

export type ProviderIdempotencyEvidence = Readonly<{
  provider: string;
  supportsIdempotency: boolean;
  supportsStatusLookup: boolean;
  idempotencyRetentionSeconds: number | null;
  validatedInSandbox: boolean;
}>;

export function providerIsSafeForAutomatedReconciliation(evidence: ProviderIdempotencyEvidence): boolean {
  return evidence.validatedInSandbox === true &&
    evidence.supportsIdempotency === true &&
    evidence.supportsStatusLookup === true &&
    Number.isInteger(evidence.idempotencyRetentionSeconds) &&
    (evidence.idempotencyRetentionSeconds ?? 0) > 0;
}
