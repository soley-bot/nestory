# Property Workspace, Lease, and Finance Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one chronological Property → optional Unit → Lease → activation → scoped Finance flow without a global Rent policy prerequisite.

**Architecture:** Keep Property as the aggregate root and use the existing nullable `leases.unit_id` for property-only rentals. Move rent-generation rules into effective-dated `lease_billing_terms`, preserve legacy Rent policy evidence for historical invoices, and compose scoped Finance panels from the existing invoice, expense, owner-account, payment, and reporting contracts.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Zod 4, Supabase PostgreSQL/RLS/RPC/Cron, Vitest, Testing Library, pgTAP, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-17-property-workspace-lease-finance-simplification-design.md`

## Global Constraints

- Do not create a fake Unit for a `single_space` property; use nullable `leases.unit_id`.
- Do not delete Rent policy, Ledger, Petty cash, invoice, payment, owner-account, report, or activity history.
- New Lease creation is monthly-only; existing non-monthly Lease history remains readable.
- Money writes remain exact-decimal, idempotent, organization-scoped, RLS-protected, and RPC-owned.
- Existing payment, receipt, allocation, owner-effect, Ledger-projection, reversal, and month-lock contracts remain authoritative.
- Contextual Finance reuses canonical data and mutations; it must not create a parallel Finance model.
- Every new `SECURITY DEFINER` function sets a safe empty `search_path`, checks
  `auth.uid()` plus the capability-specific organization predicate, revokes
  default execution from `PUBLIC`, `anon`, and `authenticated`, then grants
  only the intended checked entry point.
- Any new exposed table enables RLS and uses explicit grants and policies; any
  new exposed view uses `security_invoker = true`.
- Update `PROJECT.md` whenever a durable authority or product boundary changes.
- Start each behavior change with a focused failing test.
- Do not run a destructive database reset against a hosted Supabase project.

## Pre-execution Gate

The planning checkout was `D:\nestory` on local `main` at `62ed037`, ahead two
and behind two commits relative to `origin/main`. The following overlapping
worktrees existed on 2026-08-17:

- `D:\nestory\.worktrees\lease-create-flow` — dirty Lease form/action work.
- `D:\nestory\.worktrees\property-unit-lease-workflow-repair` — clean workflow
  repair branch.
- `D:\nestory\.claude\worktrees\lease-creation-modal-7ac0dc` — separate Lease
  creation branch.

Before implementation:

- [ ] Read the current official Supabase breaking-change index and the Cron,
  migration, database-function, and API-security documentation. Record any
  relevant platform change in the verification document.
- [ ] Run `npx supabase --version`, `npx supabase --help`,
  `npx supabase migration --help`, and `npx supabase db --help`; do not guess
  CLI flags from this plan if the installed version differs.
- [ ] Run `git fetch --all --prune`, `git status --short --branch`, and
  `git worktree list --porcelain`.
- [ ] Inspect the three overlapping branches with `git diff origin/main...HEAD`
  from each worktree.
- [ ] Preserve dirty/user-owned work. Do not delete, reset, or overwrite it.
- [ ] Choose the branch containing the accepted Lease-create work, then create
  one isolated implementation worktree using `superpowers:using-git-worktrees`.
- [ ] Rebase or merge the accepted branch before writing migrations so the UI
  plan is not implemented twice.

Official Supabase references to re-check at execution time:

- [Breaking changes](https://supabase.com/changelog?types=breaking-change)
- [Cron](https://supabase.com/docs/guides/cron)
- [Local migration workflow](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Database functions](https://supabase.com/docs/guides/database/functions)
- [Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)

## File Structure

### New files

- `src/features/properties/property-rental-structure.ts` — shared
  `undecided | single_space | multi_unit` types, copy, and transition guards.
- `src/features/finance-context/finance-context.types.ts` — Property/Unit
  Finance context and tab contracts.
- `src/features/finance-context/data/finance-context.ts` — scoped composition
  over canonical rent, expense, and owner-account loaders.
- `src/features/finance-context/components/context-finance-panel.tsx` — shared
  record-level Finance tabs and actions.
- `src/features/finance-operations/components/manual-charge-form.tsx` — manual
  tenant charge drawer.
- `supabase/tests/property_rental_structure_test.sql` — structure transition
  and property-only Lease contracts.
- `supabase/tests/lease_rent_rules_test.sql` — lease-owned rules and legacy
  policy compatibility.
- `supabase/tests/lease_activation_schedule_test.sql` — immediate/scheduled
  activation and concurrency behavior.
- `supabase/tests/manual_tenant_charge_test.sql` — manual charge atomicity,
  duplicate protection, roles, and settlement compatibility.

### Existing files with primary changes

- `PROJECT.md` — durable Property/Lease/rent/Finance authority.
- `src/features/properties/actions.ts` and `property-form.tsx` — minimal create,
  detailed edit, and rental-structure selection.
- `src/features/properties/data/property-detail.ts` and
  `property-detail-view.tsx` — rental structure, contextual Lease, and Finance.
- `src/features/units/data/units.ts` and `unit-detail-view.tsx` — contextual
  Lease and writable scoped Finance.
- `src/features/leases/actions.ts`, `lease.types.ts`, `lease-form.tsx`, and
  Lease screen/detail components — context-owned minimal creation and activation.
- `src/features/finance-operations/actions.ts`, data, types, and screen — manual
  charges plus scoped filters.
- `src/components/layout/app-shell.tsx`,
  `src/features/finance/components/finance-workspace-navigation.tsx`, and
  `src/features/workspace-search/workspace-search.scopes.ts` — secondary global
  Finance and Advanced finance placement.
- `config/ui-route-coverage.json` — new record states and navigation contract.
- `supabase/migrations/` — five new files created by the CLI commands
  `property_rental_structure`, `property_only_leases`,
  `lease_owned_rent_rules`, `lease_activation_schedule`, and
  `manual_tenant_charges`; edit the exact path printed after each command.
- Create every migration with `npx supabase migration new <name>`; never invent
  its timestamp or edit an already-applied migration.
- `src/types/database.generated.ts` — regenerated only through `npm run db:types`.

---

### Task 1: Establish the new product contract and safe baseline

**Files:**
- Modify: `PROJECT.md`
- Modify: `docs/superpowers/specs/2026-08-15-lease-user-flow-design.md`
- Modify: `docs/superpowers/plans/2026-08-15-lease-user-flow.md`

**Interfaces:**
- Consumes: the approved design spec and current runtime contract.
- Produces: one explicit authority statement used by every later task.

- [ ] **Step 1: Capture the old contract**

Run this read-only assertion against `PROJECT.md`:

```powershell
$contract = Get-Content -Raw -LiteralPath PROJECT.md
@(
  "Property is the operating root",
  "leases.unit_id = NULL",
  "lease-owned billing rules",
  "portfolio review surface"
) | ForEach-Object {
  if (-not $contract.Contains($_)) { throw "Missing contract: $_" }
}
```

- [ ] **Step 2: Verify the assertion fails**

Expected: FAIL because `PROJECT.md` still declares an approved global Rent
policy as mandatory authority.

- [ ] **Step 3: Update the durable contract and supersession notes**

Rewrite `PROJECT.md` sections `Authoritative Data Flow`, `Lease Authority`,
`Financial Model`, `Interface Contract`, and `Deliberate Limitations`. Mark the
2026-08-15 spec and plan as superseded where they prohibit schema changes or
retain the global policy prerequisite; retain their accepted user-language
decisions.

- [ ] **Step 4: Verify the product contract passes**

Run the Step 1 assertion and `npm run test:ui-copy`; require both to exit 0.

- [ ] **Step 5: Commit the contract boundary**

```powershell
git add PROJECT.md docs/superpowers/specs/2026-08-15-lease-user-flow-design.md docs/superpowers/plans/2026-08-15-lease-user-flow.md
git commit -m "docs: define property-led lease and finance flow"
```

### Task 2: Add explicit property rental structure and minimal creation

**Files:**
- Create: `src/features/properties/property-rental-structure.ts`
- Modify: `src/features/properties/actions.ts`
- Modify: `src/features/properties/actions.test.ts`
- Modify: `src/features/properties/components/property-form.tsx`
- Modify: `src/features/properties/components/property-screen.test.tsx`
- Modify: `src/features/properties/data/property-detail.ts`
- Modify: `src/features/properties/components/property-detail-view.tsx`
- Modify: `src/features/properties/components/property-detail-screen.test.tsx`
- Create via CLI: run `npx supabase migration new property_rental_structure`
  and edit the exact path printed by the command.
- Create: `supabase/tests/property_rental_structure_test.sql`

**Interfaces:**
- Produces:

```ts
export type PropertyRentalStructure =
  | "undecided"
  | "single_space"
  | "multi_unit";

