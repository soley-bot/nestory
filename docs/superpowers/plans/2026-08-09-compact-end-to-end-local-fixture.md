# Compact End-to-End Local Fixture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand Nestory's guarded local fixture into a compact three-property portfolio that exercises every current role and the canonical lease-to-rent, maintenance-to-finance, expense, petty-cash, timeline, and reporting paths.

**Architecture:** Keep `supabase/test-fixtures/baseline.sql` as the single ordered local-only transaction. Insert only foundational records directly and create operational or financial effects through the current checked RPCs, storing returned IDs in the transaction-local `fixture_runtime` table. Extend `supabase/tests/demo_seed_contract_test.sql` first so every promised state is executable and deterministic.

**Tech Stack:** PostgreSQL 15, Supabase Auth/RLS/RPCs, pgTAP, Node.js 24 fixture loader, Next.js authenticated route smoke scripts.

## Global Constraints

- The fixture is local-only and must refuse any database whose `app.settings.jwt_secret` differs from the local Supabase secret.
- Normal `npm run db:reset` remains empty; only `npm run db:test:fixture` loads business data.
- Use exactly one organization and the existing five fixed-role development logins.
- Use USD only.
- Keep the default fixture compact: three properties and ten units.
- Use direct ordered inserts only for foundational records without a checked workflow.
- Use canonical RPCs for leases, billing, rent generation and settlement, expenses, maintenance cost handoff, reconciliation sources, owner payments when used, and petty-cash posting.
- Never directly insert derived Ledger, invoice-balance, cash-projection, report, management-fee, or compatibility-journal effects.
- Do not create fake Storage objects or claim recurrence automatically generates future maintenance tasks.
- Keep high-volume performance data outside the default fixture.
- Every failed statement must abort the transaction through `ON_ERROR_STOP=1`.

---

### Task 1: Lock the Expanded Portfolio Contract

**Files:**
- Modify: `supabase/tests/demo_seed_contract_test.sql`
- Reference: `docs/superpowers/specs/2026-08-09-compact-end-to-end-local-fixture-design.md`

**Interfaces:**
- Consumes: the existing tables, views, and RPC effects already asserted by `demo_seed_contract_test.sql`
- Produces: executable expectations for three properties, ten units, five leases, actionable Finance and Operations queues, reference-backed evidence, and resolved/open reporting stories

- [x] **Step 1: Replace the two-property and five-unit assertions with the approved compact portfolio counts**

Add exact assertions for three active properties and ten active units. Use stable property codes rather than relying only on totals:

```sql
SELECT results_eq(
  $$
    SELECT code, status
    FROM public.properties
    WHERE archived_at IS NULL
    ORDER BY code
  $$,
  $$
    VALUES
      ('CTR-RES'::text, 'active'::text),
      ('GDN-CRT'::text, 'active'::text),
      ('RIV-SHP'::text, 'active'::text)
  $$,
  'the compact fixture contains the three named operating stories'
);

SELECT is(
  (SELECT count(*) FROM public.units WHERE archived_at IS NULL),
  10::bigint,
  'the compact fixture contains ten active units'
);
```

- [x] **Step 2: Add failing assertions for actionable Finance states**

Require both terminal history and work that remains actionable:

```sql
SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.expense_submissions
    WHERE source_type = 'general' AND status = 'submitted'
  ),
  'Finance Manager has a submitted general expense to review'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.expense_submissions
    WHERE source_type = 'maintenance_task' AND status = 'submitted'
  ),
  'Finance Manager has a submitted maintenance cost to review'
);
```

- [x] **Step 3: Add failing assertions for the Operations state matrix**

Assert one or more tasks in each intended lifecycle without pretending recurrence is a generator:

```sql
SELECT results_eq(
  $$
    SELECT status, count(*)::integer
    FROM public.tasks
    GROUP BY status
    ORDER BY status
  $$,
  $$
    VALUES
      ('blocked'::text, 1),
      ('completed'::text, 1),
      ('in_progress'::text, 1),
      ('pending'::text, 2),
      ('scheduled'::text, 1)
  $$,
  'maintenance work covers actionable and historical states'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.tasks
    WHERE recurrence_frequency = 'monthly'
  ),
  'recurrence is represented as metadata on an existing task'
);
```

