import { strict as assert } from 'assert';
import { generateKeyPairSync } from 'crypto';
import { inspectProductionIssuerConfig } from './integration-production-issuer-readiness';

const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
assert.equal(inspectProductionIssuerConfig(null).productionReady, false);
assert.equal(inspectProductionIssuerConfig({
  issuer: 'http://issuer.example.com', audience: 'worker-governance',
  keyId: 'key_1', publicKeyPem: pem,
}).validPinnedIssuer, false);
const candidate = inspectProductionIssuerConfig({
  issuer: 'https://identity.example.com', audience: 'worker-governance',
  keyId: 'key_1', publicKeyPem: pem,
});
assert.equal(candidate.validPinnedIssuer, true);
assert.equal(candidate.controllerIdentityBound, false);
assert.equal(candidate.revocationIntegrated, false);
assert.equal(candidate.productionReady, false);
console.log('Phase 5E.2AN issuer configuration preflight fails closed.');