export async function setPropertyRentalStructureAction(
  state: PropertyActionState,
  formData: FormData,
): Promise<PropertyActionState>;
```

```sql
public.create_property_minimal(
  p_organization_id uuid,
  p_name text,
  p_property_type text,
  p_address text,
  p_idempotency_key text
) returns uuid

public.set_property_rental_structure(
  p_organization_id uuid,
  p_property_id uuid,
  p_rental_structure text
) returns uuid
```

- [ ] **Step 1: Write failing component and action tests**

Assert that create mode renders only Property name, Property type, and Address;
submits hidden defaults; opens the created Property record; and does not render
Code, Status, Owner, Acquisition date, Ownership share, Photo, or Notes. Assert
that edit mode still exposes detailed fields.

- [ ] **Step 2: Write failing pgTAP tests**

Cover:

```sql
-- Existing properties with units backfill to multi_unit.
-- Existing zero-unit properties backfill to undecided.
-- single_space rejects unit creation.
-- multi_unit rejects a property-level lease.
-- structure change fails when non-archived units or leases conflict.
-- create_property_minimal creates an Active property and collision-safe code.
```

- [ ] **Step 3: Verify focused failures**

```powershell
npx vitest run src/features/properties/actions.test.ts src/features/properties/components/property-screen.test.tsx src/features/properties/components/property-detail-screen.test.tsx
npx supabase test db --local supabase/tests/property_rental_structure_test.sql
```

- [ ] **Step 4: Implement additive schema and checked RPCs**

Run `npx supabase migration new property_rental_structure` and edit only the
generated file.

Add `properties.rental_structure` with the three-value check. Backfill only
properties with Units to `multi_unit`; leave all others `undecided`. Generate a
property code inside `create_property_minimal` from the preallocated UUID, for
example `P-<first eight uppercase hex characters>`, and preserve the existing
organization/code uniqueness constraint.

- [ ] **Step 5: Split create and edit validation**

Create a three-field Zod schema for create mode. Keep the current detailed
schema for update mode. Never satisfy missing create fields by submitting
invisible user-owned facts such as an Owner.

- [ ] **Step 6: Add the chronological next decision**

On the new Property record, render one undecided-state panel:

```text
How is this property rented?
[The whole property] [Separate units]
```

On success, show either `Create lease` for `single_space` or `Add first unit`
for `multi_unit`.

- [ ] **Step 7: Run focused tests and commit**

Require both Step 3 commands to pass, then commit:

```powershell
git add src/features/properties supabase/migrations supabase/tests/property_rental_structure_test.sql
git commit -m "feat: add property rental structure setup"
```

### Task 3: Make Lease creation contextual, minimal, and property-only capable

**Files:**
- Modify: `src/features/leases/lease.types.ts`
- Modify: `src/features/leases/lease-relationship-input.ts`
- Modify: `src/features/leases/lease-relationship-input.test.ts`
- Modify: `src/features/leases/actions.ts`
- Modify: `src/features/leases/actions.test.ts`
- Modify: `src/features/leases/components/lease-form.tsx`
- Modify: `src/features/leases/components/lease-screen.tsx`
- Modify: `src/features/leases/components/lease-screen.test.tsx`
- Modify: `src/features/properties/components/property-detail-screen.tsx`
- Modify: `src/features/properties/components/property-detail-screen.test.tsx`
- Modify: `src/features/units/components/unit-detail-screen.tsx`
- Modify: `src/features/units/components/unit-detail-screen.test.tsx`
- Create via CLI: run `npx supabase migration new property_only_leases` and
  edit the exact path printed by the command.
- Modify: `supabase/tests/lease_relationship_creation_behavior_test.sql`
- Modify: `supabase/tests/property_rental_structure_test.sql`

**Interfaces:**
- Consumes: `PropertyRentalStructure` from Task 2.
- Produces:

```ts
export type LeaseCreateContext = {
  propertyId: string;
  propertyLabel: string;
  unitId: string | null;
  unitLabel: string | null;
};
```

The existing checked RPC keeps `p_unit_id uuid` nullable; no second Lease
creation RPC is introduced.

- [ ] **Step 1: Write failing context-flow tests**

Assert:

```text
single_space Property → Create lease → fixed Property, no Unit selector
multi_unit Unit → Create lease → fixed Property and Unit, no selectors
global Lease register → no Create lease button
changing dates → never clears the fixed context
```

- [ ] **Step 2: Write failing property-only database tests**

Create a `single_space` Property Lease with `p_unit_id = NULL` and assert one
Lease, one authoritative term, one primary party, one property-scoped occupancy,
and one optional deposit are created atomically. Add a concurrent test proving
two overlapping non-archived property-level terms cannot be created for the
same `single_space` Property.

- [ ] **Step 3: Verify focused failures**

```powershell
npx vitest run src/features/leases/actions.test.ts src/features/leases/lease-relationship-input.test.ts src/features/leases/components/lease-screen.test.tsx src/features/properties/components/property-detail-screen.test.tsx src/features/units/components/unit-detail-screen.test.tsx
npx supabase test db --local supabase/tests/property_rental_structure_test.sql supabase/tests/lease_relationship_creation_behavior_test.sql
```

- [ ] **Step 4: Permit null Unit through the checked path**

Run `npx supabase migration new property_only_leases` and edit only the
generated file.

Update Zod validation, payload construction, relationship validation, occupancy
matching, and checked RPC guards to accept null Unit only for a `single_space`
Property. Add property-row locking and overlapping-term detection for the null
Unit case; retain the existing Unit row lock and availability trigger for
`multi_unit`.

- [ ] **Step 5: Recompose the minimal form**

Render Tenant first, then dates, monthly rent/due day, and optional deposit.
Submit `paymentFrequency=monthly`, `status=draft`, and `termStatus=draft` as
server-owned defaults. Keep inline `Create tenant`. Do not expose global Property
or Unit selection in the contextual drawer.

- [ ] **Step 6: Keep the register secondary**

Remove competing create-intent handling from `/leases`. Preserve search,
filters, quick view, and record links. Redirect stale `/leases?action=create`
links to `/properties` with a concise message: `Choose a property or unit to
create its lease.`

- [ ] **Step 7: Verify and commit**

Run Step 3 commands until green, then:

```powershell
git add src/features/leases src/features/properties src/features/units supabase/migrations supabase/tests
git commit -m "feat: create leases from property and unit context"
```

### Task 4: Move rent-generation authority into each Lease

**Files:**
- Modify: `src/features/leases/lease.types.ts`
- Modify: `src/features/leases/data/leases.ts`
- Modify: `src/features/leases/data/rent-policy.ts`
- Modify: `src/features/leases/components/lease-detail-view.tsx`
- Modify: `src/features/leases/components/lease-detail-screen.test.tsx`
- Modify: `src/features/leases/actions.ts`
- Modify: `src/features/organization/settings-navigation.ts`
- Modify: `src/app/(dashboard)/settings/rent-policy/page.tsx`
- Create via CLI: run `npx supabase migration new lease_owned_rent_rules` and
  edit the exact path printed by the command.
- Create: `supabase/tests/lease_rent_rules_test.sql`
- Modify: `supabase/tests/lease_derived_rent_generation_test.sql`
- Modify: `supabase/tests/rent_policy_contract_test.sql`

**Interfaces:**
- Produces effective-dated fields on `lease_billing_terms`:

```sql
rent_rule_contract_version text not null default 'lease_v1',
rent_rule_source text not null default 'lease_v1',
rent_generation_enabled boolean not null default true,
rent_calculation_timezone text not null,
short_month_due_day_rule text not null default 'last_calendar_day',
lease_start_proration_rule text not null default 'actual_days',
lease_end_proration_rule text not null default 'actual_days',
notice_period_charging_rule text not null default 'through_lease_end',
mid_period_rent_change_rule text not null default 'next_full_period'
```

Add nullable `tenant_invoices.rent_rule_contract_version`. The generated-
invoice provenance constraint accepts exactly one authority path: legacy
`rent_policy_version_id`, or `rent_rule_contract_version='lease_v1'` plus the
invoice's exact immutable `billing_term_id`.

- [ ] **Step 1: Write failing rule-resolution tests**

Test a new Lease with no approved global Rent policy and assert readiness is
`ready`, the workspace timezone and fixed V1 rules resolve, and rent generation
creates the expected invoice. Keep a legacy fixture whose invoice still points
to its original `rent_policy_version_id`.

- [ ] **Step 2: Write failing backfill/reconciliation tests**

For each historical billing term, resolve the policy effective on
`effective_from`, copy its rules, and assert pre/post generator results match for
representative full, short-month, partial-first, partial-final, and mid-period
change cases. When an active billing term lacks resolvable legacy authority,
assert it becomes `pending_confirmation` and does not generate automatically.

- [ ] **Step 3: Verify tests fail under global policy authority**

```powershell
npx supabase test db --local supabase/tests/lease_rent_rules_test.sql supabase/tests/lease_derived_rent_generation_test.sql supabase/tests/rent_policy_contract_test.sql
npx vitest run src/features/leases/components/lease-detail-screen.test.tsx
```

- [ ] **Step 4: Add rule fields and backfill before changing resolution**

Run `npx supabase migration new lease_owned_rent_rules` and edit only the
generated file.

Add nullable columns, backfill from the exact legacy policy, validate every
active billing term, then set columns `NOT NULL`. When no policy resolves, write
the documented V1 values with `rent_rule_source='pending_confirmation'` and
`rent_generation_enabled=false`. Surface a Lease-level `Confirm rent behavior`
action; do not silently enable historical charges. Do not delete or rewrite any
legacy policy or generated invoice.

- [ ] **Step 5: Change readiness and generation resolution**

Modify `resolve_lease_rent_readiness`, `generate_lease_rent_invoice`, the due
runner, activation catch-up, and retry/recovery paths to use the effective
`lease_billing_terms` rule fields and block `pending_confirmation` rows with a
typed visible reason. Update invoice provenance so:

```sql
legacy generated invoice => rent_policy_version_id is not null
lease_v1 generated invoice => rent_rule_contract_version = 'lease_v1'
```

Both paths must snapshot enough fields to reproduce the amount.

- [ ] **Step 6: Create default billing authority with the Lease**

Extend the checked Lease creation transaction to create its first billing term:

```text
collection route: through IPS
billing recipient: primary tenant
management fee: flat 0
rule set: lease_v1
timezone: organizations.operational_timezone
```

Display these values in a compact `Rent behavior` summary on the Lease record.
Do not put them back into the first-create form.

- [ ] **Step 7: Retire global policy writes from ordinary UI**

Remove Rent policy from Settings and Finance Manager navigation. Make the old
route a read-only legacy notice with historical versions and no create/update/
approve controls. Keep checked functions and tables for compatibility until a
later explicit retirement plan.

- [ ] **Step 8: Verify and commit**

Run Step 3 commands plus `npm run db:lint` and `npm run db:types`, then:

```powershell
git add src/features/leases src/features/organization src/app/'(dashboard)'/settings/rent-policy supabase/migrations supabase/tests src/types/database.generated.ts
git commit -m "feat: make rent rules lease-owned"
```

### Task 5: Implement Activate today and scheduled activation

**Files:**
- Modify: `src/features/leases/actions.ts`
- Modify: `src/features/leases/actions.test.ts`
- Modify: `src/features/leases/components/lease-detail-view.tsx`
- Modify: `src/features/leases/components/lease-detail-screen.test.tsx`
- Modify: `src/features/leases/data/lease-summary.ts`
- Modify: `src/features/leases/lease.types.ts`
- Create via CLI: run `npx supabase migration new lease_activation_schedule`
  and edit the exact path printed by the command.
- Create: `supabase/tests/lease_activation_schedule_test.sql`

**Interfaces:**
- Produces:

```sql
public.activate_lease_now(
  p_organization_id uuid,
  p_lease_id uuid,
  p_expected_status text,
  p_idempotency_key text
) returns jsonb

