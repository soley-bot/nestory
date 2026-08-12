# Compact End-to-End Local Fixture Design

## Purpose

Improve Nestory's guarded local fixture so a developer can sign in as any fixed
role and follow a coherent operating story across the platform. The fixture is
for product development, demonstrations, route smoke tests, and workflow
verification. It is not production seed data and it is not a scale benchmark.

## Product Boundary

The default fixture contains one organization, one primary operating branch,
three properties, approximately ten units, and five authenticated users. It
uses USD only and preserves these documented local logins:

- Super Admin: `nestory@gmail.com`
- Finance Manager: `finance.manager@nestory.com`
- Finance Member: `finance.member@nestory.com`
- Operations Manager: `operations.manager@nestory.com`
- Operations Member: `operations.member@nestory.com`

Every login uses the existing local development password documented in the
fixture. Company-wide roles remain unscoped. Operations roles retain an active
staff person and branch scope.

The fixture remains guarded by the local JWT-secret check and must refuse to run
against a hosted database. Normal `db:reset` continues to create an empty
database; `db:test:fixture` explicitly loads this disposable operating fixture.

## Portfolio Story

The portfolio is small enough to understand without a data dictionary while
covering the important product paths.

### Central Residence

Central Residence is the primary resolved residential story. It contains
occupied and vacant units, individual tenants, an active owner, generated rent,
a through-IPS payment, an open tenant balance, maintenance work, an approved
maintenance cost, petty cash, and reportable canonical cash events.

This property supplies the clean reporting example: at least one current-month
view has fully resolved operational cash events and exact Ledger source
identity.

### Riverside Shophouse

Riverside Shophouse is the mixed-use story. It includes a commercial tenant,
direct-to-owner rent collection, a confirmed owner collection, a general
expense lifecycle, and maintenance recurrence metadata.

This property supplies variation without introducing another workflow system:
company occupancy, direct owner collection, and mixed-use operations all use
the existing canonical contracts.

### Garden Court

Garden Court is the actionable-work story. It contains a smaller set of units
and deliberately unfinished records: a lease or billing setup exception, an
unpaid or partially paid rent balance, a submitted expense awaiting Finance
review, and Operations work in progress.

It exists to keep queues and recovery surfaces populated. It must not corrupt
the resolved reporting example supplied by Central Residence.

## Role Journeys

### Super Admin

The Super Admin can inspect organization configuration, branches, owners,
properties, units, people, authoritative lease terms, deposits, billing terms,
and the approved rent policy. The fixture includes enough complete setup to
demonstrate automatic rent and one deliberately recoverable setup exception.

### Finance Member

The Finance Member can read the Finance workspaces and submit evidence-backed
general expenses. At least one submitted general expense remains awaiting
review. Historical rejected and reversed general-expense examples remain
available for audit context.

### Finance Manager

The Finance Manager can review the pending expense, inspect submitted evidence,
read generated tenant invoices and owner balances, and see already approved,
rejected, and reversed outcomes. The fixture must demonstrate the boundary
without giving Finance Manager Super-Admin configuration authority.

### Operations Manager

The Operations Manager sees branch-scoped tasks in scheduled, in-progress,
blocked, completed, and cost-submitted states. At least one maintenance cost is
awaiting Finance review and one maintenance cost is already approved.

### Operations Member

The Operations Member has assigned tasks with due dates, checklists, vendor or
work context, and related evidence where supported. Unassigned or cross-scope
work must remain inaccessible through the existing authorization contract.

## End-to-End Scenarios

### Lease-Derived Rent

The fixture creates authoritative leases and billing terms through checked RPCs,
then runs the canonical due-rent generator. Current-month results include:

- one through-IPS invoice paid in full;
- one direct-to-owner invoice confirmed as collected;
- one open or partially paid invoice;
- one visible rent-generation or setup exception that Super Admin can recover.

Generated invoice rows must snapshot the authoritative lease term, approved
rent policy, billing period, collection route, and generation source. The seed
must never insert generated rent, invoice, management-fee, receipt, or Ledger
effects directly.

### General Expense Approval

The fixture uses the canonical submission and review RPCs to create:

- one submitted expense awaiting Finance Manager review;
- one rejected expense with no financial effect;
- one approved expense that is later reversed through the append-only reversal
  workflow.

Each submission includes evidence through a reference and, where practical, a
fixture document. Approved and reversed outcomes retain exact payment,
allocation, customer-effect, and Ledger source identity.

### Maintenance-to-Finance Handoff

Operations creates tasks through the checked maintenance workflow. Task states
cover scheduled, in-progress, blocked, completed, submitted cost, and approved
cost examples. Recurrence remains explicitly schedule metadata; the fixture
must not imply that future tasks are generated automatically.

At least one actual maintenance cost is submitted with evidence and remains in
Finance review. Another is approved by Finance Manager and creates its financial
effect only at approval. Operations task scope, cost scope, and approved
financial scope must agree.

