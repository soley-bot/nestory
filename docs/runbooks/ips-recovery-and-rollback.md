# IPS recovery and rollback

Status: **procedure prepared; production recovery and rollback approval pending**.
Source contracts checked at `f031e43ab6c4c463a47ef78eaf959126e0585284` on
2026-10-15. No hosted checkpoint, provider setting or production state was
checked while preparing this document. It does not clear a release hold.

Use this procedure to choose and record an incident response, coordinate
database, Auth and Storage recovery, and decide when service can reopen. The
[production database release runbook](production-database-release.md) remains
the authority for migration release and forward repair. The
[IPS release runbook](ips-production-release.md) governs exact-SHA release
evidence, and the [cutover runbook](ips-cutover.md) governs immutable IPS import
and opening-balance authority. This document authorizes no deployment, restore,
reset, schedule change, customer communication or production write.

## 1. Complete the operator record before approval

Keep the completed record and private evidence in the approved access-controlled
location. Do not put credentials, tokens, backup contents, customer records or
unredacted operational logs in Git. Every blank below belongs to the user or
named operator; an unknown entry is a blocker for the operation it governs.

| Required decision | User-owned entry |
| --- | --- |
| Incident/release identifier and evidence location | `[USER TO SUPPLY]` |
| Decision owner and deputy; approval reference and UTC time | `[USER TO SUPPLY]` |
| Application release operator and independent validator | `[USER TO SUPPLY]` |
| Database recovery operator and deputy | `[USER TO SUPPLY]` |
| Auth and Storage operators | `[USER TO SUPPLY]` |
| IPS finance/data approver and operations approver | `[USER TO SUPPLY]` |
| Support primary/backup, coverage hours and escalation route | `[USER TO SUPPLY]` |
| Provider support contact/case route and authorized communication owner | `[USER TO SUPPLY]` |
| RPO: maximum acceptable data loss, units and business scope | `[USER TO SUPPLY]` |
| RTO: maximum outage, clock start and definition of service restored | `[USER TO SUPPLY]` |
| Rollback/recovery triggers, observation window and stop thresholds | `[USER TO SUPPLY]` |
| Source and destination project identities, environment and region | `[USER TO SUPPLY]` |
| Current application full SHA/deployment ID/aliases and database ledger head | `[USER TO SUPPLY]` |
| Proposed application rollback full SHA/deployment ID and schema compatibility evidence | `[USER TO SUPPLY]` |
| Database checkpoint ID, UTC recovery point, completion/retention/PITR window and expiry | `[USER TO SUPPLY]` |
| Auth coverage/configuration reference and separate Storage-byte checkpoint/manifest | `[USER TO SUPPLY]` |
| Exact reviewed provider procedure, target checks and expected destructive effects | `[USER TO SUPPLY]` |
| Authorized write/scheduler containment and restart procedure | `[USER TO SUPPLY]` |
| Reconciliation scope, expected totals, permitted differences and acceptance signers | `[USER TO SUPPLY]` |

Record observed checkpoint availability, not just a backup filename or a prior
inventory. Agree a common recoverable point across database, Auth and Storage,
or explicitly approve and reconcile their time differences. Check that the
point and retention window meet the RPO and remain available throughout the
approved work. A hash verifies bytes against a manifest; it does not prove
coverage or restorability.

## 2. Triage and select one response

Capture UTC incident start, symptoms, affected organizations/branches and the
last known successful operation. Verify the actual application-to-database
binding and immutable identifiers before investigating or acting. Preserve
failed requests, job/run IDs and financial command identities with sensitive
values restricted to the private evidence location.

| Observed condition | Response and gate |
| --- | --- |
| Application regression; current data remains valid | Consider application rollback only after proving the selected deployment works with the database schema and financial state that will remain. Record alias/binding changes and independent validation. |
| Migration preflight/dry-run failure | Stop before apply. Diagnose the exact Git/hosted ledger mismatch read-only; follow the production database release failure procedure. |
| Migration apply/postflight failure or uncertain completion | Stop other database writers through the approved containment procedure. Determine the last committed migration and actual object state before any retry. Prefer a reviewed forward repair. |
| Confirmed data loss/corruption requiring an earlier state | Obtain separate restore approval for the precise source, checkpoint, destination, data-loss window and DB/Auth/Storage plan. Rehearse in an approved isolated target before production recovery where the incident plan permits. |
| Unknown commit outcome after timeout/interruption | Reconcile the original actor/key/payload, command identity and resulting balances read-only. Do not create a replacement financial intent or blindly retry a runner. |
| Unknown target, checkpoint, ownership, permissions or compatibility | Stop the affected action and escalate to the named owner; retain the uncertainty as evidence. |

Use only the approved containment procedure to pause writes, publishers or
schedulers. Verify its effect and record in-flight work; a pause request is not
proof that an already running transaction stopped. Maintain one serialized
production database writer. Do not change access controls, disable step-up or
MFA, grant access, or manufacture backup provenance to make a check pass.

