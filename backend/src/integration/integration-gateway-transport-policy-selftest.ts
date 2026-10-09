import { strict as assert } from 'assert';
import { assessGatewayTransportRequest, PHASE5E2AQ_LIVE_PROVIDER_EGRESS_ENABLED,
  syntheticPayloadDigest } from './integration-gateway-transport-policy';

const trusted = 'a'.repeat(64);
const payloadDigest = syntheticPayloadDigest('synthetic payload');
const request = {
  requestId: 'phase5e2aq-request-one', generation: 5n,
  destinationId: 'synthetic-provider', payloadDigest,
  callerFingerprint: trusted,
};
const policy = {
  stopped: false, generation: 5n,
  allowedDestinationIds: ['synthetic-provider'],
  trustedCallerFingerprints: [trusted],
};
assert.equal(assessGatewayTransportRequest(request, policy), 'VALID');
assert.equal(assessGatewayTransportRequest(request, { ...policy, stopped: true }), 'STOPPED');
assert.equal(assessGatewayTransportRequest({ ...request, generation: 4n }, policy), 'STALE_GENERATION');
assert.equal(assessGatewayTransportRequest({ ...request, destinationId: 'evil.example' }, policy),
  'UNTRUSTED_DESTINATION');
assert.equal(assessGatewayTransportRequest({ ...request, callerFingerprint: 'b'.repeat(64) }, policy),
  'UNTRUSTED_CALLER');
assert.equal(assessGatewayTransportRequest({ ...request, requestId: 'short' }, policy),
  'INVALID_REQUEST');
assert.equal(assessGatewayTransportRequest({ ...request, payloadDigest: 'bad' }, policy),
  'INVALID_REQUEST');
assert.equal(PHASE5E2AQ_LIVE_PROVIDER_EGRESS_ENABLED, false);
console.log('PASS: synthetic gateway transport policy denies STOP, stale epochs, untrusted callers/destinations');
console.log('PASS: no live provider egress available');
