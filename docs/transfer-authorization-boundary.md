# Transfer record mutation authorization

Development change; beta and production acceptance remain open.

The prior `/work-orders/transfer` route forwarded only caller-supplied data. It
checked a broad role decorator but did not verify a technician's assignment to
the target work order. The route now passes the authenticated session user ID,
and the service rereads current account state inside a serializable transaction.

A technician must be active, belong to a team assigned to that transfer work
order, have an active execution on it, and work on a WORKING order. Active
management users may prepare DRAFT/ASSIGNED/WORKING transfer records. Closed
orders and non-transfer work orders cannot receive records. Destination GPS must
be valid; supplied old GPS must be a complete valid pair. NAP references and port
numbers are checked against stored NAP capacity. These checks do not prove a port
is physically free or release the old port.

The record and audit attribution commit together. Caller-supplied actor or
technician fields are ignored. Old-address history is preserved. This change does
not implement transfer device navigation, physical port release, destination
verification, or request-level idempotency; those remain acceptance work.

Validation: `npm run test:transfer-authorization` tests controller identity binding,
wrong assignment, absent execution, account revocation, closed/non-transfer orders,
invalid coordinates/ports and management preparation with no writes on denials.
`npm run test:transfer-authorization-database` adds disposable PostgreSQL checks,
including committed account revocation from a second client. Run only against a
local database named `wfm_ci`; cleanup targets exactly the generated fixture IDs.
Database acceptance is established only after the added CI step succeeds.

No schema migration, production data change, deployment, or main merge.
