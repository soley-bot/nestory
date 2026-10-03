# Background jobs and recovery verification

## Scope and evidence

Inspected main `9b9d7a86` on 2026-10-03. This runbook preserves existing runners and contains no schedule creation or recovery execution commands. PR #186 reminder lifecycle and PR #188 frozen statement rendering remain held; neither patch is included. Coordinator `01a0f1c6-1aab-7373-86a0-74d79c95500b` owns integration. No UI changes are included.

| Job | Verified source contract | Gap or unknown |
| --- | --- | --- |
| Monthly rent | `20260808235721_operational_runtime_bootstrap.sql` installs hourly `17 * * * *`; baseline `run_due_rent_generation` stores per-lease exceptions with attempts and resolution state | Hosted schedule, last success, unresolved count and operator ownership unverified |
| Lease activation | `20260818221116_process_scheduled_lease_activations.sql` installs hourly `11 * * * *`; row locks, 500 per workspace limit, idempotency key; per-row failures stored as `failed` | Failed rows are excluded from pending processing; review before recovery. Aggregate cron success can coexist with row failures |
| Deferred owner cash | `20260914023901_prevent_future_charge_auto_settlement.sql` installs hourly `41 * * * *`; per-workspace failures retain SQLSTATE and last attempt | Hosted backlog and alert coverage unverified; not covered by the public-table diagnostic query |
| Maintenance | Signed HTTP route invokes `run_maintenance_automation` with limit 100; SQL advisory transaction lock, unique recurrence occurrence and outbox event keys, row locking | No maintenance persistent schedule verified in source. Retry/dead columns exist, but main runner directly marks in-app entries delivered; no backoff/dead-letter transition. Advance/cancellation lifecycle remains owned by held PR #186 |

Maintenance `delivered` means an in-app feed entry, not email/SMS delivery. Generation and delivery each have a separate limit; the advisory lock serializes calls, but neither HTTP timeout nor limit guarantees a maximum database execution duration. These source findings do not prove deployed function parity or concurrency under load.

## Safe diagnostics

An already authorized operator can run `scripts/inspect-background-jobs.sql` against the intended database after checking the target identity. It runs in a read-only transaction with a 5-second statement limit, summarizes counts and timestamps, and limits cron history to 100 rows in the last 24 hours. It omits payloads, bearer credentials, job command text and raw failure messages. No new grants are needed or authorized. If access is unavailable, report it as unknown; do not grant access to make the query work. The query has been source-reviewed but has not been executed against a database.

Missing expected cron jobs, inactive jobs, old last-success timestamps, failed/processing/dead outbox rows, overdue pending work and unresolved rent exceptions require investigation. Zero rows in cron history may mean unavailable/expired history, not success. Set acceptable backlog age and freshness thresholds with the operator; no arbitrary threshold is installed here. Review deferred-owner-cash state separately with an authorized database operator without exposing raw business data.

Use existing scheduler/runner logs to correlate UTC start/end, HTTP status, count results and deployment SHA. Compare database row outcomes even after a successful cron execution. Maintenance HTTP failures return a safe generic result and do not persist a failed run record; durable failure/run visibility and alerts remain an operator decision.

The existing `scripts/run-maintenance-automation.mjs` now bounds fetch and response decoding to 30 seconds (programmatic `timeoutMs` range 1–120000), rejects redirects, sanitizes transport/JSON errors and accepts only nonnegative safe-integer counts. It makes one request and adds no retries. A timeout or transport failure leaves the outcome unknown: the database may have committed. Inspect state before a separately authorized rerun. Do not use `maintenance:run-local` as a read-only check: it invokes the mutating job route. Never set production credentials while running synthetic tests.

## Backup evidence and recovery decisions

Record evidence in the approved private evidence location, not in this repository:

1. Confirm source project/database identity, checkpoint UTC time, database version, migration ledger/main SHA, backup type, retention window, owner and incident recovery target. Verify checkpoint availability read-only. Existing backup files and filenames alone do not prove a usable hosted checkpoint.
2. For an already exported artifact, record byte length and SHA-256 privately; compare with an independently retained export manifest. A matching hash proves integrity, not completeness or restorability. Do not export or copy real records into synthetic fixtures.
3. Inventory database, Auth/roles, Storage object bytes, object metadata and external configuration separately. [Supabase database backups](https://supabase.com/docs/guides/platform/backups) include Storage metadata but not Storage object bytes. Identify gaps for documents, photos and statement artifacts; the target-organization dump transformer is not a full backup tool.
4. Record operator-approved RPO (acceptable data loss), RTO (acceptable downtime), restore target, ownership, exact artifact coverage and validation criteria. No paid service, new environment, reset, grant or restore is authorized by this runbook.
5. Obtain separate approval before a rehearsal in a disposable isolated target. The reviewed plan must prevent outgoing notifications and inherited schedules from executing, verify destination identity, and retain schema/ledger, row counts, financial reconciliation, permissions, Auth and Storage evidence. Never use the shared database as the rehearsal target.
6. Record actual rehearsal duration, result, missing objects and reconciliation differences. Label restore readiness unknown until that evidence exists. A green synthetic parser test or local migration replay is insufficient.

See [production database release](production-database-release.md) for the serialized writer and forward-repair rules. Do not blindly rerun failed migrations, mutate migration history or restore production.

## Bounded synthetic verification

Run without credentials, a database, or notification providers:

```powershell
node --test scripts/maintenance-automation-runner.node-test.mjs scripts/target-org-dump.node-test.mjs
```

Runner cases exercise a loopback HTTP server and injected responses only: signed success, safe HTTP failure, origin validation, timeout validation, transport redaction, malformed/negative/unsafe counts, stalled response body and redirect rejection. The stalled-body and redirect cases have 3-second test ceilings. Dump tests use small in-memory COPY strings, cover organization filtering, identity checks, truncation, CRLF, escaped fields and nulls; they do not restore data.

Remaining decisions: release held PRs through their owners; choose durable run visibility/alerts and freshness thresholds; verify deployed schedules/function parity and backup retention; nominate recovery owner and approve a separate isolated restore rehearsal. This work makes no claim that those hosted checks passed.

Verification on 2026-10-03: 18 focused Node tests passed; ESLint passed for all three changed JavaScript files; runner syntax check, staged diff whitespace check and repository secret scan passed (1734 tracked files). The diagnostic SQL was not executed, no database test/rehearsal ran, and no hosted runner was invoked.