- [x] **Step 4: Add failing assertions for rent coverage and the reporting split**

Require paid, owner-confirmed, open/partial, and recoverable-exception coverage. Assert that Central Residence remains fully resolved while Garden Court intentionally contains open work:

```sql
SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.rent_generation_exceptions AS exception
    JOIN public.leases AS lease ON lease.id = exception.lease_id
    JOIN public.properties AS property ON property.id = lease.property_id
    WHERE property.code = 'GDN-CRT'
      AND exception.resolved_at IS NULL
  ),
  'Garden Court exposes one recoverable rent setup exception'
);
```

Use `tenant_invoice_balances` to assert two paid invoices and two unpaid invoices. Assert five current leases: four with generated current-month invoices and one missing-billing exception lease. Do not add partial payment behavior to this fixture.

- [x] **Step 5: Add failing integrity assertions for evidence and activity targets**

Require every submitted expense to contain a document or nonblank reference, and require seeded activity entity types to resolve through current supported types:

```sql
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.expense_submissions
    WHERE supporting_document_id IS NULL
      AND NULLIF(btrim(reference), '') IS NULL
  ),
  'every fixture expense carries honest evidence'
);
```

- [ ] **Step 6: Run the contract and confirm it fails only on new expectations**

Run:

```powershell
npx supabase test db --local supabase/tests/demo_seed_contract_test.sql
```

Expected: FAIL because the current fixture has two properties, five units, no submitted general expense, no submitted maintenance cost, and no Garden Court story. Existing assertions must continue passing.

- [x] **Step 7: Commit the failing contract**

```powershell
git add supabase/tests/demo_seed_contract_test.sql
git commit -m "test: define complete local fixture contract"
```

---

### Task 2: Expand Foundational Portfolio and Role Context

**Files:**
- Modify: `supabase/test-fixtures/baseline.sql:248-557`
- Test: `supabase/tests/demo_seed_contract_test.sql`

**Interfaces:**
- Consumes: stable organization, branch, user, and role UUIDs already defined in the fixture
- Produces: property code `GDN-CRT`, five new units for a total of ten, additional people/roles/ownership, and stable foundational IDs consumed by Task 3

- [x] **Step 1: Add Garden Court and its units to the direct foundational inserts**

Add a third property with a stable UUID and code `GDN-CRT`. Add exactly five units to bring the total to ten; use explicit stable UUIDs and recognizable labels. Keep all units in the existing Phnom Penh branch and distribute occupied/vacant states through leases rather than a denormalized unit status field.

Example property row shape:

```sql
(
  '10000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'Garden Court',
  'GDN-CRT',
  'Residential apartment',
  'Street 21, Tonle Bassac, Phnom Penh',
  'active',
  '2023-09-01',
  'Compact residential property used for open operational work.',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
)
```

- [x] **Step 2: Add only the people needed by the new stories**

Add one Garden Court owner and two tenants. Reuse an existing vendor for maintenance and expenses. Give each new person an appropriate active `person_roles` row. Do not add decorative contacts with no relationship to a lease, property, task, submission, or owner record.

- [x] **Step 3: Add complete Garden Court ownership**

Insert one current primary ownership row totaling 100 percent. Preserve the contract that every active property has exactly one complete current ownership model.

- [x] **Step 4: Preserve role scoping and add no new auth personas**

Keep exactly five `organization_members`. Ensure Finance roles remain organization-wide and Operations roles keep valid `person_id` and `branch_id` values.

- [x] **Step 5: Reset and load the fixture**

Run:

```powershell
npm run db:reset
npm run db:test:fixture
```

Expected: reset succeeds, the local-only guard passes, and the fixture commits without foundational foreign-key or ownership errors.

- [x] **Step 6: Run the foundational subset of the fixture contract**

Run the full contract and inspect failures:

```powershell
npx supabase test db --local supabase/tests/demo_seed_contract_test.sql
```