public.schedule_lease_activation(
  p_organization_id uuid,
  p_lease_id uuid,
  p_activation_date date,
  p_idempotency_key text
) returns jsonb

public.cancel_lease_activation(
  p_organization_id uuid,
  p_lease_id uuid
) returns uuid

app_private.run_due_lease_activations(p_clock timestamptz default now())
returns jsonb
```

- [ ] **Step 1: Write failing UI tests**

Assert a Draft Lease offers `Activate today` and `Activate on date`; the date is
required only for scheduled mode; a scheduled Lease displays the date and
`Cancel scheduled activation`; and active Leases expose none of these controls.

- [ ] **Step 2: Write failing pgTAP and concurrency tests**

Cover workspace-date calculation, future-date validation, cancellation,
exactly-once activation under two runners, a typed failed schedule that remains
Draft, and activation catch-up creating at most one current rent charge.

- [ ] **Step 3: Verify focused failures**

```powershell
npx vitest run src/features/leases/actions.test.ts src/features/leases/components/lease-detail-screen.test.tsx
npx supabase test db --local supabase/tests/lease_activation_schedule_test.sql
```

- [ ] **Step 4: Add schedule state and checked RPCs**

Run `npx supabase migration new lease_activation_schedule` and edit only the
generated file.

Add Lease columns for scheduled date, scheduler, scheduled timestamp, activated
effective date, and last typed activation error. Lock the Lease row in every
transition. `activate_lease_now` derives today from
`organizations.operational_timezone`; the client never supplies server truth
for Today.

- [ ] **Step 5: Add the due runner**

Select due Draft Leases with `FOR UPDATE SKIP LOCKED`, call the same internal
activation function as immediate activation, record activity, and retain a safe
error code/message on failure. Schedule the runner with existing Supabase Cron
patterns; do not create a second external scheduler. Keep each Cron run bounded
well below ten minutes and add verification against `cron.job` and
`cron.job_run_details`.

- [ ] **Step 6: Verify and commit**

Run Step 3 commands plus the existing lifecycle and rent-generation pgTAP files,
then:

```powershell
git add src/features/leases supabase/migrations supabase/tests
git commit -m "feat: add immediate and scheduled lease activation"
```

### Task 6: Add canonical manual tenant charges

**Files:**
- Create: `src/features/finance-operations/components/manual-charge-form.tsx`
- Modify: `src/features/finance-operations/components/finance-operations-screen.tsx`
- Modify: `src/features/finance-operations/components/finance-operations-screen.test.tsx`
- Modify: `src/features/finance-operations/actions.ts`
- Modify: `src/features/finance-operations/actions.test.ts`
- Modify: `src/features/finance-operations/finance-operations.types.ts`
- Create via CLI: run `npx supabase migration new manual_tenant_charges` and
  edit the exact path printed by the command.
- Create: `supabase/tests/manual_tenant_charge_test.sql`

**Interfaces:**
- Produces:

```ts
export type ManualChargeType =
  | "rent"
  | "utility"
  | "cleaning"
  | "repairs_maintenance"
  | "other";
