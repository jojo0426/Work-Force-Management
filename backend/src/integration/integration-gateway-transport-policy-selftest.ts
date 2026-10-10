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
assert.equal(assessGatewayTransportRequest({ ...request, destinationId: 'untrusted-provider' }, policy),
  'UNTRUSTED_DESTINATION');
for (const destinationId of ['evil.example', 'https://evil.example', 'localhost:8080',
  '../synthetic-provider', '', 'ab', 'a'.repeat(81)]) {
  assert.equal(assessGatewayTransportRequest({ ...request, destinationId }, policy),
    'INVALID_REQUEST', `Malformed destination must be rejected: ${destinationId}`);
}
assert.equal(assessGatewayTransportRequest({ ...request, callerFingerprint: 'b'.repeat(64) }, policy),
  'UNTRUSTED_CALLER');
assert.equal(assessGatewayTransportRequest({ ...request, requestId: 'short' }, policy),
  'INVALID_REQUEST');
assert.equal(assessGatewayTransportRequest({ ...request, payloadDigest: 'bad' }, policy),
  'INVALID_REQUEST');
assert.equal(PHASE5E2AQ_LIVE_PROVIDER_EGRESS_ENABLED, false);
// Deliberate type bypass models malformed runtime input/configuration.
for (const patch of [
  { stopped: undefined }, { stopped: 'false' }, { stopped: 0 },
  { generation: '5' }, { generation: -1n },
  { allowedDestinationIds: undefined }, { allowedDestinationIds: 'synthetic-provider' },
  { allowedDestinationIds: [null] }, { allowedDestinationIds: ['https://evil.example'] },
  { trustedCallerFingerprints: undefined }, { trustedCallerFingerprints: trusted },
  { trustedCallerFingerprints: [trusted, 'bad'] },
]) {
  assert.equal(assessGatewayTransportRequest(request, { ...policy, ...patch } as any),
    'INVALID_REQUEST');
}
for (const patch of [
  { requestId: 1234567890123456 }, { generation: '5' }, { generation: -1n },
  { destinationId: 123 }, { payloadDigest: null }, { callerFingerprint: null },
  { callerFingerprint: 'A'.repeat(64) },
]) {
  assert.equal(assessGatewayTransportRequest({ ...request, ...patch } as any, policy),
    'INVALID_REQUEST');
}
assert.equal(assessGatewayTransportRequest(request, { ...policy, allowedDestinationIds: [] }),
  'UNTRUSTED_DESTINATION');
assert.equal(assessGatewayTransportRequest(request, { ...policy, trustedCallerFingerprints: [] }),
  'UNTRUSTED_CALLER');
assert.equal(assessGatewayTransportRequest(null as any, policy), 'INVALID_REQUEST');
assert.equal(assessGatewayTransportRequest(request, null as any), 'INVALID_REQUEST');
assert.equal(assessGatewayTransportRequest({ ...request, generation: 4n },
  { ...policy, stopped: true }), 'STOPPED');
console.log('PASS: synthetic gateway transport policy denies STOP, stale epochs, untrusted callers/destinations');
console.log('PASS: malformed runtime policy and requests fail closed; empty trust lists deny admission');
console.log('PASS: no live provider egress available');