## 3. Use the correct execution path

### Application rollback

The repository has no dedicated production application rollback script or
workflow at the source revision above. The provider operation, currently
available deployment and permissions must be verified by the release operator
and recorded in section 1 before approval. Do not infer a usable rollback from
an old Git SHA or historical deployment URL.

Review the selected application's reads, writes and RPC contracts against the
database ledger that will remain. Test the affected financial/access workflows
on an approved isolated target. After the authorized provider operation, verify
the actual deployment ID, full SHA, aliases and database binding, then apply
section 5. Application rollback does not undo migrations, money movements,
published statements, Auth changes or Storage writes.

### Database forward repair

Prepare a new forward migration through the normal reviewed PR and local
verification process. Never edit a released migration, delete ledger entries,
run reverse DDL or use migration-history repair as an incident shortcut.

The only production migration path is
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), job
`production_database`, from the exact merged `main` SHA, protected environment
`production-database`, serialized group `production-supabase`. That job runs
only on a `push` to `refs/heads/main`; `workflow_dispatch` does **not** execute
it. An approved rerun of a failed main workflow still has to satisfy its exact
current-main SHA guard. If main has advanced, stop and resolve the release
sequence with the owner rather than bypassing the guard.

Within that protected workflow, the source-verified checks are
`npm run db:hosted-preflight`, the Pilot preservation snapshot, reviewed apply,
`npm run db:hosted-postflight`, preservation comparison, Chart of Accounts
postflight, linked lint and a final dry-run showing no pending migrations.
Follow the canonical release runbook for the complete sequence and the narrowly
pinned historical recovery artifacts; those artifacts are not general-purpose
incident tools. No developer-checkout `db push`, connector migration or ad hoc
hosted SQL repair is authorized here.

### Database/Auth/Storage restoration

There is no generic approved hosted restore command in this repository. Before
execution, the named operator must supply a reviewed provider procedure for the
actual checkpoint and destination, including exact target verification,
containment, destructive effects, preservation, failure handling and return to
service. A production restore/reset needs explicit approval and that reviewed
plan. Do not adapt the local synthetic runner to a hosted or shared target.

Preserve the current incident state and audit evidence through the approved
mechanism before destructive action. Record the selected checkpoint and every
later business effect that recovery would omit. Bank transactions, delivered
notifications and downloaded statements are not undone by database restoration.
Finance must approve the reconciliation of these effects before any replay.

| Recovery area | Required coverage and independent validation |
| --- | --- |
| Database | Checkpoint/manifest integrity, version/extensions, migration identities and SQL fingerprints, tables/sequences, constraints, functions, triggers, ownership, grants and RLS. Compare restored state with the approved checkpoint, then reconcile the explicitly accepted post-checkpoint delta. |
| Auth | Users/identities and application memberships, company/branch/role scope; separately inventory provider configuration, redirect settings, signing/session behavior, MFA/step-up and global roles. Prove actual sign-in/session/access behavior against the restored service. Restored `auth` rows and SQL impersonation alone are insufficient. |
| Storage | Matching bucket/object metadata **and separately covered object bytes**, object identity/version/size/hash manifests, policies and access behavior. Verify actual protected downloads and published PDF/XLSX hashes. Re-rendering a statement is not proof that its immutable published artifact survived. |
| Jobs and external effects | Inventory scheduler definitions, pending/processing/failed work and outgoing queues. Keep execution contained during validation; reconcile already committed/delivered effects and original idempotency identities before an approved restart. |

The existing [background jobs and recovery runbook](background-jobs-and-recovery.md)
describes the separate backup inventories and bounded diagnostics.
[`scripts/inspect-background-jobs.sql`](../../scripts/inspect-background-jobs.sql)
is a read-only, time-limited diagnostic for an already authorized operator; it
does not establish complete job coverage or pause anything. Missing privileges
remain an unknown, not a reason to grant access. `maintenance:run-local` invokes
a mutating route and must not be used as a diagnostic probe.

## 4. Preserve evidence throughout

For each attempt retain the approved plan, actor/approval, UTC start/end and
phase times, exact source/target identities, application/CI/deployment SHAs,
ledger fingerprints, checkpoint/export manifest and integrity checks, operation
IDs, sanitized errors and comparison results. Append corrections; do not replace
a failed attempt with a later pass. Record uncertain work and cleanup outcomes.

The workflow's
[`pilot-preservation-snapshot.sql`](../../scripts/pilot-preservation-snapshot.sql)
checks aggregate preservation for the existing Pilot organization and four
Super Admin memberships. It is neither a backup nor a complete IPS financial,
Auth or Storage validation. Use the approved incident scope for additional
comparisons. A migration's before/after preservation equality and a restore's
comparison to an earlier checkpoint are different assertions; do not hide
accepted data loss by comparing only the restored totals with themselves.

## 5. Gate return to service

Keep service contained until the named independent validators record:

