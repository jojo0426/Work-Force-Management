import { createHash, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ProviderReceipt, verifyMockProviderReceipt } from './provider-receipt-authenticity';

export type MockSigningKeyCandidate = Readonly<{ id: string; secret: string }>;
/**
 * A trusted caller supplies key material from a secret manager; the database
 * stores fingerprints and validity windows, never plaintext signing secrets.
 */
@Injectable()
export class IntegrationMockKeyVerifierService {
  constructor(private readonly prisma: PrismaService) {}

  async verify(
    receipt: ProviderReceipt,
    signatureHex: string,
    key: MockSigningKeyCandidate,
    nowSeconds: number,
  ): Promise<boolean> {
    if (!key?.id || !key.secret || key.secret.length < 32 ||
        !Number.isSafeInteger(nowSeconds)) return false;
    try {
      const metadata = await this.prisma.integrationMockSigningKey.findUnique({
        where: { id: key.id },
      });
      if (!metadata || metadata.revokedAt ||
          nowSeconds * 1000 < metadata.validFrom.getTime() ||
          nowSeconds * 1000 >= metadata.validUntil.getTime()) return false;
      const expected = Buffer.from(metadata.fingerprint, 'hex');
      const actual = createHash('sha256').update(key.secret).digest();
      if (expected.length !== 32 || !timingSafeEqual(expected, actual)) return false;
      return verifyMockProviderReceipt(receipt, signatureHex, key.secret, nowSeconds);
    } catch {
      return false;
    }
  }
}
