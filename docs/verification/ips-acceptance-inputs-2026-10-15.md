# Minimum IPS acceptance inputs — 2026-10-15

Status: **all IPS-provided inputs and acceptance decisions below are pending**.

Technical baseline: [PR231](https://github.com/soley-bot/nestory/pull/231) is
merged at `c25daa516cd8444ea67dbe17c9066acf3e21b03d`; the recorded production
deployment is `dpl_9s3EogovVPDbHrnk5S8ooVWUzaEx` at that SHA.
[Main CI](https://github.com/soley-bot/nestory/actions/runs/38663774051), protected
database release and recorded read-only postflight passed. This is engineering
release evidence, not IPS business approval or a customer workflow test.
The [earlier readiness evidence](ips-readiness-2026-10-14.md) retains its original
local scope; new rent, volume and hosted follow-up results will be recorded separately.

Provide the six bundles below in an **approved private evidence location**:
`[PENDING: location and access owner]`. Do not send customer records, passwords,
tokens or backup contents in chat or commit them to Git. Use redacted references
here; retain signed source records privately. Engineering can build fictional
fixtures from approved rules without copying customer data into test environments.

## 1. One reconciled financial period

- **IPS finance/data owner supplies — pending:** authority date, period, currency
  and a representative property/unit/lease/owner scope; signed opening and closing
  rent, cash, deposit and owner balances, including the four owner-opening
  components. Include sample invoice, receipt, official owner statement and P&L
  with expected totals, adjustments and source references for that same scope.
- **Engineering validates:** opening + approved movements = closing, invoice due
  and allocations reconcile, owner/ledger/report totals agree, and PDF/XLSX match
  approved figures and publication lineage. IPS decides which source is authoritative.

## 2. Staff, tenant and branch access

- **IPS operations/data owner supplies — pending:** a private matrix of actor or
  fictional persona → company → branch/property → role → allowed actions; include
  tenant-related access, read-only users and explicit denied actions. Identify
  who may receive/apply/reverse money, close/reopen/publish and view/download reports.
- **Engineering validates:** real sign-in and ordinary-user workflows against the
  approved matrix, including foreign-company, other-branch and limited-role denials.
  IPS chooses the responsibilities; engineering does not infer them from job titles.

## 3. Representative volume and service targets

- **IPS operations owner supplies — pending:** normal and peak properties, units,
  active leases, invoice/history rows, daily receipts, report size, concurrent
  staff and month-end workload; expected growth and the busiest relevant period.
  Approve response-time targets (including percentile), job completion deadlines
  and acceptable error rate, with the permitted test environment and load ceiling.
- **Engineering validates:** complete totals at those volumes, bounded pages,
  measured timings and concurrent/repeated actions. Synthetic timings cannot set
  the SLA or establish hosted capacity by themselves.

## 4. Recoverable checkpoint and objectives

- **Recovery owner supplies — pending:** named primary/deputy, maximum acceptable
  data loss (RPO), outage limit and clock definition (RTO), available checkpoint
  identity/UTC/retention, approved isolated restore target, Auth/configuration
  coverage and a separate Storage object-byte manifest aligned with the database.
- **Engineering validates:** checkpoint coverage/integrity, scoped access and
  financial/artifact reconciliation in an approved rehearsal; records duration
  and gaps. The local rehearsal is not hosted recovery proof. Complete the
  [recovery procedure](../runbooks/ips-recovery-and-rollback.md) before execution.

## 5. Schedulers, alerts, support and rollback

- **Operations/release owner supplies — pending:** scheduler identity, cadence and
  timezone; acceptable lateness/backlog/failure thresholds; approved alert
  destination; primary/backup responders, coverage hours and escalation route.
  Name the rollback decision owner, triggers and approved application/database path.
- **Engineering validates:** actual scheduled outcomes, duplicate/interrupted work,
  and a separately authorized non-customer alert with receipt/acknowledgement.
  [Monitoring](../runbooks/ips-monitoring.md) distinguishes capture from delivery
  and missing-run detection. A green route test or configured secret is insufficient;
  remaining implementation gaps need their own work and cannot be signed away as tests.

## 6. Named UAT acceptance and exceptions

- **IPS supplies — pending:** finance, operations and data approvers; case owners,
  acceptance window and approved test target/data policy. Each case needs expected
  results, actual evidence and a signed pass/fail. Exceptions need an accountable
  approver, impact, compensating action, expiry and an explicit go-live disposition.
- **Engineering validates and reports:** reproducible results and unresolved defects.
  IPS owners accept business rules and operational risk. Named go-live approval is
  a separate decision; this document authorizes no customer writes, restores or sends.

## Minimum safe UAT examples to agree

Use fictional records in an approved isolated environment; IPS confirms the rules
and expected results before execution. These examples are proposed cases, not passes.

| Case | Minimum acceptance result |
| --- | --- |
| Rent receipt and interrupted retry | Invoice 1,000; receipt 400; due 600. Replaying the original request creates no second receipt or allocation; UI and report totals agree. |
| Deposit application and reversal | Held deposit 600; apply 100 to eligible rent; held deposit 500. Reverse fully to 600, preserving original lineage and no duplicate cash/income. Agree invoice/owner effects from the signed financial model. |
| Official statement and access | Publish agreed period totals, download matching PDF/XLSX, then exercise an approved correction/revision. Prior publication remains immutable; forbidden roles and foreign scopes cannot mutate or download it. |
| Recovery and operational response | Approved isolated restore reconciles the chosen checkpoint and covered file bytes; an authorized synthetic failure reaches the named responder. Compare measured recovery and acknowledgement with the owner-approved targets. |

Go-live remains pending until the six bundles, applicable technical results and
named IPS acceptance/exception decisions are recorded. Historical October 14
documents are retained unchanged; they do not supply the missing owner decisions.
