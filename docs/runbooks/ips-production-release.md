# IPS production release runbook

## Authority boundary

This runbook prepares and records a release decision. It does not grant
authority to push, merge, deploy, migrate hosted Supabase, activate a hosted
cron, invite pilot users, or alter production data. A local green result is
necessary evidence, not proof that a hosted target is ready.

Start every attempt with the decision set to **BLOCKED** in
`docs/verification/ips-production-readiness-report.md`. Change that decision
only after the exact hosted target and all named approvers are verified.

## Freeze and deploy the runtime candidate

1. Name one target branch and one full 40-character implementation commit.
   This immutable commit is the **runtime candidate SHA**.
2. Run the affected database, application, browser, accessibility, concurrency,
   and exact-SHA CI gates against the runtime candidate. Retain the successful
   CI check URL, status, timestamp, and full SHA.
3. After explicit authorization, deploy that exact runtime candidate and
   complete the hosted verification checkpoint and pilot reconciliation. Do
   not rebuild or deploy a later documentation commit.
4. Complete and commit the redacted evidence records after hosted verification.
   This later commit is the **evidence commit SHA**. The verifier accepts exactly
   these two evidence paths and no substitutes:
   `docs/verification/ips-production-readiness-report.md` and
   `docs/verification/ips-pilot-reconciliation.md`. Both files must be tracked,
   and their working-tree bytes must be identical to the blobs stored at
   `HEAD`. Do not use blank templates as evidence.
5. In both records, write the exact 40-character runtime candidate and deployed
   SHA. In the readiness report, also record the exact CI SHA, `success` status,
   HTTPS check URL, and timestamp. The runtime candidate must be a strict
   ancestor of the evidence commit.
6. Fetch the intended remote immediately before the parity check:

```powershell
git fetch origin --prune
$releaseSha = git rev-parse HEAD
$runtimeCandidateSha = '<exact deployed runtime candidate SHA>'
npm run release:verify-local -- `
  --branch codex/ips-operational-readiness `
  --sha $releaseSha `
  --candidate-sha $runtimeCandidateSha `
  --remote-ref origin/codex/ips-operational-readiness `
  --evidence docs/verification/ips-production-readiness-report.md `
  --evidence docs/verification/ips-pilot-reconciliation.md
```

The checker fails closed unless the current branch and evidence SHA match, the
named remote-tracking ref has zero ahead/behind divergence, tracked files are
clean, both canonical evidence files are non-empty and complete, their bytes
match their `HEAD` blobs, the runtime candidate is a strict ancestor of the
evidence commit, and the declared candidate/deployed/CI SHA values match CLI
provenance. It ignores unrelated untracked files for the global
tracked-cleanliness decision, but an untracked file cannot substitute for either
canonical evidence record. It hashes accepted evidence without printing its
contents and emits only machine-readable metadata and generic blocker codes. A
missing or stale remote-tracking ref is an error.

Run the checker contract itself with:

```powershell
npm run release:test-parity
```

## Hosted verification checkpoint

After explicit authorization and before the evidence commit, a release operator
must separately record all of the following against the runtime candidate SHA:

- the deployed Vercel commit SHA and production alias;
- hosted Supabase project reference, migration head, RLS/RPC checks, and
  database advisors;
- a restorable backup checkpoint, recovery owner, rollback criteria, and a
  timed recovery rehearsal;
- the scheduled maintenance runner configuration, UTC schedule, secret
  presence, successful invocation, duplicate-invocation behavior, and job
  history;
- five-role journeys using real hosted memberships, including setup, rent,
  paid cost, maintenance-to-finance, recurring maintenance, notifications,
  owner close, and statement publication;
- the redacted pilot reconciliation and unresolved issue disposition.

The global Vercel CLI resolved as `58.4.4` on 2026-08-12. Reconfirm the installed
version before an authorized hosted checkpoint. `vercel env pull`, deployment,
alias, log, and other hosted commands remain outside this local-only runbook.

## Stop rules

Stop and leave the decision **BLOCKED** when any of these is true:

- branch, local SHA, remote SHA, or deployed SHA differs;
- the tracked worktree is dirty or the remote has any divergence;
- an evidence file is missing, empty, outside the repository, stale, or tied
  to a different SHA;
- a local gate failed or was waived without a named approver and expiry;
- hosted schema, secrets, cron, backup/restore, role journeys, or pilot
  reconciliation are unverified;
- evidence includes credentials, personal data, raw financial records, or
  other material that has not been redacted.

Rollback authority belongs to the named production decision owner. Preserve
failed-run logs and append corrections; do not rewrite an approved evidence
record to make a failed release appear green.