```

```sql
public.create_manual_tenant_charge(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_lease_id uuid,
  p_tenant_person_id uuid,
  p_charge_type text,
  p_issue_date date,
  p_due_date date,
  p_billing_period_start date,
  p_amount numeric,
  p_currency public.currency_code,
  p_description text,
  p_idempotency_key text
) returns jsonb
```

- [ ] **Step 1: Write failing action/component tests**

Assert contextual defaults are locked, Manual rent requires Lease and month,
other charges do not require a billing month, and exact server errors are shown
for duplicates, archived records, wrong tenant, wrong Property/Unit, and locked
months.

- [ ] **Step 2: Write failing database tests**

Assert one RPC atomically creates one tenant invoice, one invoice line, and one
finance income item using existing identities. Assert idempotent retry returns
the original result, duplicate base rent is rejected, roles are enforced, and
the existing payment/allocation/reversal path can settle the new charge.

- [ ] **Step 3: Verify focused failures**

```powershell
npx vitest run src/features/finance-operations/actions.test.ts src/features/finance-operations/components/finance-operations-screen.test.tsx
npx supabase test db --local supabase/tests/manual_tenant_charge_test.sql
```

- [ ] **Step 4: Implement the checked RPC**

Run `npx supabase migration new manual_tenant_charges` and edit only the
generated file.

Map charge types to existing invoice line and income types:

```text
rent → line rent, income rent
utility → line utility, income utility_reimbursement
cleaning → line cleaning, income other
repairs_maintenance → line repairs_maintenance, income other
other → line other, income other
```

Use the canonical invoice number allocator, month lock, idempotency claim,
activity log, and existing settlement model. Do not create a Ledger event until
settlement because a charge is an obligation, not cash.

For every new or replaced `SECURITY DEFINER` function, set a safe empty
`search_path`, check `auth.uid()` and the capability-specific organization
predicate, `REVOKE ALL ... FROM PUBLIC, anon, authenticated`, then grant execute
only to the intended role. Run database advisors before committing.

- [ ] **Step 5: Implement the drawer and commit**

Add `Add charge` beside `Record payment` in Rent & Collections. Run Step 3 and
existing tenant-invoice collection tests, then:

```powershell
git add src/features/finance-operations supabase/migrations supabase/tests/manual_tenant_charge_test.sql
git commit -m "feat: add manual tenant charges"
```

### Task 7: Put scoped Finance inside Property and Unit records

**Files:**
- Create: `src/features/finance-context/finance-context.types.ts`
- Create: `src/features/finance-context/data/finance-context.ts`
- Create: `src/features/finance-context/data/finance-context.test.ts`
- Create: `src/features/finance-context/components/context-finance-panel.tsx`
- Create: `src/features/finance-context/components/context-finance-panel.test.tsx`
- Modify: `src/features/properties/data/property-detail.ts`
- Modify: `src/features/properties/components/property-detail-view.tsx`
- Modify: `src/features/properties/components/property-detail-screen.tsx`
- Modify: `src/features/properties/components/property-detail-screen.test.tsx`
- Modify: `src/features/units/data/units.ts`
- Modify: `src/features/units/data/unit-summary.ts`
- Modify: `src/features/units/components/unit-detail-view.tsx`
- Modify: `src/features/units/components/unit-detail-screen.test.tsx`
- Modify: `src/app/(dashboard)/properties/[propertyId]/account/page.tsx`

**Interfaces:**
- Consumes: canonical Finance loaders/actions and manual charge form from Task 6.
- Produces:

```ts
export type FinanceRecordContext = {
  propertyId: string;
  propertyLabel: string;
  unitId: string | null;
  unitLabel: string | null;
  leaseId: string | null;
  tenantPersonId: string | null;
};

