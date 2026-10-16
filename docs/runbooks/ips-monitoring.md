# IPS monitoring readiness

This runbook separates application guarantees, observed scheduler configuration,
and operational acceptance. The 2026-10-15 audit started from PR231 candidate
`f031e43ab6c4c463a47ef78eaf959126e0585284` while release was held. PR231,
including the October 15 fixes below, is now deployed at main SHA
`c25daa516cd8444ea67dbe17c9066acf3e21b03d`, confirmed by READY production
deployment `dpl_9s3EogovVPDbHrnk5S8ooVWUzaEx`. The original observations below
remain dated historical evidence; the post-release observations follow them.
No production cron invocation, test alert, notification, credential/configuration
change or customer-record query was performed for these monitoring audits.

## October 16 source follow-up

The isolated October 16 candidate adds an observed-run ledger and an offline,
explicit-policy health evaluator. Its contract and operating limits are in
[Observed maintenance runs](maintenance-run-history.md). This is a source
follow-up; the dated deployed observations below do not verify its rollout,
scheduler activation, freshness policy or alert delivery. Current verification
is recorded separately in [the October 16 readiness checkpoint](../verification/ips-operations-readiness-2026-10-16.md).

## October 15 disposition

| Area | Evidence | Remaining limit |
| --- | --- | --- |
| Scheduler authentication | Deployed source lets only the exact `/api/cron/maintenance` pathname reach the route's existing bearer-secret guard without a Supabase session. Local tests verify missing/wrong bearer returns 401 and missing secret returns 503. | No signed hosted invocation was performed. Project key-name metadata does not establish an effective runtime secret. |
| Failed execution visibility | Deployed source captures a fixed sanitized Sentry error for RPC errors, thrown/setup failures and malformed successful results. Local tests verify the generic 500 and single invocation even if capture throws. | Capture calls are not proof of durable storage, Sentry ingestion, alert rules or delivery. |
| Duplicate business effects | SQL serializes runs with a blocking transaction advisory lock; occurrence and outbox-attempt uniqueness prevent repeated business effects. Existing SQL tests cover recurrence replay and orphan cleanup. | This is not exactly-once HTTP execution or a durable per-run ledger. The audit did not run concurrent database sessions. |
| Persistent maintenance schedule | Source has no Vercel/workflow schedule. Fresh deployed Vercel metadata has zero cron definitions; hosted pg_cron has three other jobs, none referencing maintenance. | No persistent maintenance scheduler is verified. An external scheduler, if one exists, needs its own identity/configuration evidence. |
| Missed/late execution detection | Existing aggregate-only diagnostic SQL can inspect job history and business backlogs under separate read authorization. | No approved freshness/backlog policy or automatic missed-maintenance-run evaluator is established. |
| Operator and delivery | Existing team-wide Sentry integration metadata is confirmed. No destination, accountable operator, approved thresholds or delivery receipt was supplied. | Integration metadata does not establish alert rules, event ingestion or delivery. Operational monitoring acceptance remains unverified. |

## Local fixes and their regression evidence

The proxy previously treated `/api/cron/maintenance` as a session-protected
page. A scheduler following `scripts/run-maintenance-automation.mjs` supplies a
bearer secret and no Supabase browser session, so the proxy returned a login
redirect before the route's secret guard. The narrow fix adds the exact pathname
to the proxy's existing public transport allowlist. The route still authenticates
the job; no prefix or descendant-path exception was added. CSP/security-header
processing remains in place.

The route also previously returned HTTP 200 with zero counters for a null RPC
result and accepted other malformed counters as success. The SQL contract always
returns generated/delivered counts plus its run timestamp. The route now requires
nonnegative safe-integer counters before returning success; invalid results use
the same fixed error capture and generic 500 as other failures. Valid zero-work
results, including `run_at`, remain unchanged. No automatic retry, new upper
workload threshold or raw failure-payload collection was added.

Before the implementation, eight new regression cases failed: the bearer-only
request received 307, and seven malformed results received 200. After the fix,
both focused suites passed **45 tests** (17 route, 28 proxy), serially:

```powershell
node node_modules/vitest/vitest.mjs run src/app/api/cron/maintenance/route.test.ts src/proxy.test.ts --maxWorkers=1
```

The tests add coverage for null/array/missing/string/negative/fractional/unsafe
results, valid idle results, the exact scheduler path and six protected adjacent
paths. They reuse the existing sanitized-failure assertions. The earlier 26
route/helper/scrubber tests are not duplicated; the shared observability helpers
were not changed. All Auth, RPC and Sentry calls in these focused suites are
mocked. A Windows sandbox temporary-file rename error initially prevented test
startup; the approved outside-sandbox rerun produced the behavioral evidence.
Changed-file ESLint and `git diff --check` also passed. The runbook has no trailing
whitespace or conflict markers.

Relevant source:

