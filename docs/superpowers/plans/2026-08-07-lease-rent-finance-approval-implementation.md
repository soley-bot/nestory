# Lease-Derived Rent and Finance Approval Implementation Plan

> **Required execution skill:** Use `superpowers:executing-plans` to carry out this plan inline, one task at a time. Use `superpowers:test-driven-development` for every behavior change and the repository `supabase` skill for every database change.

**Goal:** Make lease terms the exclusive source of monthly rent, introduce the approved five-role authority model, require Finance review before human-entered costs affect finance, and hand maintenance costs into that same review queue without turning Nestory into a full accounting system.

**Architecture:** PostgreSQL remains the authority for roles, authorization, idempotency, money, period locks, rent generation, expense approval, and reversal. Next.js server contexts expose the same fixed capabilities and route all writes through checked RPCs. Rent invoices are generated from effective-dated lease authority by one private function called by activation catch-up, hourly Cron, and Super-Admin recovery. Human costs first enter a typed `expense_submissions` queue; approval atomically produces the existing operational finance records plus exact source-linked Ledger evidence.

**Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/PostgreSQL, pgTAP, Vitest/Testing Library, Supabase Cron (`pg_cron`).

**Safety boundary:** Work only in `D:\nestory\.worktrees\lease-rent-finance-approval`. Do not apply migrations to the linked hosted project, enable hosted Cron, invite users, merge, push, or deploy in this plan. Those remain explicit release checkpoints.

---

## Task 1: Replace the three-role model with fixed capabilities

**Files:**

- Create with `npx supabase migration new fixed_role_capabilities`: `supabase/migrations/*_fixed_role_capabilities.sql`
- Create: `supabase/tests/fixed_role_capabilities_test.sql`
- Modify: `src/lib/auth/context.ts`
- Modify: `src/lib/auth/workspace-entry.ts`
- Modify: `src/features/organization/invitation-actions.ts`
- Modify: `src/features/organization/components/access-settings-screen.tsx`
- Modify: `src/features/organization/components/access-settings-screen.test.tsx`
- Modify: `src/features/auth/invitation-acceptance.ts`
- Modify: `src/features/auth/invitation-acceptance.test.ts`
- Modify: route and navigation tests discovered by `rg -l 'admin|manager|member' src --glob '*test*'`

- [ ] **Step 1: Write failing database role tests.** Add pgTAP coverage that asserts the five allowed role codes, deterministic backfill mapping, one role per membership, role-specific invitation shape, final-Super-Admin protection, and the eight capability helpers for every role and a cross-organization actor. Assert `PUBLIC` cannot execute privileged helpers and direct membership DML remains unavailable.
- [ ] **Step 2: Prove the tests fail against the previous schema.** Start local Supabase if Docker is available and run `npx supabase test db supabase/tests/fixed_role_capabilities_test.sql --local`. Record Docker unavailability verbatim if local PostgreSQL cannot start; never substitute the linked database.
- [ ] **Step 3: Generate and implement the role migration.** Run `npx supabase migration new fixed_role_capabilities`. In the emitted migration, backfill invitations and memberships before replacing role constraints; add `is_super_admin`, `can_manage_access`, `can_configure_leases`, `can_read_finance`, `can_submit_expense`, `can_review_expense`, `can_reverse_expense`, `can_manage_operations`, and `can_execute_operations`; use fixed empty `search_path`, explicit grants, RLS-compatible `stable` helpers, and final-Super-Admin guards.
- [ ] **Step 4: Make finance reads capability-scoped.** Replace organization-member-wide `SELECT` policies on finance tables with `can_read_finance`; preserve operationally necessary lease/property context reads; revoke table DML that should only occur through RPCs. Add assertions for every changed table and view.
- [ ] **Step 5: Make application auth capability-driven.** Replace `WorkspaceRole = 'admin' | 'manager' | 'member'` with the five-role union and an exported capability object. Preserve a narrow `requireSuperAdminContext` alias for configuration routes while adding `requireFinanceContext`, `requireFinanceSubmissionContext`, `requireFinanceReviewContext`, and operations contexts. Update workspace landing and navigation expectations for all five roles.
- [ ] **Step 6: Update access management.** Restrict invitation/member management to Super Admin, expose only the five roles, require branch/person scope for operations roles where existing maintenance scoping requires it, and keep the final-Super-Admin invariant. Update invitation parsing and acceptance tests.
- [ ] **Step 7: Run focused verification.** Run the role pgTAP test when local Supabase is available, then `npx vitest run src/lib/auth src/features/auth src/features/organization src/app/\(dashboard\)/users-roles` and `npx tsc --noEmit`.
- [ ] **Step 8: Commit the role slice.** Review `git diff --check`, then commit with `git add ... && git commit -m "feat: add fixed workspace roles and capabilities"`.