export type ContextFinanceTab = "rent" | "expenses" | "owner_account";
```

- [ ] **Step 1: Write failing scoped-loader tests**

For a Property context, assert only that Property's invoices, expense
submissions, and owner position are returned. For a Unit context, assert rent
and expenses are Unit-filtered while owner-account data remains the parent
Property summary.

- [ ] **Step 2: Write failing component tests**

Assert Property and Unit Finance expose `Rent & charges`, `Expenses`, and
`Owner account`; actions open with locked context; Unit Owner account is
read-only and links to its parent Property; and empty states explain the next
action instead of linking users back to global Finance.

- [ ] **Step 3: Verify focused failures**

```powershell
npx vitest run src/features/finance-context src/features/properties/components/property-detail-screen.test.tsx src/features/units/components/unit-detail-screen.test.tsx
```

- [ ] **Step 4: Compose canonical loaders**

Extract reusable scoped query functions from `finance-operations/data` only
where needed. Keep role capability checks in the server route/actions. Do not
fetch the whole organization and filter sensitive Finance rows in the browser.

- [ ] **Step 5: Replace duplicate record surfaces**

Property navigation becomes Overview, Units or Lease (according to rental
structure), Finance, Maintenance, Files. Replace the separate Account route's
primary navigation role with `Finance → Owner account`, retaining the old URL as
a compatibility redirect. Keep Unit navigation Overview, Lease, Finance,
Maintenance, Files, but replace the read-only Ledger-only panel with the scoped
Finance tabs and actions.

- [ ] **Step 6: Verify and commit**

Run Step 3, existing Finance operation tests, and route tests, then:

```powershell
git add src/features/finance-context src/features/properties src/features/units src/app/'(dashboard)'/properties
git commit -m "feat: add property and unit finance workspaces"
```

### Task 8: Make global Finance secondary and move legacy tools

**Files:**
- Modify: `src/components/layout/app-shell.tsx`
- Modify: `src/components/layout/app-shell.test.tsx`
- Modify: `src/features/finance/components/finance-workspace-navigation.tsx`
- Modify: `src/features/finance/components/finance-workspace-navigation.test.tsx`
- Modify: `src/features/finance-operations/components/finance-operations-screen.tsx`
- Modify: `src/features/finance-operations/components/finance-operations-screen.test.tsx`
- Modify: `src/features/workspace-search/workspace-search.scopes.ts`
- Modify: `src/features/workspace-search/data/workspace-search.test.ts`
- Modify: `config/ui-route-coverage.json`

**Interfaces:**
- Consumes: existing `/finance`, `/rent-income`, `/bills-expenses`, `/balances`,
  `/petty-cash`, and `/ledger` routes.
- Produces: a portfolio-oriented global Finance surface and an Advanced finance
  compatibility section.

- [ ] **Step 1: Write failing navigation tests**

Assert primary Finance navigation contains Portfolio overview, Rent &
collections, Expenses, and Owner accounts. Assert Ledger and Petty cash are not
sidebar children and remain discoverable under an `Advanced finance` section
on `/finance` and through explicit command-palette labels.

- [ ] **Step 2: Verify failures**

```powershell
npx vitest run src/components/layout/app-shell.test.tsx src/features/finance/components/finance-workspace-navigation.test.tsx src/features/finance-operations/components/finance-operations-screen.test.tsx src/features/workspace-search/data/workspace-search.test.ts
```

- [ ] **Step 3: Reframe global Finance copy and navigation**

Rename the Super Admin landing to `Portfolio finance`. Keep Finance Manager
review and Finance Member submission workspaces role-specific. Add a restrained
Advanced finance section containing Ledger and Petty cash with their current
read-only/limited descriptions. Do not change route authorization.

- [ ] **Step 4: Update executable route coverage**

Keep `/ledger` and `/petty-cash` covered as protected routes even though they
are no longer primary navigation. Add Property/Unit Finance state coverage at
1440×900, 1280×800, narrow width, and 200% zoom.

- [ ] **Step 5: Verify and commit**

Run Step 2 plus `npm run test:ui-coverage`, then:

```powershell
git add src/components/layout src/features/finance src/features/finance-operations src/features/workspace-search config/ui-route-coverage.json
git commit -m "refactor: make global finance portfolio secondary"
```

### Task 9: Rebuild fixture stories and prove end-to-end migration safety

**Files:**
- Modify: `supabase/test-fixtures/baseline.sql`
- Modify: `supabase/tests/demo_seed_contract_test.sql`
- Modify: `scripts/test-fixture-roles.mjs`
- Modify: `docs/verification/track-5-rent-to-payment.md`
- Create: `docs/verification/property-workspace-lease-finance-simplification.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: one disposable, role-aware acceptance story and reconciliation
  evidence for release review.