Expected: property, unit, ownership, people, and role assertions PASS. New workflow-state assertions remain FAIL until Tasks 3 and 4.

- [x] **Step 7: Commit foundational fixture expansion**

```powershell
git add supabase/test-fixtures/baseline.sql supabase/tests/demo_seed_contract_test.sql
git commit -m "test: expand compact local portfolio"
```

---

### Task 3: Complete Lease-Derived Rent and Balance Stories

**Files:**
- Modify: `supabase/test-fixtures/baseline.sql:520-914`
- Test: `supabase/tests/demo_seed_contract_test.sql`
- Reference: `supabase/migrations/20260808042046_lease_derived_rent_generation.sql`

**Interfaces:**
- Consumes: Garden Court property/unit/person IDs from Task 2 and existing approved rent policy/reconciliation source
- Produces: two canonical Garden Court leases, one current-month unpaid invoice, and one recoverable missing-billing exception stored in `fixture_runtime`

- [x] **Step 1: Extend `fixture_runtime` with explicit IDs for the new lease story**

Add columns such as:

```sql
garden_open_lease_id uuid,
garden_exception_lease_id uuid,
garden_billing_id uuid,
garden_invoice_id uuid,
garden_exception_id uuid
```

Only include IDs actually used later in the transaction or contract diagnostics.

- [x] **Step 2: Create two Garden Court leases through `create_lease_with_relationships`**

Create two authoritative active monthly USD leases with `pg_temp.active_lease_relationship_payload`. Keep their dates wide enough to include the current billing month. Use unique idempotency keys `fixture-lease-garden-open` and `fixture-lease-garden-exception`.

- [x] **Step 3: Create a supported billing term or a deliberate recoverable exception**

Configure a valid through-IPS billing term only for `garden_open_lease_id`. Leave `garden_exception_lease_id` without a billing term, then run the canonical generator so it records the typed missing-billing exception. Do not repair the exception in the fixture; it remains the Super-Admin recovery example.

Do not insert `rent_generation_exceptions` directly.

- [x] **Step 4: Run canonical rent generation and capture generated IDs**

Continue using:

```sql
RESET ROLE;
SELECT app_private.run_due_rent_generation(now());
SET LOCAL ROLE authenticated;
```

Capture invoice and exception IDs by stable lease and current billing period.

- [x] **Step 5: Leave the generated Garden Court invoice unpaid**

Do not call a settlement RPC for `garden_invoice_id`. Assert it remains unpaid through `tenant_invoice_balances`. Never update balance views or receipt allocations directly.

- [x] **Step 6: Reload and run the fixture contract**

```powershell
npm run db:reset
npm run db:test:fixture
npx supabase test db --local supabase/tests/demo_seed_contract_test.sql
```

Expected: authoritative term, billing-route, generated-rent, payment-state, management-fee, and exception assertions PASS.

- [x] **Step 7: Run rent-specific pgTAP regression tests**

```powershell
npx supabase test db --local supabase/tests/lease_derived_rent_generation_test.sql
```

Expected: PASS with no direct-writer or period-authority regression.

- [x] **Step 8: Commit canonical rent coverage**

```powershell
git add supabase/test-fixtures/baseline.sql supabase/tests/demo_seed_contract_test.sql
git commit -m "test: cover lease-derived rent fixture states"
```

---

### Task 4: Complete Operations-to-Finance, Petty-Cash, and Evidence Stories

**Files:**
- Modify: `supabase/test-fixtures/baseline.sql:916-1149`
- Test: `supabase/tests/demo_seed_contract_test.sql`
- Reference: `supabase/migrations/20260808045433_finance_expense_approval.sql`
- Reference: `supabase/migrations/20260808052514_maintenance_cost_handoff.sql`

**Interfaces:**
- Consumes: foundational property/unit/person/vendor IDs, Finance and Operations user IDs, active reconciliation source
- Produces: submitted/approved/rejected/reversed expense matrix, maintenance state matrix, actionable queues, and posted/open petty-cash examples

- [x] **Step 1: Extend `fixture_runtime` for actionable submission and task IDs**

