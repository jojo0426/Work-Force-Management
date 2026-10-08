import { createHmac, timingSafeEqual } from 'crypto';

export type ProviderReceipt = Readonly<{
  provider: string;
  requestId: string;
  outcome: 'CONFIRMED_APPLIED' | 'CONFIRMED_NOT_APPLIED';
  issuedAt: number;
}>;

/**
 * Mock-only authenticity contract. Real providers require a separately
 * approved canonical payload, key rotation and replay prevention.
 */
export function verifyMockProviderReceipt(
  receipt: ProviderReceipt,
  signatureHex: string,
  secret: string,
  nowSeconds: number,
): boolean {
  if (receipt.provider !== 'MOCK' || !receipt.requestId ||
      !['CONFIRMED_APPLIED', 'CONFIRMED_NOT_APPLIED'].includes(receipt.outcome) ||
      !Number.isSafeInteger(receipt.issuedAt) ||
      Math.abs(nowSeconds - receipt.issuedAt) > 300 ||
      !secret || secret.length < 32 || !/^[a-f0-9]{64}$/i.test(signatureHex)) return false;
  const canonical = JSON.stringify([
    receipt.provider, receipt.requestId, receipt.outcome, receipt.issuedAt,
  ]);
  const expected = createHmac('sha256', secret).update(canonical).digest();
  return timingSafeEqual(expected, Buffer.from(signatureHex, 'hex'));
}
