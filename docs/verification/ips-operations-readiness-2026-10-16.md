# IPS operations readiness — October 16, 2026

**IPS go-live remains unverified.** This candidate closes a maintenance
observability gap; it does not constitute financial reconciliation, hosted
recovery proof or IPS user acceptance.

## Candidate and boundaries

- Base: `ae41a56a4203051b8a2f657e04454a094f54a3c3`, the completed PR235 release.
- Branch: `codex/ips-operations-readiness-20261016`.
- Isolated worktree: `D:/nestory/.worktrees/ips-operations-readiness-20261016`.
- Migration: `20261016012335_maintenance_automation_run_history.sql`, created
  with the pinned Supabase CLI 2.108.0. Existing migrations remain immutable.
- Separate workers own the database contract/tests, route/runner, and offline
  evaluator. A fresh reviewer evaluates their final integration independently.
  Workers were requested as GPT-6 Astra with extra-high reasoning; Fast service
  tier and the coordinator's actual model settings are not independently
  verified through this tool interface.

The dirty root checkout, deposit worktree, held PR208/216 operations and PR231
description are outside this change. No hosted synthetic company or financial
records are created. No IPS contact, credential/access setting change, schedule
activation, test alert, database reset, restore or retention deletion is part of
the implementation. Production migration release, if subsequently approved by
the existing release authority and verified, must use exact merged main and the
protected CI workflow; this note is not proof that release happened.

## Prepared change

An authenticated invocation first commits its UUID registration. Only a
confirmed new registration enters the single execution attempt. The database
commits business effects and successful counters together, or rolls back an
ordinary business failure and commits fixed sanitized failure metadata.
Cancellation and uncertain transport/commit outcomes remain unresolved. Existing
IDs return recorded results without route execution. The original business
function, bearer guard and no-retry behavior remain intact.

Private operator SQL provides complete unresolved aggregates and indexed latest
results. The offline evaluator requires explicit freshness policy and reports
separate lateness, terminal failure and overdue unknown-outcome signals as of
the exported database observation time. No automatic scheduler, monitor, alert
delivery, default SLA or cleanup is installed. Direct legacy RPC invocations
remain outside observed-path ledger coverage. See the
[operating contract](../runbooks/maintenance-run-history.md).

## Verification checkpoint

Focused checks completed on the isolated source:

| Check | Status | Evidence |
| --- | --- | --- |
| Route identity, replay, uncertain result and redaction | PASSED | 44 Vitest cases |
| Runner timeout, stable identity, redirects and single request | PASSED | 18 Node cases, including real loopback requests |
| Explicit-policy offline evaluator | PASSED | 40 Node cases; independent review corrected empty-history grace to remain unknown |
| Local database target guards | PASSED | 8 Node cases |
| Changed-script lint and syntax | PASSED | Workers' executed checks |
| Full lint/types/build/dependency audit | PASSED locally | Production build succeeded with CI placeholders; audit met repository thresholds |
| Unit tests | PASSED locally | 3,240 passed, one explicit fixture-dependent skip |
| Repository secret scan | PASSED locally | 2,013 tracked files checked |
| UI/contracts | PENDING at this source checkpoint | One initial unrelated contract child-process timeout under parallel load requires rerun; exact-head CI remains authoritative |
| Database migration/lint/type generation/SQL/integration | PENDING at this source checkpoint | Prepared tests require the disposable PR CI database |
| Diagnostic query-plan measurement | PENDING at this source checkpoint | Integration tests the actual query at 20,000 synthetic ledger rows, without forced planner settings |
| Fresh independent final source review | PASSED, conditional on database execution | Empty-history P2 corrected and rechecked; no remaining source blockers |

Local Docker startup failed before its engine became available: Windows could
not access `sailor-ingest.sock` while Docker attempted its stale-file rename.
The failed startup processes owned by this task were closed. A guarded attempt
to preserve the inactive stale socket under a unique backup name also failed
with “The file cannot be accessed by the system”; no socket was moved and no
data was deleted/reset. The configured local stack was never started and the
repository Supabase configuration was not changed. This is a **failed local
test-environment prerequisite**, not a failed business test or an authorization
denial. PR CI provides an independent disposable database verification path.

The dependency install's first attempt failed on an npm cache collision. A
separate worktree cache and the official npm registry completed the pinned
install without dependency updates. Two new RPC type declarations are prepared
from their SQL signatures; CI must regenerate and compare them before they are
considered verified. No local type-generation claim is made.

## IPS go-live checklist

Historical engineering evidence is tied to its source and environment. The
current PR235 release was verified separately; no PR235 merge or migration is
repeated by this work. Existing evidence and its limitations remain in the
[October 14 checkpoint](ips-readiness-2026-10-14.md) and
[recovery runbook](../runbooks/ips-recovery-and-rollback.md).

| Gate | Engineering evidence | IPS/operational gate |
| --- | --- | --- |
| Receipts, deposits, rent application, reversal and retries | PASSED prior bounded synthetic SQL/browser and protected release checks; new candidate regression checks pending | UNVERIFIED IPS finance acceptance and signed pilot reconciliation |
| Rent correction and immutable receipt history | PASSED PR235 technical release evidence | UNVERIFIED representative IPS period and correction/reversal acceptance |
| Owner statements and P&L reconciliation | PASSED prior synthetic publication, superseding revision, PDF/XLSX and liability/cash checks | UNVERIFIED independently reconciled IPS opening/activity/closing balances |
| Tenant/company/branch isolation | PASSED tested synthetic Auth/API/browser/Storage scopes | UNVERIFIED complete IPS user/role/tenant matrix |
| Realistic daily volume and interrupted/repeated workflows | PASSED prior 1,005-invoice traversal, complete totals and concurrent-editor tests | UNVERIFIED IPS workload, concurrent-user volume and agreed response-time targets |
| Backup restoration | PASSED small local schema/data/ACL and one Storage-object round trip | UNVERIFIED hosted checkpoint/PITR, complete Auth/Storage restore and approved RPO/RTO |
| Monitoring | New durable ledger/evaluator prepared; verification above | UNVERIFIED scheduler ownership/cadence, effective configuration, thresholds, ingestion and delivered escalation |
| Rollback | Forward-only release/recovery procedures documented | UNVERIFIED chosen deployment compatibility, named decision owner and timed production-representative rehearsal |
| Support | Runbooks available | UNVERIFIED primary/backup owners, coverage hours, escalation and incident acceptance |
| IPS user acceptance | Technical evidence available | UNVERIFIED named finance/operations/data approvers and signed representative workflow results |

The user evidence required is the accepted financial period and reconciliation,
complete access matrix, expected workload and service targets, recovery
objectives/checkpoint, monitoring policy/ownership, support coverage and IPS UAT
sign-off. Engineering test success cannot supply those decisions or imply IPS
acceptance. No live IPS data is changed to manufacture that evidence.
