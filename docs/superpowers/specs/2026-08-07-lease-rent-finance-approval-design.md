# Lease-Derived Rent and Finance Approval Design

**Date:** 2026-08-07
**Status:** Implemented locally; hosted migration, Cron enablement, deployment, and role invitation remain release checkpoints.
**Supersedes:** The manual-rent-generation limitation and admin-only expense-entry portions of `PROJECT.md` and the relevant runtime-transition sections of `2026-07-30-ips-finance-workflow-simplification-design.md`.

## Purpose

Nestory remains an operational property-management system, not a full accounting platform. Its finance workflow must nevertheless have one clear source for rent and one clear approval boundary for human-entered costs:

- Super Admin configures the lease, rent, recipient, collection route, proration, and management fee.
- The system generates the monthly rent invoice from that approved configuration. Generated rent is immediately official and does not require a second approval.
- Finance Member reads finance and submits paid-expense evidence.
- Finance Manager reads finance and approves or rejects submitted expenses.
- Operations Manager records and submits maintenance cost.
- Finance Manager approves or rejects the maintenance cost through the same expense-review queue.

No financial effect is created by a human-entered expense or maintenance cost before Finance approval.

## Scope and delivery slices

The work is one product flow delivered as three independently testable slices:

1. **Lease-derived rent automation:** deterministic monthly generation, recovery, provenance, and exception visibility.
2. **Finance roles and expense review:** five fixed roles, Finance submission, approval, rejection, reversal, and finance-data RLS.
3. **Maintenance-cost handoff:** Operations submission into the same Finance review boundary.

The slices share role helpers, audit conventions, idempotency, property-period locking, and source-linked projections. They do not introduce a generic workflow engine or generic financial-event table.

## Fixed role model

One organization membership has exactly one role in the first release:

- `super_admin`
- `finance_manager`
- `finance_member`
- `operations_manager`
- `operations_member`

Existing memberships and pending invitations migrate as follows:

- `admin` to `super_admin`
- `manager` to `operations_manager`
- `member` to `operations_member`

Super Admin is organization-scoped. It is not a cross-customer platform administrator. Multiple simultaneous roles, custom roles, permission editors, amount thresholds, and team ACLs are deferred.

### Capabilities

| Capability | Super Admin | Finance Manager | Finance Member | Operations Manager | Operations Member |
| --- | --- | --- | --- | --- | --- |
| Lease and rent configuration | Full | Read | Read | Read operational context | Read assigned context |
| Generated rent and invoices | Read, recover exceptions | Read | Read | No finance access | No finance access |
| Submit general paid expense | Yes | No | Yes | No | No |
| Approve or reject expense | Yes | Yes | No | No | No |
| Reverse approved expense | Yes | No | No | No | No |
| Record maintenance cost | Yes | No | No | Yes | No |
| Approve maintenance cost | Yes | Yes | No | No | No |
| Execute assigned maintenance | Coordinate | No | No | Coordinate and review | Execute assigned work |
| Manage users, roles, and settings | Full | No | No | No | No |

Navigation reflects capabilities, but authorization is repeated at the route/loader, server action, RPC, and RLS layers.

## Lease-derived rent automation

### Authorities

- `lease_terms` owns effective-dated rent amount, currency, frequency, due day, and term dates.
- `lease_billing_terms` owns effective-dated recipient, collection route, proration, and management-fee configuration.
- The approved `rent_policy_versions` row provides the business timezone and applicable readiness policy.
- `tenant_invoices` is the monthly rent occurrence for this operational product. A separate generic charge-occurrence table is not introduced.

Compatibility rent columns on `leases` are never a generation source.

### Generation timing

Two entry points call the same private generator:

1. Activating or changing eligible lease billing immediately catches up the current billing month.
2. One Supabase Cron job runs hourly. For each approved rent-policy timezone, it calculates the local business date and creates any missing eligible current-month invoice. Uniqueness makes all later hourly runs no-ops.

The hourly job handles timezone changes, daylight-saving changes, temporary job failures, and leases activated after the first day without hard-coding one UTC schedule per organization.

The automatic job never creates historical months before the current billing period. Historical backfill is an explicit Super-Admin recovery action with a selected period.

### Atomic result

For one eligible lease and billing month, one transaction:

