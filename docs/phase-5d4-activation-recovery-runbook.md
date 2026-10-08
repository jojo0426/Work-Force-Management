# Phase 5D.4 — Controlled Activation, Emergency Stop and Recovery Runbook

**Status:** readiness drill only. This document does not authorize live activation.

## Preconditions
1. Obtain written approval for the exact environment, provider, endpoint, target allowlist, owner, and rollback window.
2. Confirm sandbox credentials, provider idempotency guarantees, audit evidence, and CI/database E2E results. No production credentials in CI.
3. Keep `INTEGRATION_EXECUTION_ENABLED=false` and `INTEGRATION_ALLOWED_TARGETS=` in the baseline environment.
4. Before any future sandbox enablement, confirm provider adapter uses stable durable job IDs as idempotency keys and honors abort signals.

## Activation (future approved sandbox only)
1. Pause worker scheduling and drain/inspect in-flight jobs.
2. Back up configuration; apply a minimal target allowlist for the approved sandbox only.
3. Set `INTEGRATION_EXECUTION_ENABLED=true` in the **approved sandbox** deployment configuration and restart under change control.
4. Execute one synthetic, non-subscriber job; inspect outcome counts, retries, queue age, and provider-side idempotency.
5. Expand only with explicit approval. CI success alone is not an activation decision.

## Emergency stop / rollback
1. Immediately disable new scheduling and set `INTEGRATION_EXECUTION_ENABLED=false` in deployment configuration; remove target allowlist and restart/roll out all replicas.
2. For immediate **per-process** stop, call `IntegrationPolicyService.emergencyStop()` from an authorized internal operator mechanism. No public kill-switch endpoint exists. The stop cannot be reversed in the same process.
3. The in-process stop does **not** propagate across replicas and cannot cancel already committed provider operations. A timed-out non-cooperative adapter may continue; investigate provider-side completion before replay.
4. Verify blocked execution on every replica, provider traffic stopped, and no new external side effects. Escalate if any worker remains active.
5. Preserve queue and claim evidence. Do not blindly replay terminal failures or non-idempotent operations.

## Recovery
1. Reconcile provider-side operations using stable job identity before retrying ambiguous timed-out attempts.
2. Inspect stale claims, retry exhaustion, duplicate delivery, and concurrent worker ownership; use existing DB E2E tests and claim-token protections.
3. Restore only the approved environment after root cause review, operator sign-off, and new change approval.
4. Confirm alert thresholds and backlog return to normal; document observed results and timestamps.

## Known gaps
- No remote multi-replica kill switch, scheduler pause API, or operator dashboard is implemented in this checkpoint.
- Metrics are in-memory process counters, not durable distributed telemetry or delivered alerts.
- Real sandbox connectivity, provider-specific idempotency guarantees, and rollback drill evidence remain unverified.
- This runbook is not proof of production readiness.