## Task 2: Make lease-derived rent deterministic and automatic

**Files:**

- Create with `npx supabase migration new lease_derived_rent_generation`: `supabase/migrations/*_lease_derived_rent_generation.sql`
- Create: `supabase/tests/lease_derived_rent_generation_test.sql`
- Modify: `supabase/tests/tenant_invoice_collection_behavior_test.sql`
- Modify: `supabase/tests/rent_policy_contract_test.sql`
- Modify: `src/types/database.generated.ts` only through `npm run db:types`

- [ ] **Step 1: Write failing rent-authority tests.** Cover current-month activation catch-up, hourly scheduled generation, timezone-local business date, monthly frequency only, term boundaries, proration, recipient and collection route, management fee, exact provenance snapshots, duplicate replay, concurrent/alternate-key attempts, per-lease exception isolation, successful exception resolution, locked periods, and manual recovery authorization. Assert the generic income RPC rejects `rent` and the old batch generator is unavailable.
- [ ] **Step 2: Prove the new contract is absent.** Run `npx supabase test db supabase/tests/lease_derived_rent_generation_test.sql --local` when local Supabase is available and confirm the first missing contract is the expected failure.
- [ ] **Step 3: Generate and implement the rent migration.** Run `npx supabase migration new lease_derived_rent_generation`. Add provenance columns to `tenant_invoices`; add `rent_generation_exceptions` with one row per organization/lease/period; implement one private lease-month generator with advisory locks and the existing unique identity; add safe exception capture; add activation/current-month catch-up triggers or checked calls at the authoritative lease/billing mutation boundary; add Super-Admin recovery; and remove Data API execute access from private scheduling functions.
- [ ] **Step 4: Install the local Cron contract in migration code.** Ensure `pg_cron` is enabled by the migration and schedule a named hourly database job that calls the private due-rent runner. Make the schedule idempotent and ownership-explicit. The runner iterates approved policy timezones and isolates each lease so one failure cannot abort the batch.
- [ ] **Step 5: Retire independent rent creation.** Replace the generic income RPC contract so `income_type = 'rent'` fails with safe product language; revoke/drop the legacy active-lease batch path after dependent application code is updated.
- [ ] **Step 6: Verify database behavior.** Run the new rent pgTAP file plus `tenant_invoice_collection_behavior_test.sql`, `lease_billing_terms_behavior_test.sql`, and `rent_policy_contract_test.sql`; run `npm run db:lint`; generate types with `npm run db:types` only after a successful local reset.
- [ ] **Step 7: Commit the rent database slice.** Run `git diff --check` and commit with `git commit -m "feat: generate rent from lease authority"`.

## Task 3: Expose rent status and recovery without accounting jargon

**Files:**