- [ ] **Step 1: Add failing fixture assertions**

Require the local fixture to contain:

```text
one undecided zero-unit property
one single-space property with a property-level draft Lease
one multi-unit property with a Unit-level active Lease
one Lease scheduled for future activation
one automatic rent charge
one manual non-rent tenant charge
one paid expense and one owner-account movement
legacy Rent policy/invoice evidence retained
```

- [ ] **Step 2: Reset the local database and verify the fixture fails**

```powershell
npm run db:reset
npm run db:test:fixture
npx supabase test db --local supabase/tests/demo_seed_contract_test.sql
```

- [ ] **Step 3: Update the fixture through checked contracts**

Prefer checked RPC calls or deterministic inserts already accepted by the local
fixture contract. Do not insert derived Ledger or report rows directly.

- [ ] **Step 4: Run the database and application release gates**

```powershell
npm run db:lint
npm run db:types
npx supabase db advisors --local
npx supabase test db --local supabase/tests
npm run test:fixture-roles
npx tsc --noEmit
npm run lint
npm run test:all
npm run test:ui-copy
npm run test:ui-coverage
npm run build
```

Expected: every command exits 0; generated types have no uncommitted drift.

- [ ] **Step 5: Run authenticated browser acceptance**

Using the disposable local fixture, verify:

