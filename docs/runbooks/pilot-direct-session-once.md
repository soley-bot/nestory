# Pilot October direct PostgreSQL execution

The owner approved one direct execution of operation
`7c70e27f-ba37-48cc-8f93-d32badcb2fb7`. The Management API disconnected the
previous attempts; database readback proved rollback. The existing protected
GitHub runner supplies its existing database credential without exporting it.

`direct-execute-once` in the existing local-custody workflow accepts only the
reviewed compact transaction with SHA256
`42d2ba7cebaac4018c92ec7d84633324961b3b30dbec56479e6dfbf431198224`.
The private template is gzip/base64 in the protected environment secret
`PILOT_RESET_REVIEWED_SQL_GZIP`. It is decoded only in runner memory.
Only its single authorization locator and two non-Pilot census digest literals
are substituted. The SQL retains its native genuine-session authorization,
original packet/binding, installed schema checks, 4,169 sealed actions,
preservation checks, report verification and single transaction.

This mode uses the existing protected environment, exact-main validation,
serialized production writer, pinned psql/CA, verified TLS, disabled swap/core
dumps and ten-minute psql limit. It adds no migration or authorization exception.
Earlier journals and failed attempts remain immutable. Run-attempt 1 is required;
there is exactly one write call and no automatic retry.

Before dispatch, reconcile prior attempts, pause the three already approved
shared schedules, capture the current foreign census and obtain fresh genuine
zero-plan/execute approvals. Dispatch with the operation UUID, action `execute`,
authorization UUID and current foreign digest. Do not expose SQL or credentials
in inputs, artifacts or logs. Observe the same run until terminal. Even after a
timeout, inspect the database before considering any further action.

After execution, verify the full independent outcome proof and aggregate counts,
including 77 properties, 94 units, 164 people and all 60 lease contracts, zero
current financial records, unchanged non-Pilot data and paused Pilot billing.
Restore all three shared schedules on success, failure or user pause. Remove
the temporary SQL secret after reconciliation; preserve the encrypted C: backup.