- Modify: `src/features/leases/data/leases.ts`
- Modify: `src/features/leases/data/rent-policy.ts`
- Modify: `src/features/leases/actions.ts`
- Modify: `src/features/leases/components/lease-screen.tsx`
- Modify: `src/features/leases/components/lease-screen.test.tsx`
- Modify: `src/features/leases/components/rent-policy-screen.tsx`
- Modify: `src/features/leases/components/rent-policy-screen.test.tsx`
- Modify: `src/features/finance-operations/data/finance-operations.ts`
- Modify: `src/features/finance-operations/finance-operations.types.ts`
- Modify: route tests for `/rent-income`, `/leases`, and `/settings/rent-policy`

- [ ] **Step 1: Write failing UI/action tests.** Assert no legacy `Generate rent` batch control remains; Super Admin can retry one typed generation exception; Finance roles can read exception status but cannot retry; no raw UUID or journal/month-close wording reaches UI; invoice rows expose source lease/month and generated status.
- [ ] **Step 2: Add typed loaders and recovery action.** Load rent exceptions through finance-capable server context; implement a Super-Admin-only action calling the checked recovery RPC; return stable field errors and safe operator messages.
- [ ] **Step 3: Replace the legacy lease control.** Show automatic-generation status and configuration prerequisites on lease/rent-policy surfaces. Add a compact exception queue with a per-row retry visible only to Super Admin.
- [ ] **Step 4: Run focused tests.** Run `npx vitest run src/features/leases src/features/finance-operations src/app/\(dashboard\)/rent-income` and `npx tsc --noEmit`.
- [ ] **Step 5: Commit the rent application slice.** Run `git diff --check` and commit with `git commit -m "feat: surface automatic rent generation"`.

## Task 4: Add the expense submission, review, and reversal boundary

**Files:**

- Create with `npx supabase migration new finance_expense_approval`: `supabase/migrations/*_finance_expense_approval.sql`
- Create: `supabase/tests/finance_expense_approval_test.sql`
- Modify: `supabase/tests/ips_expense_responsibility_behavior_test.sql`
- Modify: `supabase/tests/finance_inventory_authorization_test.sql`
- Modify: `src/types/database.generated.ts` only through `npm run db:types`

- [ ] **Step 1: Write failing workflow tests.** Cover Finance Member and Super-Admin submission; Finance-Manager/Super-Admin review; Super-Admin-only reversal; deny wrong role and cross-organization access; validate exact money, category, responsibility, source document, period, and idempotency. Assert submission and rejection create zero finance, cash, Ledger, journal, owner, or tenant effects.
- [ ] **Step 2: Specify atomic approval evidence in tests.** For owner and tenant responsibility, assert one approved source expense, payment/allocation, responsibility/charge, exact `payment_allocation` Ledger entry and journal link, activity, and submission links. Cover replay, concurrent review, rollback on downstream failure, and locked-period behavior.
- [ ] **Step 3: Specify complete reversal in tests.** Assert Super-Admin reversal appends opposite payment/allocation, Ledger/journal, responsibility and owner/tenant effects; leaves originals immutable; rejects a second reversal; and fails closed when downstream settlement prevents an exact correction.
- [ ] **Step 4: Generate and implement the migration.** Run `npx supabase migration new finance_expense_approval`. Add `expense_submissions` and constrained statuses/source types; revoke direct DML; add capability-scoped RLS; implement checked `submit_expense`, `review_expense`, and `reverse_expense` RPCs with fixed empty `search_path`, payload-bound idempotency, row/advisory locks, period-lock checks, and transactional calls into narrowly refactored private financial helpers.
- [ ] **Step 5: Preserve compatibility without bypass.** Make the active direct-paid-expense RPC private or reject external calls; retain read compatibility for existing finance projections; ensure all new approved records carry the submission source identity used by Ledger and diagnostics.
- [ ] **Step 6: Verify database behavior.** Run the new workflow pgTAP file plus `ips_expense_responsibility_behavior_test.sql`, `finance_inventory_authorization_test.sql`, `finance_settlement_activity_logging_test.sql`, and relevant accounting compatibility tests; run `npm run db:lint`; regenerate types after a successful local reset.
- [ ] **Step 7: Commit the expense database slice.** Run `git diff --check` and commit with `git commit -m "feat: require finance approval for expenses"`.