### Owner and Tenant Balances

The fixture produces tenant balances through generated invoices and canonical
settlement paths. Owner-facing obligations and balance effects arise only from
the supported lease, management-fee, expense, payment, collection, or reversal
workflows. Where the current product supports owner payments, the fixture adds
one canonical settled example and preserves at least one open owner balance.

### Petty Cash

The fixture retains one active petty-cash account with a custodian and adds a
small, understandable set of entries covering an open/cleared item and a posted
item. Posted entries must link to exact Ledger events through the checked RPC.

### Documents, Timeline, and Imports

The fixture adds metadata for a small set of operational documents tied to
people, leases, properties, or maintenance evidence where the current document
model permits it. Fixture SQL must not claim that Storage bytes exist when no
local object has been uploaded; metadata-only evidence must be labelled
accordingly or use reference evidence instead.

Timeline and activity rows should primarily arise from canonical workflows.
Direct activity inserts are allowed only for product areas without a checked
event-writing path and must use supported entity types and resolvable targets.

The fixture may include completed import-job metadata only if it can be created
without fabricating uploaded Storage objects or bypassing import invariants.
Imports are excluded when the current schema cannot represent an honest local
fixture without an actual file ingestion run.

## Data-Writing Rules

Foundational records may use ordered direct inserts when no public checked
workflow owns their creation. This includes local auth identities,
organization, branch, basic property/unit records, people, roles, ownership,
and other setup records whose constraints are fully represented by the schema.

Operational and financial effects must use canonical RPCs. This includes lease
creation and relationships, billing terms, rent generation, rent settlement,
expense submission/review/reversal, maintenance creation and cost handoff,
reconciliation sources, owner payments when used, and petty-cash posting.

The fixture must not directly insert derived Ledger, journal compatibility,
invoice-balance, cash-projection, report, or management-fee effects. It must not
invoke retired compatibility writers.

The SQL remains one ordered transaction. Temporary runtime state may exist only
inside that transaction. The loader must not rely on staging tables surviving
separate SQL batches.

## Determinism and Dates

Stable UUIDs identify foundational records used by route smoke tests. Runtime
IDs returned by canonical RPCs are stored in transaction-local fixture state.

Business dates are relative to `current_date` so current-month rent and queue
surfaces remain useful over time. Date-relative expectations must assert
relationships and states rather than fragile literal timestamps.

Idempotency keys are stable and unique per fixture operation. Reloading begins
from the existing guarded truncation, so a second fixture load produces the
same logical portfolio without duplicating effects.

## Error Handling

The fixture runs with `ON_ERROR_STOP=1` through the existing loader. Any failed
constraint, authorization check, canonical RPC, or assertion aborts the entire
transaction. It must never leave a partially loaded portfolio.

The local-only guard runs before destructive statements. The loader continues
to require an unambiguous local Supabase database container or an explicit
`SUPABASE_DB_CONTAINER` override.

## Verification Contract

`demo_seed_contract_test.sql` becomes the executable acceptance contract. It
must verify at least:

- exactly one organization and all five fixed-role logins;
- correct company-wide and branch/person role scopes;
- three active properties and the intended unit/occupancy mix;
- complete current ownership and explicit people/lease relationships;
- authoritative lease terms, deposits, billing terms, and approved rent policy;
- generated rent covering paid, direct-owner-confirmed, open/partial, and
  recoverable-exception states;
- submitted, approved, rejected, and reversed expense outcomes;
- no financial effects for rejected submissions;
- exact append-only financial and Ledger identity for approvals and reversals;
- maintenance states, assignments, evidence, submitted cost, and approved cost;
- petty-cash custody and exact posted Ledger identity;
- supported document/activity target integrity;
- no duplicate Ledger source identities;
- resolved canonical cash events for the reporting example;
- actionable Finance and Operations queues remain non-empty.

Verification after implementation is:

1. reset the local Supabase schema without business seed data;
2. load `supabase/test-fixtures/baseline.sql` through `db:test:fixture`;
3. run the demo seed pgTAP contract and relevant workflow/authorization pgTAP;
4. run database lint and advisors at error level;
5. run TypeScript, focused data/UI tests, route coverage, and a production build;
6. sign in locally as each role and smoke the primary role journey when the
   local runtime is available.

## Explicit Non-Goals

- Production or hosted database seeding.
- High-volume pagination or performance testing.
- Multi-currency behavior.
- A full accounting close, bank reconciliation, or authoritative owner
  statement system.
- Fake Storage objects or pretend uploaded evidence.
- Automatic creation of future recurring maintenance tasks.
- Exhaustive examples for every table in the schema.
- Reintroducing retired finance or compatibility workflows.

An optional scale fixture may be designed separately if performance testing is
needed. It must not replace or obscure this compact default portfolio.