```text
Create Property → choose whole property → create tenant inline → create Lease
→ activate today → open Property Finance → find rent charge → record payment

Create Property → choose separate units → add Unit → create Lease from Unit
→ schedule activation → run due scheduler → find charge in Unit Finance

Add manual Utility charge → collect payment → inspect owner-account effect

Open global Finance → confirm portfolio-wide results
Open Advanced finance → confirm Ledger and Petty cash remain accessible
```

Check 1440×900, 1280×800, narrow mobile width, keyboard-only operation, focus
return, announced validation, and 200% zoom without document-level horizontal
overflow.

- [ ] **Step 6: Reconcile historical financial outputs**

Before and after the migration, compare counts and totals for generated tenant
invoices, invoice lines, income items, receipts, allocations, owner-account
entries, Ledger entries, Unit P&L, Monthly Owner Activity, and official Owner
Statement artifacts. Any unexplained difference blocks release.

- [ ] **Step 7: Commit verification evidence**

```powershell
git add supabase/test-fixtures supabase/tests scripts/test-fixture-roles.mjs docs/verification
git commit -m "test: verify simplified property operating flow"
```

### Task 10: Release in two compatibility stages

**Files:**
- Modify: `docs/runbooks/ips-production-release.md`
- Modify: `docs/verification/property-workspace-lease-finance-simplification.md`

