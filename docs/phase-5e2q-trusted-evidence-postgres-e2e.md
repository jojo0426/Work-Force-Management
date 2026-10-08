# Phase 5E.2Q — Evidence Registry and Reconciliation PostgreSQL E2E

**Status: foundation implementation; CI pending. Real providers disabled.**

Repaired the 5E.2P Prisma schema parsing failure by replacing unsupported block comments with line comments.

Added `IntegrationProviderEvidence` and migration with a unique admission ID, distinct operator/reviewer database constraint, outcome constraint, and immutable UPDATE/DELETE trigger. Reconciliation now requires an existing matching, validated registry record inside the same transaction that creates the durable audit and settles the admission. No public evidence registration or reconciliation endpoint exists.

Added isolated `wfm_ci` PostgreSQL E2E for mismatched reviewer rejection, concurrent reconciliation (at most one success), durable audit and admission settlement, and database trigger rejection of audit tampering. Records intentionally remain in the disposable CI database because audit/evidence are immutable.

**Trust boundary:** The registry has no independently authenticated ingestion or signature validation; a privileged internal caller can still insert a synthetic validated record. The provider capability predicate still relies on caller-supplied data. This is **not** real two-person identity authentication or independently attested provider evidence. No production reconciliation approval, no provider activation, and no merge to main.

**Next:** authenticated role-bound approval workflow, trusted provider receipt/status ingestion, immutable off-database audit export, fault injection, and strict post-stop request-start protocol.
