# Sentry Observability and Guarded Autofix Design

## Purpose

Nestory will report production application failures to Sentry with enough
release, route, organization, and pseudonymous-user context to identify the
affected workflow. A local Codex automation will inspect those issues and may
prepare low-risk fixes on isolated branches and merge them only through guarded
pull requests.

This design does not grant an agent authority to alter financial truth,
authorization, database history, production secrets, or destructive behavior.

## Outcomes

- Capture unhandled browser, React render, server, route-handler, and request
  errors from the Next.js application.
- Upload source maps so production stack traces resolve to repository source
  while keeping source maps out of public client assets.
- Associate events with environment and Git release identity.
- Associate events with a stable internal user ID, organization ID, role, and
  safe route identifier without sending names, email addresses, record labels,
  form values, query strings, cookies, or financial values.
- Run a recurring local repair agent that processes at most one production
  issue per run and proposes only verified, low-risk fixes through pull requests.
- Stop and notify the user whenever authorization, ambiguity, collision, or
  material product risk prevents a safe automatic fix.

## Sentry Provisioning

Sentry will be provisioned through the existing linked Vercel project. The
global Vercel CLI will be installed for environment management, deployment
inspection, and log access. The repository will use the official
`@sentry/nextjs` SDK and the integration-provided organization, project, DSN,
and source-map credentials.

Provisioning may pause for these explicit user actions:

1. Claim or sign in to the Sentry organization created or selected by Vercel.
2. Authorize the Vercel-to-Sentry connection if the marketplace opens a browser
   handoff.
3. Create or approve a narrowly scoped Sentry API token with issue read and
   issue update access for the repair automation.
4. Confirm GitHub or Git credential authorization if the local automation
   cannot push an automation-owned branch or open a pull request.

Secret values remain in Sentry, Vercel, the local automation environment, or
the user's credential store. They must never appear in source, documentation,
test fixtures, command output, screenshots, or chat.

## Application Instrumentation

The SDK configuration will cover the browser, Node.js server, and request-error
instrumentation supported by the installed Next.js SDK version. The root and
dashboard error boundaries will report their received exception before showing
Nestory's existing recovery UI.

Production defaults:

- Error event sampling: 100 percent.
- Performance tracing: 10 percent, adjustable through environment variables.
- Session Replay: disabled.
- Debug logging: disabled.
- Environment: Vercel environment name.
- Release: Vercel Git commit SHA.

Missing DSN or Sentry configuration must leave local development and CI
functional. It must disable delivery rather than crash application startup.

## Privacy and Event Context

A shared event-scrubbing function will remove or reject:

- cookies, authorization headers, and credentials;
- request bodies and form values;
- email addresses, names, and free-text record labels;
- query strings and raw URLs containing record identifiers;
- financial amounts and business-document contents;
- Supabase keys, Vercel tokens, Sentry tokens, and other known secret shapes.

Allowed custom context is limited to stable internal user ID, organization ID,
fixed application role, normalized route pattern, deployment environment, and
release SHA. Context attachment must occur only after the authenticated server
context has been validated. Sentry user IP collection will be disabled.

## Verification Error

Setup verification will use a temporary, authenticated test path or controlled
server action that throws a unique non-sensitive error. The flow is complete
only after the event is visible in Sentry with a resolved source stack,
production-style release metadata, and confirmed redaction. The temporary
trigger will then be removed or disabled outside an explicit verification
environment.

## Autofix Automation

A standalone local Codex project automation will run hourly in the
`D:\nestory` project. Each run will:

1. Verify Sentry API access and select at most one unresolved production error,
   preferring new, regressed, escalating, high-frequency, and high-user-impact
   issues.
2. Deduplicate against issue ID, latest event ID, release, and the automation's
   prior disposition.
3. Fetch `origin`, inspect open worktrees and branches, and stop if the target
   code is owned or modified by another active task.