- `src/proxy.ts` and `src/proxy.test.ts`
- `src/app/api/cron/maintenance/route.ts` and `route.test.ts`
- `src/lib/observability/capture-unexpected-server-error.ts`
- `src/lib/observability/sentry-options.ts`
- `scripts/run-maintenance-automation.mjs` and its existing runner tests
- `supabase/migrations/20260811124438_ips_operational_readiness_batch.sql:542`
- `supabase/tests/ips_operational_readiness_batch_test.sql`

The installed Next route-handler and proxy guides were read before these edits.
The release coordinator's build/release evidence is separate; these local unit
results and deployment identity do not establish hosted scheduler execution.

## Historical pre-release configuration observations

At **2026-10-15T00:44:43.959185Z**, a bounded READ ONLY query against the linked
production project returned exactly three pg_cron jobs, with cron timezone `GMT`:

| Job | Schedule | Active |
| --- | --- | --- |
| `nestory-hourly-rent-generation` | `17 * * * *` | true |
| `nestory-hourly-lease-activation` | `11 * * * *` | true |
| `nestory-deferred-owner-cash` | `41 * * * *` | true |

None of those job definitions references `run_maintenance_automation` or
`/api/cron/maintenance`. Only names, schedules, active flags and a boolean
reference check were returned; job commands, credentials and business rows were
not exposed. This was a configuration read, not execution-history or
successful-business-outcome evidence.

At **2026-10-15T00:45:54.7228545Z**, a scoped Vercel CLI GET of project
`prj_jQnruwZcvxh1jAA8mJHDpgdSy6CD` in team
`team_Je5M9yfKfOgCSz04aZplYBbU` returned:

- `crons.definitions=[]`, associated with
  `dpl_Avj9QeQX2CBwLNfCUkrZCqwNkNRS`.
- No production-target `CRON_SECRET` entry listed in project environment-key
  metadata. This does not inspect secret values or prove effective inherited
  runtime configuration.
- A production-target `NEXT_PUBLIC_NESTORY_SENTRY_DSN` entry listed. Key presence
  alone does not prove a valid deployed value, event ingestion or alerts.

The connector's summarized project response omitted cron fields, so it was not
used to infer absence. The read-only CLI response exited 0; an updater-worker
warning did not prevent the project response. A separate read-only deployment
lookup confirmed the cron-associated deployment is READY, target production,
at deposit-release SHA `eaf3fa8327d2e93df11244e06cdb4f4b93f3d25b`. It predates
PR231's explicit handled-maintenance-error capture and the local fixes above.
No deployment, schedule, Auth setting or environment variable was modified.

`vercel.json` specifies region `sin1` and has no cron definitions. The two
repository workflows (`ci.yml`, `daily-workflow-acceptance.yml`) do not schedule
the production maintenance runner. `next.config.ts` explicitly sets
`automaticVercelMonitors: false`. These observations do not rule out an external
scheduler outside the inspected configuration.

## Post-release read-only observations: 2026-10-15

The canonical `www.nestory-kh.com` alias and current project cron configuration
point to READY production deployment `dpl_9s3EogovVPDbHrnk5S8ooVWUzaEx`,
main SHA `c25daa516cd8444ea67dbe17c9066acf3e21b03d`. The alias metadata was
last updated at **2026-10-15T01:18:32.222Z**. This confirms deployed source
identity, not a new runtime/browser test or a signed maintenance invocation.

At **2026-10-15T01:41:19.119681Z**, a bounded READ ONLY query against Supabase
project `pfvmztxktkwyewvxfgot` reported the same three active pg_cron jobs,
timezone `GMT`, with `cron.log_run=on`. Each had **24 executions, 24 succeeded,
zero failed and zero running/starting** in the trailing 24 hours: **72/72**
scheduler executions in total. None references maintenance automation.

| Job | Schedule | Latest successful end UTC | Seconds since success at observation |
| --- | --- | --- | ---: |
| `nestory-hourly-rent-generation` | `17 * * * *` | 2026-10-15T01:17:00.251211Z | 1459 |
| `nestory-hourly-lease-activation` | `11 * * * *` | 2026-10-15T01:11:00.218945Z | 1819 |
| `nestory-deferred-owner-cash` | `41 * * * *` | 2026-10-15T01:41:00.446649Z | 19 |

Scheduler success does not prove every business row completed successfully.
The elapsed values are observations, not approved freshness thresholds. Only
aggregate metadata was returned, with no raw job commands, messages or customer
rows. The query used a five-second statement timeout, one-second lock timeout
and ROLLBACK. Catalog name matching found only the notification outbox/attempt
tables among candidate maintenance-history names; that heuristic alone is not
an exhaustive absence proof. The source still has no separate durable
maintenance execution/failure ledger.

At **2026-10-15T01:43:15Z**, the scoped Vercel project GET reported
`crons.definitions=[]` for the deployed PR231 SHA. No production-target
`CRON_SECRET` key was listed; a production-target Sentry DSN key was listed.
Only presence booleans were retained, without values. Effective inherited or
runtime configuration remains unverified. No persistent maintenance schedule
is established in Vercel or pg_cron; any external scheduler needs its own proof.

