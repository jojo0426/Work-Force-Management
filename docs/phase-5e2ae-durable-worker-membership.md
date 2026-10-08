# Phase 5E.2AE — Durable Worker Membership and Stop Acknowledgments

**Scope:** PostgreSQL prototype, migration, isolated two-connection E2E, and fail-closed read-only inspection. **No live worker wiring, no public endpoint, no real provider.**

## Added

- `IntegrationWorkerMembership` persists unique worker identity, instance token, fleet generation, registration and heartbeat timestamps, active attempt count, and generation-bound STOP acknowledgment.
- `IntegrationWorkerMembershipService.register` locks fleet singleton and refuses duplicate worker IDs or mismatched generation. It deliberately does not replace identities automatically after crash/restart.
- `acknowledgeStop` locks the same singleton, requires disabled fleet and exact stopped generation, and matches the instance token. It accepts one acknowledgment only.
- `inspectStoppedFleet(expectedWorkerIds)` checks a caller-supplied expected roster, matching generation acknowledgment and durable unresolved attempts. **It always reports externallyQuiescent=false.**
- Isolated PostgreSQL E2E exercises two connections, duplicate/forged registration, early/stale/forged stop acknowledgment, concurrent single-winner acknowledgment, missing expected worker, and no false provider quiescence.

## Important limitations

This is a **control-plane prototype**, not a secure production membership system. The instance token is stored in plaintext in the prototype; it is not provisioned by an authenticated deployment controller and no trusted membership inventory or network transport exists. The expected worker roster is supplied by the caller, so omission of a worker could falsely suggest all expected workers acknowledged. Heartbeat freshness is not yet enforced in the database inspector, and the model is not wired to the live worker lifecycle. Do not expose this service over HTTP or use it to approve provider activation.

The existing `IntegrationAdmission` ledger is authoritative for uncertain external operations; even a clean worker acknowledgment and empty ledger cannot independently establish that remote network requests have stopped.

## Next acceptance work

1. Authenticate worker instances via deployment identity; store only hashed credentials or short-lived signed workload identities, not plaintext tokens.
2. Derive complete worker roster from trusted durable deployment membership; prevent omission and stale/crashed worker false positives.
3. Add generation-bound heartbeat/attempt inventory and lease semantics that **escalate**, never infer safety from expiration.
4. Verify SIGKILL, restart, partition, PostgreSQL outage, and stop-vs-registration interleavings across independent processes.
5. Establish independently verified provider-side quiescence evidence or retain **ADMISSIONS_CLOSED / EXTERNAL_STATUS_UNKNOWN**.

**Production gate:** G1 remains OPEN. Phase 5E.2AE must not be interpreted as production shutdown proof or a release approval.
