# Workspace performance measurement

Overview, lease, and finance loaders emit `nestory.workspace_read` JSON events
to the server runtime log. Duration covers the complete financial read boundary,
including the initial context checks and final source-revision verification.
It does not measure browser navigation, rendering, or client interaction time.

Each event contains only `event`, `workspace` (`overview`, `leases`, or `finance`),
`duration_ms`, `outcome` (`success` or `error`), and `sampled`. No organization or
record identifiers, search filters, financial values, user data, or error text
are included. Existing Sentry privacy settings and tracing defaults are unchanged.

## Sampling

Production uses a 5% random sample chosen before the read begins. Reads lasting
at least 1,000 ms and failed reads are also retained. The `sampled` flag identifies
the representative sample independently of those extra diagnostic events.

`NESTORY_PERFORMANCE_SAMPLE_RATE` accepts a number from 0 through 1. Zero disables
all workspace timing logs, including slow and failed reads. One records every
read and is useful for a bounded diagnostic period. An absent or invalid value
uses the production default; other environments default to zero. A configured
rate also works in local or preview environments.

## Comparing a release

1. Select the deployment and a fixed time window in runtime logs. Filter for
   `event = nestory.workspace_read` and group by `workspace` and `outcome`.
2. Compute p50 and p95 only from `sampled = true` events. Report the sample count
   with each percentile. Combining the extra slow/error events with the random
   sample would bias the percentiles upward.
3. Inspect unsampled slow and failed events to locate individual regressions.
   These events are diagnostic evidence, not a traffic count or an error-rate
   denominator. A complete diagnostic sample can establish those counts.
4. Compare equivalent workloads and time windows on the previous and candidate
   deployment. Confirm organization/branch visibility and financial totals
   separately using the existing regression and database suites.
5. Measure authenticated browser navigation separately when reporting user-facing
   load-time improvements. Local tests establish query behavior and correctness;
   they do not establish production latency savings.

New migrations use the repository's existing production-database release workflow
after merge. Do not apply them directly to the hosted project. The overview
aggregate RPC must exist before deploying application code that calls it.