Add only needed columns:

```sql
pending_general_submission_id uuid,
pending_maintenance_task_id uuid,
pending_maintenance_submission_id uuid,
blocked_task_id uuid,
in_progress_task_id uuid,
completed_task_id uuid,
open_petty_cash_entry_id uuid
```

- [x] **Step 2: Submit one general expense and leave it in `submitted`**

Act as Finance Member and call `public.submit_expense` with Garden Court scope, an active reconciliation source, a vendor/person where required, and a nonblank receipt reference. Do not review it.

Expected result capture:

```sql
UPDATE fixture_runtime
SET pending_general_submission_id = (
  public.submit_expense(
    organization_id,
    '10000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000006',
    'general',
    NULL,
    'repairs_maintenance',
    'Khmer Home Services',
    current_date - 2,
    210,
    20,
    'USD',
    'owner',
    NULL,
    source_id,
    NULL,
    '80000000-0000-0000-0000-000000000006',
    'GDN-PUMP-2088',
    'fixture-expense-pending-review'
  ) ->> 'submission_id'
)::uuid;
```

Use the exact `public.submit_expense` argument order already exercised by the existing reversed and rejected examples: organization, Garden Court property, Garden Court unit, `general`, null source record, `repair`, vendor label, `current_date - 2`, internal cost, markup, `USD`, `owner`, null tenant invoice, reconciliation source, null supporting document, existing vendor person, reference `GDN-PUMP-2088`, and idempotency key `fixture-expense-pending-review`.

- [x] **Step 3: Add the maintenance lifecycle matrix through checked RPCs**

As Operations Manager, create the minimum tasks needed for `scheduled`, `in_progress`, `blocked`, `completed`, and cost-submitted states. Assign at least one actionable task to the Operations Member. Use explicit titles that explain the demo story, for example:

- `Monthly roof tank check` — scheduled, monthly metadata.
- `Garden Court corridor light repair` — in progress, assigned.
- `Riverside drainage access blocked` — blocked with operational notes.
- `Central Residence fire extinguisher inspection` — completed history.
- `Garden Court pump replacement` — actual cost submitted to Finance.

Use `public.create_maintenance_task` and `public.update_maintenance_task`; do not insert tasks or finance effects directly.

- [x] **Step 4: Leave one maintenance cost awaiting Finance review**

Record actual cost through `update_maintenance_task`, then call `public.submit_maintenance_cost` with a nonblank evidence reference. Preserve the existing approved `Kitchen sink repair` path as the completed handoff example.

- [x] **Step 5: Add honest document metadata only where schema and local UI support it**

Inspect the current `create_document` signature before adding document rows:

```powershell
rg -n "CREATE OR REPLACE FUNCTION public.create_document|CREATE FUNCTION public.create_document" supabase/migrations
```

Do not create document rows when the checked workflow requires a real Storage object. Keep all new submission evidence reference-backed. The contract asserts evidence presence through the nonblank reference; it does not claim signed document-byte availability.

- [x] **Step 6: Add one open petty-cash example without posting it**

Retain the existing posted `Kitchen repair consumables` entry. Create one additional entry in the current period with a supported pre-post status and leave it open. Use `create_petty_cash_entry`; do not call `post_petty_cash_entry` for the new row.

- [x] **Step 7: Reload and run fixture plus workflow contracts**

```powershell
npm run db:reset
npm run db:test:fixture
npx supabase test db --local supabase/tests/demo_seed_contract_test.sql
npx supabase test db --local supabase/tests/finance_expense_approval_test.sql
npx supabase test db --local supabase/tests/maintenance_cost_handoff_test.sql
```

Expected: all PASS. The fixture has non-empty Finance and Operations action queues, rejected work has no financial effect, and approved/reversed work retains exact append-only identity.

- [x] **Step 8: Commit workflow fixture expansion**

```powershell
git add supabase/test-fixtures/baseline.sql supabase/tests/demo_seed_contract_test.sql
git commit -m "test: complete operations and finance fixture flows"
```

---

### Task 5: Verify Reports, Authorization, and Local Role Journeys