4. Classify the issue against the automatic-fix allowlist and denylist.
5. Create a fresh isolated worktree from the current `origin/main`.
6. Reproduce the failure with a failing automated test before changing
   production code.
7. Implement the smallest fix and run the relevant test tier plus lint,
   TypeScript checking, and a production build. Database tests are additionally
   required when a supposedly low-risk fix reaches a database-facing boundary.
8. Fetch `origin/main` again, integrate it safely if needed, commit with the
   Sentry issue ID, and push an automation-owned branch non-forcefully. Open a
   non-draft pull request and wait for required checks and reviews without
   bypassing or dismissing them. Merge only through the protected PR flow.
9. Observe CI, the exact merged Vercel production deployment, and new Sentry events. Resolve the
   Sentry issue only after the production deployment is healthy and the failure
   does not recur during the verification window.
10. Remove only the automation-owned, clean worktree after retaining the commit,
    commands, results, deployment, and Sentry disposition in the run report.

The automation must never force-push, rewrite another branch, clean another
worktree, bypass CI or Vercel deployment gates, or resolve an issue merely
because a local test passes.

## Automatic-Fix Boundary

Automatic fixes are limited to deterministic application-code failures such as:

- missing null or empty-state handling;
- incorrect component state transitions with a reproducible UI test;
- safe route or serialization guards;
- incorrect error-boundary or instrumentation behavior;
- narrow runtime compatibility mistakes with a deterministic test;
- local type or import mistakes directly linked to a production event.

The automation must stop and notify the user for any change involving:

- Supabase migrations, RLS, grants, RPC authority, generated database types, or
  production data repair;
- authentication, invitation, role, branch, organization, or capability logic;
- rent, invoices, payments, expenses, owner balances, reports, statements,
  deposits, ledger projection, reversals, or financial locks;
- secrets, environment values, Vercel project settings, Sentry project
  settings, external integrations, or dependency-major upgrades;
- deletion, archival, restoration, destructive commands, or irreversible
  external actions;
- flaky or irreproducible failures, insufficient event context, multiple
  plausible root causes, or a required product decision;
- any collision with an active worktree, branch, automation, or remote update.

## Rollback and Failure Handling

If the automation's production verification fails, it must not rewrite or
directly push `main`. It may prepare a revert only on a fresh isolated branch,
open a guarded pull request, and merge it through the same required review,
CI, deployment, and production verification path. If that cannot be done
safely, it stops and alerts the user with the exact commit, issue, failed check,
and current remote state.

Repeated failures for the same issue are quarantined after one failed repair
attempt until a human explicitly re-enables it. API authorization failures,
rate limits, unavailable local runtime, or a powered-off host produce a missed
run rather than an unsafe fallback.

## Tests and Release Evidence

Repository tests will prove:

- Sentry is disabled safely when configuration is absent;
- client and server initialization use the intended environment and sampling;
- event scrubbing removes sensitive fields while preserving allowed context;
- error boundaries report once and retain their recovery UI;
- request errors are handed to Sentry;
- source-map and Next.js wrapping configuration remains present;
- the repair runner fails closed on missing credentials, unsafe issue classes,
  dirty or colliding worktrees, changed remote base, failed tests, and failed
  deployment verification;
- the repair runner permits a synthetic low-risk issue through a dry-run path
  without pushing or resolving a real issue.

Release evidence consists of lint, type-check, unit/UI/contract tests, a
production build, a real redacted Sentry verification event, the linked Vercel
project and environment names, the automation identifier and schedule, and a
dry-run repair report. No secret values are retained in that evidence.

## Operational Limitations

The repair agent is a local Codex automation. It runs only while its configured
local execution environment is available. It is not a substitute for Sentry
alerting, CI, backups, review of high-risk failures, or production incident
response. The guarded pull-request path, narrow allowlist, one-issue limit,
collision checks, full verification, and automatic quarantine are mandatory
controls rather than optional guidance.
