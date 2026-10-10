import { createHash, timingSafeEqual } from 'crypto';

/**
 * Phase 5E.2AQ: transport boundary admission contract.
 * No HTTP transport, provider endpoint, credentials or production enablement.
 */
export type GatewayTransportDecision =
  | 'VALID' | 'INVALID_REQUEST' | 'STALE_GENERATION'
  | 'UNTRUSTED_DESTINATION' | 'UNTRUSTED_CALLER' | 'STOPPED';

export interface GatewayTransportRequest {
  requestId: string;
  generation: bigint;
  destinationId: string;
  payloadDigest: string;
  callerFingerprint: string;
}

export interface GatewayTransportPolicy {
  readonly stopped: boolean;
  readonly generation: bigint;
  readonly allowedDestinationIds: readonly string[];
  readonly trustedCallerFingerprints: readonly string[];
}

const isHexDigest = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{16,100}$/.test(value);
const isDestinationId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{3,80}$/.test(value);

/**
 * IDs only, not URLs: a worker cannot supply arbitrary hostnames, ports,
 * redirects or credentials. A future isolated gateway must map destinationId
 * to an operator-pinned endpoint in its own protected configuration.
 */
export function assessGatewayTransportRequest(
  request: GatewayTransportRequest, policy: GatewayTransportPolicy,
): GatewayTransportDecision {
  // TypeScript types do not validate decoded input or deployment configuration.
  // Reject incomplete policy rather than interpreting missing STOP as permission.
  if (!request || !policy ||
      typeof policy.stopped !== 'boolean' ||
      typeof policy.generation !== 'bigint' || policy.generation < 0n ||
      !Array.isArray(policy.allowedDestinationIds) ||
      !policy.allowedDestinationIds.every(isDestinationId) ||
      !Array.isArray(policy.trustedCallerFingerprints) ||
      !policy.trustedCallerFingerprints.every(isHexDigest) ||
      !isId(request.requestId) ||
      typeof request.generation !== 'bigint' || request.generation < 0n ||
      !isDestinationId(request.destinationId) ||
      !isHexDigest(request.payloadDigest) ||
      !isHexDigest(request.callerFingerprint)) return 'INVALID_REQUEST';
  if (policy.stopped) return 'STOPPED';
  if (request.generation !== policy.generation) return 'STALE_GENERATION';
  if (!policy.allowedDestinationIds.includes(request.destinationId))
    return 'UNTRUSTED_DESTINATION';
  const candidate = Buffer.from(request.callerFingerprint, 'hex');
  const trusted = policy.trustedCallerFingerprints.some(fingerprint =>
    isHexDigest(fingerprint) &&
    timingSafeEqual(candidate, Buffer.from(fingerprint, 'hex')));
  if (!trusted) return 'UNTRUSTED_CALLER';
  return 'VALID';
}

export function syntheticPayloadDigest(payload: string): string {
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/** Live egress remains permanently disabled in this phase. */
export const PHASE5E2AQ_LIVE_PROVIDER_EGRESS_ENABLED = false as const;