1. resolves the active lease term, billing term, and rent-policy version;
2. validates active/noticed lease state, monthly frequency, currency, recipient, term range, and proration;
3. locks organization, property/month, and lease/month identities;
4. creates or replays the rent obligation;
5. creates one tenant invoice and rent line;
6. creates one management-fee occurrence and its owner charge when configured; and
7. records activity with generation source `scheduled`, `activation_catch_up`, or `manual_recovery`.

`tenant_invoices` snapshots `lease_term_id`, `billing_term_id`, `rent_policy_version_id`, period, issue date, due date, amount, currency, recipient, collection route, proration result, and management-fee inputs/result.

The existing unique organization/lease/period identity remains the final duplicate guard. The private scheduled function is not executable by `anon`, `authenticated`, or `service_role` through the Data API.

### Official versus cash income

Generated rent is an immediately official invoice and obligation because Super Admin already approved its source configuration. It is not cash received. Cash and owner-property effects arise only from a checked tenant payment allocation or direct-owner collection confirmation.

### Recovery and exceptions

Generation handles each lease independently so one bad lease does not abort the batch. A typed `rent_generation_exceptions` record is unique by organization, lease, and billing period and stores the failure code, safe operator message, attempt count, first/last attempt, and resolution timestamp.

Finance roles can read the exception queue. Super Admin can retry a selected row through the same checked generator. When a scheduler outage left no exception row, Super Admin can select one lease and one completed historical month from Rent; the action is idempotent for that lease-month and never fills adjacent months. Successful generation resolves any matching exception automatically.

The generic income RPC rejects `income_type = 'rent'`. The legacy batch RPC/button is retired. No UI path can create independent manual rent obligations.

## Human-entered expense approval

### Submission record

A typed `expense_submissions` table is the workflow boundary before financial effects. It stores:

- organization, property, optional unit, and optional maintenance task source;
- category, vendor, expense date, amount, and currency;
- owner/tenant responsibility, funding source, optional markup, and tenant invoice when applicable;
- supporting document/reference;
- submitter, submission timestamp, status, reviewer, review timestamp, and reason;
- idempotency key and links to all approved financial source records.

Statuses are `submitted`, `approved`, `rejected`, and `reversed`. A rejected submission may be corrected and resubmitted; activity history preserves the rejected snapshot and reason. One active submission is allowed per maintenance task.

First-release submissions represent costs already paid by IPS. Unpaid vendor bills and accounts-payable scheduling are outside scope.

### Submission

Finance Member or Super Admin submits a general expense. Submission validates scope, exact money, supported category, responsibility, recipient, document ownership, and period, then records evidence only.

Submission creates no payment, owner charge, tenant charge, Ledger entry, journal, running-balance change, or cash effect.

### Review

Finance Manager or Super Admin may approve or reject a `submitted` row:

- Rejection requires a reason and creates no financial effect.
- Approval locks the submission and affected property/month, revalidates the snapshot, and atomically creates the paid-expense source, payment/allocation, owner-or-tenant effect, exact source-linked Ledger/journal projection, activity, and submission links.
- Approval is payload-bound and idempotent. A partial failure rolls back the entire transaction.
- A locked period rejects approval without changing the submission.

Finance Manager cannot create or edit a submission, change lease configuration, manage users, reverse an approved expense, or unlock a period.

### Reversal

Only Super Admin may reverse an approved submission. Reversal requires a reason and appends exact opposite evidence across the payment/allocation, Ledger/journal, owner invoice/cash allocation or tenant charge, and responsibility records. It never edits or archives the original financial evidence.

If a downstream customer settlement makes exact reversal unsafe, the action fails closed and identifies the required correction path.

## Maintenance-cost handoff

Operational completion and financial approval remain distinct.

1. Operations Manager records actual cost, currency, vendor, cost date, and evidence on a maintenance task.
2. `Submit cost to Finance` snapshots those facts into `expense_submissions` with source type `maintenance_task` and the task ID.
3. The task shows `Awaiting Finance`, while its operational completion/review workflow can continue independently.
4. Submitted cost fields are locked. Rejection returns the submission to Operations with a reason; Operations may correct and resubmit.
5. Finance Manager approval uses the same atomic expense-approval RPC and produces a source-linked official expense exactly once.
6. Later cost differences require a new adjustment submission; approved history is never overwritten.

The existing `Link actual cost to ledger` flag and immediate admin ledger write are removed. Maintenance reports may display recorded operational cost before approval, but Finance, cash, NOI, and approved-expense projections consume only approved submissions.

