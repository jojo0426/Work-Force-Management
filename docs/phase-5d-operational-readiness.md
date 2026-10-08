# Phase 5D — Integration Operational Readiness

**Status:** IN PROGRESS — planning and readiness contract only. No production deployment or external provider activation is authorized by this document.

**Baseline:** Phase 5C merged in PR #2 at `2c9607f4e297a9c6de4cf3d8fe2b842baf090e12`; post-merge WFM Baseline Validation #289 succeeded. Preserve Phase 5C fail-closed behavior, durable idempotency, terminal failure handling, controlled retries, and database E2E coverage.

## Objective

Prepare the FiberBlaze WFM integration layer for safe, observable, reversible provider connectivity in a controlled environment. Passing CI is necessary but not proof of a live provider's readiness.

## Work packages and acceptance criteria

### 5D.1 — Configuration and secrets preflight
- Inventory integration flags, required secrets, endpoints, timeouts, retry limits, and environment-specific defaults.
- Validate configuration at startup with safe error messages; never log credentials or provider tokens.
- Missing or invalid configuration must keep external execution disabled.
- Test default-disabled and misconfigured startup paths.

### 5D.2 — Provider connectivity and contract verification
- Define an explicit provider-specific sandbox contract: authentication, request/response schema, timeout, error classification, and idempotency support.
- Use a mock or sandbox provider first; no production calls in CI.
- Test network outage, authentication rejection, malformed response, timeout, rate limiting, and duplicate requests.
- Confirm provider-specific requirements before any real activation.

### 5D.3 — Operational observability
- Establish correlation IDs, structured event logs, and safe metrics for queue depth, age, attempts, latency, success, transient errors, terminal errors, and retries exhausted.
- Ensure logs and operator views exclude secrets and unnecessary subscriber personal data.
- Define alert thresholds and an operator runbook for stuck claims, backlog growth, and provider outages.

### 5D.4 — Recovery and controlled activation
- Document feature-flagged activation, rollback, retry pause/resume, and a kill switch.
- Exercise crash recovery, stale claims, retry exhaustion, duplicate delivery, and concurrent worker handling.
- Require human approval before sandbox-to-production promotion.
- Prohibit blind replay of terminal failures or non-idempotent external operations.

### 5D.5 — Release and acceptance gate
- Add deterministic selftests and database E2E for the operational controls, preserving all existing Phase 5C and baseline tests.
- Validate backend security/build, web auth/build, mobile TypeScript, and production dependency audit in CI.
- Record environment-specific sandbox evidence and an operator sign-off separately from CI.
- No merge to `main` until green checks and explicit approval; no production enablement based on merge alone.

## Current evidence and limits

- Verified: Phase 5C PR #2 merged, and post-merge baseline CI #289 passed.
- Not yet verified: live provider credentials, sandbox endpoints, production monitoring/alert delivery, runbook drill, deployment rollback, mobile device behavior, and provider-specific operational acceptance.
- The mobile dependency audit remains non-blocking in the baseline workflow and must not be represented as clean.

## Execution order

1. Inventory the existing integration implementation, config and environment contracts.
2. Implement fail-closed configuration preflight and tests.
3. Add mock/sandbox connectivity contract and fault-injection tests.
4. Add safe observability, alerts and operational recovery runbook.
5. Execute isolated operational E2E and CI, then request review before merge or any provider activation.
