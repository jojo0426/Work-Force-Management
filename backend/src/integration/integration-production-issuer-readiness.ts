import { createPublicKey } from 'crypto';
import type { TrustedIssuerConfig } from './integration-trusted-governance-issuer';

export type ProductionIssuerReadiness = Readonly<{
  validPinnedIssuer: boolean;
  controllerIdentityBound: false;
  revocationIntegrated: false;
  keyRotationIntegrated: false;
  productionReady: false;
}>;

/**
 * Static configuration preflight only. Cannot attest real issuer provenance.
 * Never enables live governance or provider dispatch.
 */
export function inspectProductionIssuerConfig(
  config: TrustedIssuerConfig | null,
): ProductionIssuerReadiness {
  let validPinnedIssuer = false;
  if (config) {
    try {
      const parsed = new URL(config.issuer);
      const key = createPublicKey(config.publicKeyPem);
      validPinnedIssuer = parsed.protocol === 'https:' &&
        parsed.hostname !== 'localhost' &&
        !parsed.hostname.endsWith('.invalid') &&
        config.audience.length >= 8 && config.audience.length <= 128 &&
        /^[A-Za-z0-9_-]{1,80}$/.test(config.keyId) &&
        key.asymmetricKeyType === 'rsa' &&
        (key.asymmetricKeyDetails?.modulusLength || 0) >= 2048;
    } catch { validPinnedIssuer = false; }
  }
  return { validPinnedIssuer, controllerIdentityBound: false,
    revocationIntegrated: false, keyRotationIntegrated: false,
    productionReady: false };
}