Operations Manager sees only the finance status and reason for maintenance submissions within their operational scope, not the broader Finance workspace.

## Data access and security

Small private helper predicates define the fixed capabilities:

- `can_manage_access`
- `can_configure_leases`
- `can_read_finance`
- `can_submit_expense`
- `can_review_expense`
- `can_reverse_expense`
- `can_manage_operations`
- `can_execute_operations`

All finance tables and security-invoker views use `can_read_finance` for reads. The current organization-member-wide finance `SELECT` policies are removed. Direct table `INSERT`, `UPDATE`, and `DELETE` remain revoked; writes use checked RPCs only.

Operations maintenance scoping keeps its existing branch/person enforcement. Invitation and membership RPCs validate role-specific shape, preserve final-Super-Admin protection, and reject invalid role/branch/person combinations.

Every new public table/function receives explicit grants because Data API grants and RLS are separate controls. Every privileged function uses a fixed empty search path, checks actor capability internally, and revokes default `PUBLIC` execution.

## Application surfaces

- Super Admin keeps all existing product destinations and lease/billing configuration.
- Finance Manager lands in Finance work, sees generated rent, submitted expenses, maintenance costs, exceptions, and approve/reject actions.
- Finance Member lands in Finance work, sees finance records and `Add expense`, but no approval controls.
- Operations Manager keeps Maintenance and receives cost submission/status controls.
- Operations Member keeps assigned task execution and cannot submit cost.
- Finance pages use capability-aware server contexts rather than `requireAdminContext`.

The Finance queue distinguishes `Rent generation exceptions` from `Expenses awaiting approval`; neither is presented as a full accounting close.

## Error handling

- Missing or conflicting lease authority produces a visible rent-generation exception, not a fabricated invoice.
- Duplicate automatic runs replay or skip the existing lease-month result.
- Cross-organization, cross-branch, or wrong-role access fails before mutation.
- Expense approval/reversal is atomic; any failed downstream effect rolls back.
- Rejected submissions preserve reviewer and reason.
- Locked-period failures leave the source state unchanged.
- Safe user messages omit raw UUIDs and accounting-kernel terminology; diagnostic identity remains in server/database logs.

## Verification

### Database

- Role migration and final-Super-Admin invariants.
- Five-role allow/deny matrix at helper, RLS, and RPC boundaries.
- Cross-organization and Operations branch/person escape denial.
- Direct-DML and default-function-execute denial.
- Rent generation across timezone/month boundaries, activation catch-up, missing setup, idempotent replay, alternate-key duplicate attempts, and concurrency.
- Manual rent creation denial and exact invoice provenance snapshots.
- No expense financial effect before approval.
- Approval/rejection authorization, idempotency, atomic rollback, period locks, exact projections, and complete reversal.
- Maintenance submission uniqueness, rejection/resubmission, and task-linked approval.

### Application

- Route, navigation, command-palette, and action visibility for all five roles.
- Finance Member submission; Finance Manager review; Operations Manager maintenance handoff.
- Super-Admin lease setup, generation recovery, and reversal.
- Exception and empty-state messaging.
- Generated database-type parity, lint, TypeScript, full Vitest, build, route coverage, and authenticated browser smoke for all five identities.

## Rollout

1. Apply role/schema/RLS changes and generated types together so no intermediate role is overprivileged.
2. Backfill existing memberships/invitations and verify final-Super-Admin protection.
3. Enable the Cron extension and schedule only after the generator tests pass.
4. Run a dry-run eligibility report before the first scheduled execution.
5. Because automatic historical backfill is forbidden, first execution generates only the current period.
6. Verify job runs and the exception queue before inviting non-admin staff.
7. Update `PROJECT.md` to replace the manual-generation limitation and document the approved role/approval boundaries.

Production migration, hosted Cron activation, user invitation, and deployment remain explicit release checkpoints; implementing the code does not silently perform them.

## Non-goals

- Full accounting, bank reconciliation, tax, payroll, treasury, or chart-of-accounts editing
- Full period-close or immutable Owner Statements
- Unpaid vendor-bill/accounts-payable workflow
- Multi-step or amount-threshold approval chains
- Custom roles, permission editor, dual non-admin roles, or team ACLs
- Automatic historical rent backfill
- Full future-lease invoice schedule generated at lease creation
- Automatic daily rent proration
- Generic workflow or generic financial-event tables
