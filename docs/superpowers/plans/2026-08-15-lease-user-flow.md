# Lease User Flow Implementation Plan

> **Superseded in part on 2026-08-17.** Completed task-first vocabulary and
> lifecycle work remains valid. Constraints that prohibit schema changes,
> retain a competing global Lease create flow, or require a global Rent policy
> are replaced by the Property Workspace, Lease, and Finance Simplification
> implementation plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace database-oriented Lease controls and vocabulary with task-specific operator workflows without changing database authority.

**Architecture:** Keep the existing Lease loaders, summaries, server actions, and RPCs. Adapt only the React presentation and form composition so draft editing and active lifecycle actions are separate, and translate term, deposit, and occupancy data into user-facing labels at the component boundary.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, Vitest, Testing Library, Supabase checked RPCs.

**Spec:** `docs/superpowers/specs/2026-08-15-lease-user-flow-design.md`

## Global Constraints

- Do not change migrations, generated database types, RPC signatures, or RLS.
- Do not expose lease status, term status, evidence state, or deposit event enums as operator controls or primary labels.
- Keep Lease creation in one drawer; do not add a wizard.
- Every production behavior change starts with a focused failing test.
- Do not mutate production data during browser verification.

---

### Task 1: Task-specific lease editing and lifecycle actions

**Files:**
- Modify: `src/features/leases/components/lease-detail-screen.tsx`
- Modify: `src/features/leases/components/lease-detail-view.tsx`
- Modify: `src/features/leases/components/lease-form.tsx`
- Test: `src/features/leases/components/lease-detail-screen.test.tsx`
- Test: `src/features/leases/components/lease-screen.test.tsx`

**Interfaces:**
- Consumes: `LeaseSummary.statusValue`, `transitionLeaseLifecycleAction`, `scheduleFutureRentTermAction`, and the existing checked create/update actions.
- Produces: draft-only `Edit draft`; active `Change rent`, `Renew lease`, `Record notice`, `Complete move-out`, and `Terminate lease` controls.

- [ ] **Step 1: Write failing interaction tests**

Assert that an active Lease record does not render `Edit lease`, `Status`, or `Term status`, and does render `Change rent` plus lifecycle actions. Assert that a draft renders `Edit draft` and `Activate lease`.

- [ ] **Step 2: Verify the tests fail**

Run: `npx vitest run src/features/leases/components/lease-detail-screen.test.tsx src/features/leases/components/lease-screen.test.tsx`

Expected: FAIL because the active record still exposes the generic edit workflow and old action labels.

- [ ] **Step 3: Implement the minimal task-specific UI**

Gate the edit drawer to draft leases, move rent changes to the existing scheduled-term modal, rename lifecycle copy, and remove status/term-status controls from the rendered form while preserving required hidden values for the checked action.

- [ ] **Step 4: Verify focused tests pass**

Run the same Vitest command and require zero failures.

### Task 2: Human-readable rent and deposit activity

**Files:**
- Modify: `src/features/leases/components/lease-detail-view.tsx`
- Test: `src/features/leases/components/lease-detail-screen.test.tsx`

**Interfaces:**
- Consumes: existing `lease.terms`, `lease.deposits`, `recordLeaseDepositEventAction`, and `reverseLeaseDepositEventAction`.
- Produces: `Rent schedule`, `Deposit activity`, action-oriented event labels, and sentence-style history rows.

- [ ] **Step 1: Write failing vocabulary tests**

Assert the rendered section contains `Deposit activity`, `Deposit received`, `Receipt or note`, `Save deposit activity`, and `Undo entry`, and excludes raw `received /` and `Record event` copy.

- [ ] **Step 2: Verify the tests fail**

Run: `npx vitest run src/features/leases/components/lease-detail-screen.test.tsx`

Expected: FAIL on the new user-facing labels.

- [ ] **Step 3: Implement display translators and copy**

Add small component-local helpers that map stored term and deposit enum values to operator labels. Keep hidden option values unchanged so the existing server action receives the same contract.

- [ ] **Step 4: Verify focused tests pass**

Run the same Vitest command and require zero failures.

### Task 3: Move-in and move-out language

**Files:**
- Modify: `src/features/leases/components/lease-detail-view.tsx`
- Modify: `src/features/leases/lease-detail-route.ts`
- Test: `src/features/leases/components/lease-detail-screen.test.tsx`
- Test: `src/features/leases/lease-detail-route.test.ts`

**Interfaces:**
- Consumes: existing `occupancies` summaries and `recordCurrentLeaseOccupancyEvidenceAction`.
- Produces: a stable `occupancy` route key with the visible label `Move-in & move-out`, plus `Planned dates`, `Confirmed dates`, and `Confirm move-in` copy.

- [ ] **Step 1: Write failing copy and navigation tests**

Assert the section link and details use user language while the route query remains `section=occupancy`.

- [ ] **Step 2: Verify the tests fail**

Run: `npx vitest run src/features/leases/components/lease-detail-screen.test.tsx src/features/leases/lease-detail-route.test.ts`

Expected: FAIL because the current label is `Occupancy` and the evidence vocabulary is still visible.

- [ ] **Step 3: Implement the copy boundary**

Change labels and prompts only; preserve route identifiers, form field names, server action calls, and stored evidence values.

- [ ] **Step 4: Verify focused tests pass**

Run the same Vitest command and require zero failures.

### Task 4: Create-flow hierarchy and release verification

**Files:**
- Modify: `src/features/leases/components/lease-form.tsx`
- Modify: `src/features/leases/components/lease-screen.tsx`
- Test: `src/features/leases/components/lease-screen.test.tsx`

**Interfaces:**
- Consumes: the existing one-drawer create action and option filtering.
- Produces: `Tenant and unit`, `Lease period`, `Rent and deposit`, and `Create draft lease` without changing submitted field names.

- [ ] **Step 1: Write failing create-flow tests**

Assert the single drawer uses the three operator sections and the primary action reads `Create draft lease`.

- [ ] **Step 2: Verify the tests fail**

Run: `npx vitest run src/features/leases/components/lease-screen.test.tsx`

Expected: FAIL because the current form groups fields as `Lease details` and saves with `Save draft`.

- [ ] **Step 3: Implement the create hierarchy**

Reorganize existing fields without adding steps, state, database calls, or new dependencies.

- [ ] **Step 4: Run release gates**

Run:

```text
npx vitest run src/features/leases/components/lease-detail-screen.test.tsx src/features/leases/components/lease-screen.test.tsx src/features/leases/lease-detail-route.test.ts
npx tsc --noEmit
npx eslint src/features/leases/components/lease-detail-screen.tsx src/features/leases/components/lease-detail-view.tsx src/features/leases/components/lease-form.tsx src/features/leases/components/lease-screen.tsx
npm run build
```

Expected: every command exits 0.

- [ ] **Step 5: Browser verification**

Verify desktop and mobile creation, draft actions, active actions, rent/deposit, and move-in/move-out against the authenticated local fixture. Verify production read-only after the user signs in.