## Task 5: Make Finance surfaces role-aware

**Files:**

- Modify: `src/app/(dashboard)/finance/page.tsx`
- Modify: `src/app/(dashboard)/bills-expenses/page.tsx`
- Modify: other finance route pages currently using `requireAdminContext`
- Modify: `src/features/finance-operations/actions.ts`
- Modify: `src/features/finance-operations/actions.test.ts` (create if absent)
- Modify: `src/features/finance-operations/data/finance-operations.ts`
- Modify: `src/features/finance-operations/finance-operations.types.ts`
- Modify: `src/features/finance-operations/components/finance-operations-screen.tsx`
- Modify: `src/features/finance-operations/components/finance-operations-screen.test.tsx`
- Modify: `src/features/finance/components/finance-workspace-navigation.tsx`
- Modify: shell/navigation/route-coverage tests that encode finance visibility

- [ ] **Step 1: Write failing action and component tests.** Finance Member sees and can submit `Add expense`, but never review controls. Finance Manager sees submitted rows and approve/reject controls, but cannot submit or reverse. Super Admin can perform all authorized operations. Operations roles cannot load Finance. Rejection requires a reason; locked-period and idempotent replay messages are safe.
- [ ] **Step 2: Replace admin-only route guards.** Use `requireFinanceContext` on read routes and pass explicit capability flags into server components. Keep settings, period lock/unlock, and reversal Super-Admin-only.
- [ ] **Step 3: Replace the immediate-paid action.** Parse a typed submission form and call `submit_expense`; add review and reversal actions with independent schemas, stable result types, cache revalidation, and no client-supplied organization or reviewer authority.
- [ ] **Step 4: Rework the expense screen.** Separate `Awaiting approval`, `Approved`, `Rejected`, and `Reversed` records. Show actions only from server-provided capabilities, require rejection/reversal reasons, and retain operational wording rather than accounting-close terminology.
- [ ] **Step 5: Run focused tests.** Run `npx vitest run src/features/finance-operations src/features/finance src/app/\(dashboard\)/finance src/app/\(dashboard\)/bills-expenses src/lib/auth` and `npx tsc --noEmit`.
- [ ] **Step 6: Commit the Finance application slice.** Run `git diff --check` and commit with `git commit -m "feat: add finance expense review workspace"`.

## Task 6: Hand maintenance costs to Finance approval

**Files:**

- Create with `npx supabase migration new maintenance_cost_handoff`: `supabase/migrations/*_maintenance_cost_handoff.sql`
- Create: `supabase/tests/maintenance_cost_handoff_test.sql`
- Modify: `supabase/tests/maintenance_role_workflow_test.sql`
- Modify: `src/features/maintenance/maintenance.types.ts`
- Modify: `src/features/maintenance/maintenance.capabilities.ts`
- Modify: `src/features/maintenance/maintenance.capabilities.test.ts`
- Modify: `src/features/maintenance/data/maintenance.ts`
- Modify: `src/features/maintenance/data/maintenance.test.ts`
- Modify: `src/features/maintenance/actions.ts`
- Modify: `src/features/maintenance/actions.test.ts`
- Modify: `src/features/maintenance/components/maintenance-workflow-panel.tsx`
- Modify: `src/features/maintenance/components/maintenance-workflow-panel.test.tsx`
- Modify: `src/features/maintenance/components/maintenance-screen.tsx`
- Modify: `src/features/maintenance/components/maintenance-workspace-ui.test.tsx`