At **2026-10-15T01:43:43Z**, a scoped Vercel CLI GET returned zero project
drains. The connector's earlier 404 was not used as absence evidence. At
**2026-10-15T01:46:22Z**, a CLI GET of Sentry integration configurations returned
an external integration with `projectSelection=all`, plus a marketplace
integration with selected-project scope and an empty project list. Thus an
existing team-wide Sentry integration is confirmed. The connector's earlier
403 was not used as absence evidence. This metadata does not identify the
Sentry project, production ingestion, retention, alert rules, destinations or
delivery; no callable Sentry read connector was available and no alert was sent.

Hosted backup/PITR enabled state, successful checkpoint, recoverable window and
retention remain **unverified**. Supabase project details reported
`ACTIVE_HEALTHY` but exposed no backup fields; database catalogs and cron history
do not prove platform backups. Local Supabase CLI help failed before any hosted
backup request on a telemetry-file permission error. No credentials or settings
were changed to work around it. The documented read-only backup metadata GET
requires existing `database:read` or `backups_read` access; existing authorized
dashboard metadata is another evidence path. Database backups exclude Storage
object bytes, which need separate recovery evidence. See the
[backup API reference](https://supabase.com/docs/reference/api/v1-list-all-backups)
and [backup coverage documentation](https://supabase.com/docs/guides/platform/backups),
read on October 15. No restore, backup download or paid resource was requested.

Sanitized observations and the executed query are retained under
`.codex-artifacts/ips-followup-20261015/hosted/` as `evidence.json`,
`scheduler-aggregate-readonly.sql` and `readiness-notes.md`. These ignored local
artifacts supplement this runbook; their existence does not close the operational
acceptance gaps below.

## Failure, replay and monitoring semantics

`run_maintenance_automation` takes a blocking transaction advisory lock,
generates due recurrence occurrences, advances recurrence state and processes
the in-app notification outbox in one database transaction. Replayed recurrence
occurrences are uniquely constrained; delivery attempts are keyed by outbox ID
and attempt number. A duplicate call can legitimately return zero work. The
current counts do not distinguish an idle run from replay, nor prove the runner
was invoked at every required time.

The HTTP runner makes one request, rejects redirects, validates counters, and
bounds transport plus body decoding to 30 seconds by default. A timeout or
transport failure can follow a committed database result. Do not automatically
retry or interpret a missing response as a rollback; inspect existing state
through the authorized operator path before a separately authorized rerun.

At the October 15 checkpoint there was no separate durable maintenance
execution/failure ledger in this route. A SQL exception rolls back the transaction, including any ordinary
in-transaction failure record; fixing durable history would require a separately
reviewed persistence/runner contract. Missed executions never reach the route,
so error capture alone cannot detect them. These are technical gaps, not tests
that can be made green by choosing an alert recipient.

The current in-app outbox code marks entries delivered and records an attempt.
It does not prove email/SMS/push delivery or implement an external provider's
retry/dead-letter lifecycle. The presence of retry/dead status columns is not
evidence that those transitions are implemented.

Sentry initialization is gated by a configured DSN. Current code disables default
PII, scrubs request data, free-form messages and exception values, retains only
allowed context, tags environment/release, and sets tracing to zero.
Maintenance failure identification survives through these fixed tags:

```text
error_code=maintenance_automation_failed
operation=maintenance_automation
route=/api/cron/maintenance
handled=true
```

The older observability design document's proposed tracing/autofix behavior is
not proof of current configuration and does not authorize production changes.
No callable Sentry read connector was available in this audit, and no alternate
token/credential lookup was attempted. Live event ingestion, retention, monitor
check-ins and alert-rule/destination state therefore remain unverified.

## Operator evidence required before monitoring acceptance

The accountable operator must provide the existing scheduler/monitoring project
identity, accepted cadence and timezone, an authorized invocation path to the
exact deployed SHA, and a named primary/backup responder with coverage hours.
Keep credentials in their existing protected stores; retain only presence and
identity checks in evidence.

Agree acceptable lateness, backlog age/size and failure criteria using expected
IPS volume and recovery expectations. No arbitrary threshold is installed by
this runbook. Once those decisions exist, the technical follow-up can implement
and test durable run state plus a missed/stale/failed-run evaluator, covering
duplicate attempts and unknown outcomes without introducing automatic retries.

Record an approved alert destination and escalation path, then obtain separate
authorization for a controlled non-customer delivery test. Evidence must tie
the emitted sanitized signal, monitoring environment/release, alert rule and
receipt/acknowledgement to a UTC time. Configuration or a mocked capture call
cannot substitute for that receipt. No delivery test is authorized here.

For read-only investigation, use the existing `scripts/inspect-background-jobs.sql`
only after confirming the target and read authorization. It summarizes configured
jobs, bounded history and aggregate backlog/failure state without raw messages.
It is not an automatic monitor or a health verdict; absent history and successful
aggregate cron status can coexist with unprocessed or failed business rows.

Do not probe the signed cron endpoint as a health check: an authorized GET runs
the mutating job. `maintenance:run-local` likewise invokes the job and is not a
read-only command. Production cron execution, schedule changes, alert sends and
operational activation require their own authorized handoff.