**Files:**
- Modify: `supabase/tests/demo_seed_contract_test.sql`
- Create: `scripts/smoke-fixture-role-journeys.mjs`
- Modify: `package.json`
- Modify: `PROJECT.md:320-333`

**Interfaces:**
- Consumes: completed fixture and executable fixture contract from Tasks 1–4
- Produces: repeatable verification commands and documented role/story inventory

- [x] **Step 1: Run the complete database verification path from a clean reset**

```powershell
npm run db:reset
npm run db:test:fixture
npm run db:lint
npx supabase test db --local supabase/tests/demo_seed_contract_test.sql
npx supabase test db --local supabase/tests
```

Expected: the fixture loads atomically, database lint reports no errors, and all pgTAP tests PASS.

- [x] **Step 2: Run Supabase advisors at error level**

Discover the installed CLI syntax first:

```powershell
npx supabase db advisors --help
```

Then run the supported local error-level command. Expected: no error-level security or performance findings introduced by fixture work.

- [x] **Step 3: Verify canonical cash and reporting data directly**

Use the existing fixture contract's authenticated Finance Member call to `public.get_property_cash_events_page`. Confirm Central Residence contains only `resolution_state = 'resolved'` events for the current month and includes the expected reversal. Confirm Garden Court's deliberately open work does not cause Central Residence reporting to become unresolved.

- [x] **Step 4: Add the five-role browser smoke script**

Implement `scripts/smoke-fixture-role-journeys.mjs` using the repository's existing Playwright smoke helper conventions:

```js
const journeys = [
  { email: "nestory@gmail.com", route: "/overview" },
  { email: "finance.manager@nestory.com", route: "/bills-expenses" },
  { email: "finance.member@nestory.com", route: "/rent-income" },
  { email: "operations.manager@nestory.com", route: "/maintenance" },
  { email: "operations.member@nestory.com", route: "/maintenance" },
];
```

For each journey, authenticate with `process.env.NESTORY_TEST_PASSWORD ?? "123456789"`, request the route, assert no redirect to `/no-access`, and assert a seeded record unique to that role's story is visible. Never print the password or session token. Add `"test:fixture-roles": "node scripts/smoke-fixture-role-journeys.mjs"` to `package.json`.

- [x] **Step 5: Run application verification**

```powershell
npx tsc --noEmit
npm run lint
npm run test:all
npm run test:ui-coverage
npm run test:ui-copy
npm run build
npm run test:fixture-roles
```

Expected: all commands PASS. Existing skipped tests remain documented rather than silently converted to passes.

- [x] **Step 6: Update local-development documentation**

In `PROJECT.md`, retain the empty-reset boundary and add the compact fixture inventory:

```markdown
The guarded local fixture contains one organization, five fixed-role logins,
three properties, and connected lease-derived rent, Finance approval,
maintenance handoff, petty-cash, timeline, and reporting stories. It is a
compact development fixture, not a scale benchmark or hosted seed.
```

List the five role emails without duplicating the password outside the fixture header.

- [x] **Step 7: Run final diff and provenance checks**

```powershell
git diff --check
git status --short --branch
git diff --stat HEAD~4..HEAD
```

Expected: no whitespace errors, only intended fixture/contract/docs/smoke files changed, and no migration file was added for local demo data.

- [x] **Step 8: Commit verification and documentation**

```powershell
git add PROJECT.md package.json scripts/smoke-fixture-role-journeys.mjs supabase/tests/demo_seed_contract_test.sql
git commit -m "docs: document complete local fixture journeys"
```

---

## Completion Evidence

Before declaring the implementation complete, report:

- exact branch and commit SHA;
- fixture load command and result;
- final property, unit, lease, tenant-invoice, task, and expense-submission counts;
- expense status matrix and maintenance status matrix;
- pgTAP, lint, advisors, TypeScript, Vitest, route coverage, copy, and build results;
- which of the five role journeys were verified in an authenticated browser;
- any verification not run because the local runtime, Docker, or browser was unavailable.

Do not claim hosted or production readiness from this local fixture work.