**Interfaces:**
- Consumes: a clean exact-head branch with all Task 9 evidence.
- Produces: staged hosted release evidence without deleting compatibility data.

- [ ] **Step 1: Define Stage A**

Stage A ships additive schema, backfill, dual legacy/new invoice provenance,
property/unit context, and new UI. Legacy Rent policy functions and routes remain
present but ordinary writes/navigation are retired.

- [ ] **Step 2: Verify linked database dry run and parity**

Use the repository's Supabase skill/runbook. At minimum record migration list,
linked dry run, database lint, generated-type parity, branch SHA, remote SHA,
CI, and deployment SHA. Never infer hosted readiness from local tests.

- [ ] **Step 3: Execute hosted smoke without destructive data changes**

Verify public and protected route behavior, authenticated read paths for the
available roles, scheduler/log health, and one explicitly authorized disposable
Lease story. Do not alter production business records merely to complete the
checklist.

- [ ] **Step 4: Hold Stage B retirement**

Only after at least one complete billing cycle and reconciliation signoff may a
separate plan revoke legacy Rent policy write functions or remove the old route.
Dropping policy tables, invoice references, Ledger, or Petty cash is out of scope
for this plan.

- [ ] **Step 5: Commit the release runbook**

```powershell
git add docs/runbooks/ips-production-release.md docs/verification/property-workspace-lease-finance-simplification.md
git commit -m "docs: add staged simplification release gate"
```

## Self-review Checklist

- [ ] Every design-spec requirement maps to Tasks 1–10.
- [ ] No task creates a fake Unit or a second Finance settlement model.
- [ ] Property-only and Unit-level overlap protection are both database-owned.
- [ ] New rent generation has no global Rent policy prerequisite.
- [ ] Historical policy and invoice provenance remain readable.
- [ ] Scheduled activation uses one checked internal activation path.
- [ ] Contextual Finance queries are server-scoped.
- [ ] Manual charges settle through canonical invoice/payment contracts.
- [ ] Ledger and Petty cash are moved, not deleted.
- [ ] Release evidence distinguishes local, linked-database, CI, deployment, and
  authenticated hosted verification.