- [ ] **Step 1: Write failing handoff tests.** Assert Operations Manager/Super Admin can submit a maintenance task's actual cost once, Operations Member cannot, submitted fields lock, operational completion stays independent, rejection exposes a safe reason and permits corrected resubmission, and Finance approval creates exactly one task-linked approved expense.
- [ ] **Step 2: Generate and implement the migration.** Run `npx supabase migration new maintenance_cost_handoff`. Add the one-active-submission-per-task invariant and a checked maintenance submission RPC that snapshots task scope/cost/vendor/date/evidence into `expense_submissions` without financial effects. Retire the immediate `post_actual_cost_to_ledger` write path while retaining read compatibility for historic rows.
- [ ] **Step 3: Add maintenance server behavior.** Extend the loader with submission status/reason and capability flags; add `Submit cost to Finance`; forbid cost-field edits while submitted/approved; permit correction after rejection; remove the immediate `Link actual cost to ledger` control and payload.
- [ ] **Step 4: Keep reporting semantics explicit.** Maintenance may display recorded operational cost before approval. Finance/NOI loaders must select only approved submissions or the approved finance records created from them; add a regression assertion for that boundary.
- [ ] **Step 5: Run focused verification.** Run the new pgTAP file plus `maintenance_role_workflow_test.sql` when local Supabase is available; run `npx vitest run src/features/maintenance src/app/\(dashboard\)/maintenance`; run `npx tsc --noEmit`.
- [ ] **Step 6: Commit the handoff slice.** Run `git diff --check` and commit with `git commit -m "feat: submit maintenance costs for finance review"`.

## Task 7: Reconcile documentation, generated contracts, and full verification

**Files:**

- Modify: `PROJECT.md`
- Modify: `config/ui-route-coverage.json`
- Modify: `src/types/database.generated.ts`
- Modify: any focused test fixtures still using `admin`, `manager`, or `member`

- [ ] **Step 1: Update `PROJECT.md` to runtime truth.** Replace the three-role matrix, manual rent-generation limitation, immediate paid-expense description, and maintenance-ledger flag. State that rent is lease-derived/current-month automatic, expenses require Finance approval, Operations submits maintenance cost, and Finance remains operational rather than a full accounting or period-close product.
- [ ] **Step 2: Update route contracts and fixtures.** Align navigation/route coverage with the five roles, automatic rent status, and Finance review surfaces. Remove stale role and `Plan 09` copy from user-visible paths.
- [ ] **Step 3: Generate and inspect database types.** After `npx supabase db reset --local --no-seed`, run `npm run db:types`; inspect the diff for the five roles, rent provenance/exceptions, expense submissions, and RPC signatures. Never hand-edit generated output.
- [ ] **Step 4: Run database verification.** Run `npx supabase test db --local`, `npm run db:lint`, and the finance/lease concurrency scripts against local Supabase where applicable. If Docker is unavailable, preserve that as a named verification gap and do not use the linked project.
- [ ] **Step 5: Run application verification.** Run `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run test:demo-tools`, `npm run test:ui-copy`, `npm run test:ui-coverage`, and `npm run build`.
- [ ] **Step 6: Inspect the final diff and security boundary.** Run `git diff --check`, search for stale role literals with `rg "\b(admin|manager|member)\b" src supabase/tests config PROJECT.md`, inspect every new privileged function for fixed `search_path` and revoked `PUBLIC`, and inspect every new public table for explicit grants plus RLS.
- [ ] **Step 7: Commit the documentation and verification slice.** Commit with `git commit -m "docs: align project contract with finance workflows"`. Report exact branch, HEAD, tests passed/blocked, and the untouched production/release checkpoints.

## Release follow-up (not authorized by this plan)

- [ ] Apply migrations to a disposable/staging Supabase project and rerun all pgTAP and authenticated role smokes.
- [ ] Review the current-period rent eligibility dry run and exception queue.
- [ ] Apply migrations to linked production in order, then verify grants, RLS, roles, and data backfill.
- [ ] Confirm the named Cron job executes successfully before inviting non-Super-Admin staff.
- [ ] Deploy the exact verified commit and run authenticated browser smoke for all five identities.

