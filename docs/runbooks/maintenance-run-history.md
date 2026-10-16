# Observed maintenance runs

This contract adds durable evidence for the authenticated maintenance route.
It does not activate a scheduler, set a production freshness policy, send alerts,
or establish IPS acceptance. Direct calls to the original
`run_maintenance_automation` remain compatible and are outside this ledger's
coverage.

## Invocation and uncertain outcomes

The runner generates a UUID before its one HTTP request and sends it as
`x-maintenance-run-id`. An operator can supply `MAINTENANCE_RUN_ID` explicitly.
Keep the ID with the sanitized result; it contains no customer or credential
data. Existing authenticated callers without the header receive a generated ID.

The route first calls `begin_maintenance_automation_run`, which commits a
registration with a database-assigned cutoff and work limit. Only a confirmed
new registration permits the route's one execution attempt. Reusing an existing
ID returns its saved result or an unknown outcome without executing again.
There is no automatic HTTP or database retry.

`execute_maintenance_automation_run` takes the identity row lock and retains the
legacy global maintenance lock. It records successful counters in the same
transaction as business effects. An ordinary SQL failure rolls those effects
back and records only `maintenance_execution_failed`. No raw SQL error,
business payload or secret is stored.

| Stored status | Meaning | HTTP result |
| --- | --- | --- |
| `registered` | Registration committed; a terminal outcome has not been observed. It does not prove a worker is currently executing. | 500, `outcome: unknown` |
| `succeeded` | Business effects and success history committed together; zero work is valid. Replayed counts describe the original run. | 200, `outcome: succeeded` |
| `failed` | The execution wrapper caught an ordinary SQL failure, rolled back its business work and committed fixed failure metadata. | 500, `outcome: failed` |

Cancellation, process interruption, response loss and outer transaction failure
must not be interpreted as a failed business execution. A timeout may follow a
committed success. The route never writes a compensating failure after a
transport error. The CLI only recognizes durable failure from a validated,
matching-ID failed envelope; other request failures remain unknown.

After an uncertain invocation, inspect that ID through the existing authorized
operator path. Do not create a new ID to retry unconfirmed work automatically.
An unfinished registration needs operator reconciliation; its age never changes
it into a failed row. Any deliberate rerun or direct legacy call is a separate
operational decision. Never use the mutating cron endpoint as a health probe.

The private table has no direct grants to browser or service API roles. Only the
two narrow RPCs are service-role executable. No history HTTP endpoint is added.

## Read-only assessment

`scripts/inspect-maintenance-runs.sql` returns one aggregate JSON snapshot using
an existing authorized operator database connection. It has a five-second
statement timeout and a one-second lock timeout. With `psql -X -qAt` and
`ON_ERROR_STOP=1`, save only successful output to a local snapshot file. A query
failure, absent schema or inaccessible history is unavailable evidence; do not
replace it with an empty snapshot or reuse an older file as current evidence.

The snapshot contains its database observation time, the latest registration
across all runs, latest committed success/failure, latest terminal status, and
the count/oldest timestamp of every unresolved registration. The recent display
in `inspect-background-jobs.sql` is limited to 100 rows and cannot substitute
for these complete unresolved aggregates. Neither query returns raw errors.

Run the offline evaluator with explicitly named local JSON files:

```powershell
npm run maintenance:health -- --snapshot <snapshot.json> --policy <approved-policy.json>
```

The policy requires `expected_since` (an RFC3339 time with timezone) and positive
integer millisecond values for `max_registration_gap_ms`,
`max_success_gap_ms`, and `max_registered_age_ms`. There are no default
thresholds. An accountable operator must choose these values from the accepted
cadence and recovery requirements. Omitting policy yields an unassessed result.

Assessment is explicitly **as of the snapshot observation time**, with no
network access or wall-clock freshness claim. A consumer must separately ensure
its snapshot is current. The evaluator reports registration lateness, success
lateness, latest terminal failure, and overdue unresolved registration as
separate signals. Exact threshold equality is within policy; a signal triggers
only when the age is greater. Missing/pre-expectation events receive the
configured initial grace; pre-expectation terminal failures are historical.
Old unresolved registrations retain their actual age after expectation starts,
even if a later run succeeded. A fresh unresolved registration still has an
unknown outcome. Missing or malformed evidence is never healthy.
Even within the initial grace period, an empty history or absence of committed
success since `expected_since` yields an unknown assessment. Timing signals may
be clear while `success_observed_since_expectation` is false; that is not a
successful execution claim.

Exit codes are `0` for clear assessed signals, `1` for attention required, and
`2` for unknown/unassessed evidence or invalid input. A clear result is bounded
to this observed path and supplied policy; it does not prove all background
jobs, notification delivery, or production readiness.

## Verification and operational handoff

The route/runner tests cover duplicate IDs, lost responses, validation,
redaction and single-request behavior. Database tests cover ordinary failures
after real maintenance writes, finalization failure, cancellation, terminal
immutability and role denials. The explicitly invoked
`npm run maintenance:test-runs` uses only a verified owned local Docker database
to test commits and real concurrent/interrupted sessions. It requires an empty
due-work queue; CI runs it before loading the fixture. It does not reset a
database or connect to a hosted project.

Before operational activation, retain exact deployed SHA/migration evidence,
approve scheduler ownership/cadence and policy, establish an authorized
invocation path, and validate the alert destination under its own authorization.
Named response coverage, retention requirements, delivery receipt, and IPS
acceptance remain separate gates in [IPS monitoring](ips-monitoring.md).
This change deliberately performs no history deletion or retention cleanup.
