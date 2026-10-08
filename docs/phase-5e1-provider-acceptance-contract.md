# Phase 5E.1 — Provider Acceptance Contract

**Status:** mock contract implemented; CI verification pending. **No real provider has been identified or approved.**

## Synthetic contract (not a real provider API)
| Field | Mock-only value |
|---|---|
| Provider identity | `FIBERBLAZE_MOCK` |
| Target | `SANDBOX` |
| Endpoint | In-memory adapter, **no URL or network call** |
| Authentication | Synthetic-token contract placeholder; no credentials stored or validated |
| Request | Synthetic `{ action: "PING" }` with stable `jobId` |
| Success | `SUCCESS` |
| Transient errors | `RATE_LIMIT`, `UNAVAILABLE` |
| Permanent errors | `UNAUTHORIZED`, `INVALID_REQUEST` |
| Idempotency | `jobId` forwarded unchanged; **provider-side deduplication not proven** |
| Safety | Default execution disabled; explicit allowlist required; emergency stop blocks invocation |

The mock adapter returns deterministic outcomes without outbound traffic. It does not prove real authentication, HTTP schema, retries, rate limits, or deduplication.

## Required provider onboarding inputs
- Legal provider name, sandbox base URL, technical contact and environment owner.
- Authentication mechanism, scopes, token rotation and secure storage (never commit credentials).
- API request/response schema, stable idempotency-key header and duplicate-delivery semantics.
- Rate limits, retry-after behavior, timeout/cancellation support, status/error mapping.
- Data minimization, subscriber privacy review, redacted request/response evidence.
- Written approval before any real sandbox calls; separate authorization before production.

## Acceptance criteria
1. CI passes `npm run test:phase5e-provider` and existing Phase 5C/5D suites.
2. Default-disabled and emergency stop prevent all mock invocations.
3. Mock transient/permanent classifications match integration retry behavior.
4. Stable job identity is forwarded for all synthetic outcomes.
5. No real credentials, endpoints or external requests are used in CI.

**Release decision:** mock contract can be GREEN after CI. Real provider acceptance remains BLOCKED until the above onboarding evidence and approvals exist.