1. **Identity and schema:** actual deployment/database binding, approved full
   SHA and ledger state, expected constraints/grants/RLS, and no unexplained
   integrity or preservation differences. Any subsequent migration uses the
   protected forward-repair path above; restored historical ledger state alone
   is not permission to run application traffic.
2. **Finance and authority:** agreed totals by organization, property and
   currency for rent due/receipts, cash, owner balances, deposits, applications
   and reversals. Reconcile ledger, P&L, owner statements, opening/cutover
   authority, month locks, publication revisions and artifact/source lineage.
   Reconcile post-checkpoint money and preserve original command identities;
   no duplicate cash, settlement, publication or opening balance is acceptable.
3. **Real access and files:** sign-in plus permitted and denied actions using
   approved ordinary actors, including limited roles and foreign company/branch
   scope; protected artifact downloads with expected bytes and hashes. An admin
   query or HTTP login redirect is not an access-control pass.
4. **Automation:** in-flight and queued outcomes reconciled, approved schedule
   definitions and restart order confirmed, freshness/backlog thresholds met,
   and observation owner/coverage in place. Inspect row outcomes as well as job
   status. An interrupted HTTP response can follow a committed operation.
5. **Decision:** actual recovered point and measured outage compared with the
   approved RPO/RTO; remaining differences, exceptions and risk acceptance
   signed by the decision owner and IPS approvers. Record authorization before
   reopening traffic or resuming jobs, then observe the agreed window and
   escalate any threshold breach. Resume only the intended existing schedules.

Retain the incident checkpoint and failed-attempt evidence under the approved
retention policy. Remove only resources explicitly owned by the completed plan,
after exact identity verification and cleanup authorization. Unconfirmed
cleanup stays open; never broaden removal to shared resources.

## 6. What the local rehearsal establishes

The [2026-10-14 readiness evidence](../verification/ips-readiness-2026-10-14.md#final-local-database-and-recovery-evidence)
records completed run `ed136a63-b103-4cac-9265-8ac3c7c29d26` on PostgreSQL 17.6
with 212 migrations. Its retained report is
`.codex-artifacts/ips-readiness-recovery/ed136a63-b103-4cac-9265-8ac3c7c29d26/report.json`.
The report was inspected when preparing this procedure; the run was not repeated.

- 180 tables, four sequences, 1,475 rows and 6,825 logical schema objects
  matched; the source remained stable. Five Auth users and identities and
  selected authenticated SQL reads matched, including a denied foreign scope.
- The 6,053,151-byte dump restored successfully. Dump/restore/validation took
  0.937/4.142/3.020 seconds; total elapsed time was 12.661 seconds. One generated
  7,248-byte Storage object completed a separate byte/hash round trip.
- `verified=true` and `completed=true`; the run-owned clone, dump and generated
  Storage bucket/objects were removed. Failed attempts and their corrections
  remain separate evidence.

This is a tiny synthetic local rehearsal, not a hosted checkpoint, production
RPO/RTO or representative-volume result. It excludes scheduler/outgoing queues,
global-role/password restoration, Auth sign-in against the restored database,
Storage service failover and existing object-byte coverage. New deposit
application tables were empty, so populated application-lineage recovery was
not demonstrated. The later browser acceptance against the original local
stack does not fill those restored-service gaps.

For a separately authorized repeat, the exact entry point is
`node scripts/ips-readiness-recovery.mjs`, with **no arguments**. The coordinator
must first provide an exclusive local handoff: `IPS_LOCAL_HANDOFF` must equal
`nestory-ips-readiness-20261014`, configuration must identify that project, and
the recorded fresh-baseline manifest must match its exact container, fixture
hash and synthetic identities and be no more than two hours old. The runner
also requires the ignored local API status for `http://127.0.0.1:59321` and at
least 8 GiB free on the database volume. It uses a verified local Docker endpoint
and rejects target/configuration overrides. These are prerequisites, not
instructions to recreate the stopped stack, reset a shared source or edit a
manifest to satisfy a guard. Keep concurrent fixture writers and jobs out of
the repeat; source-stability checks must pass.

The source checks are in
[`ips-readiness-recovery-core.mjs`](../../scripts/ips-readiness-recovery-core.mjs)
and [`local-recovery-docker.mjs`](../../scripts/local-recovery-docker.mjs);
`node --test scripts/ips-readiness-recovery.node-test.mjs` tests the pure recovery
guards without restoring a database. The smaller
[synthetic recovery rehearsal](synthetic-recovery-rehearsal.md) is a separate
mechanism test. Neither command is a production recovery workflow. Preserve
per-run reports in the approved evidence store; ignored local artifacts and
`latest.json` alone are not a durable operational record.

## Open prerequisites

Current hosted checkpoint availability/retention, representative restore
capacity, coordinated Auth/Storage recovery, an executable provider rollback
procedure and schema compatibility of a selected deployment remain unverified
by this work. The user-owned objectives, checkpoint, owners, support coverage
and acceptance decisions in section 1 remain required. Repository checks and
local rehearsal evidence cannot substitute for those approvals or clear
independent CI/security/release blockers.
