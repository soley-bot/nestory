# Property, Unit, And Lease Workflow Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the shared form failure/retry contract and turn Property -> Unit -> Lease into a truthful, task-first operator workflow.

**Architecture:** Keep Supabase, checked server actions, existing loaders, and the current task-first Lease record. Fix failure retention once in `RecordForm`, standardize database-ID validation, then derive and render one canonical next action at each record boundary. No schema change is required.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, Zod 4, Vitest, Testing Library, Supabase checked RPCs.

**Spec:** `docs/superpowers/specs/2026-08-15-property-unit-lease-workflow-repair-design.md`

## Global Constraints

- Do not change migrations, generated database types, seed data, RPC signatures, RLS, or organization scoping.
- Do not mutate production or persistent local records during browser verification.
- Preserve the existing single-drawer, task-first Lease design; do not add a wizard or generic workflow engine.
- Every production behavior change starts with a focused failing test and an observed failure.
- Use the shared record form and shared UUID-shaped schema rather than feature-local copies.
- Remove legacy controls only after tests cover the surviving canonical action.
- Commit each implementation task separately and keep the branch local until the user authorizes a push or merge.

---

### Task 1: Preserve form input and expire stale field errors

**Files:**
- Modify: `src/components/ui/record-form.tsx`
- Modify: `src/features/people/components/person-select.tsx`
- Test: `src/components/ui/record-form-contract.test.tsx`
- Test: `src/features/people/components/person-select.test.tsx`

**Interfaces:**
- Consumes: the dispatcher returned by `useActionState`, native `FormData`, bubbling `input` and `change` events, and `RecordFormActionState.fieldErrors`.
- Produces: a no-reset failure/retry form boundary and field-local expiration of response errors.

- [ ] **Step 1: Write a failing real-action harness**

Render a component that calls `useActionState` with an asynchronous action returning `status: "error"` plus at least two field errors. Type values into multiple fields, submit, await the response, and assert that every value is preserved. Change one field and assert that its old error and `aria-invalid` clear while the untouched field error remains. Resubmit and assert one action call plus a fresh error response.

- [ ] **Step 2: Verify the contract test fails**

Run: `npx vitest run src/components/ui/record-form-contract.test.tsx`

Expected: FAIL because the native function action resets uncontrolled inputs after the fulfilled error response and field errors remain response-global.

- [ ] **Step 3: Implement the shared submission boundary**

Narrow `RecordFormProps.action` to a `FormData` dispatcher. Intercept submit, snapshot `new FormData(form)`, and dispatch it inside `startTransition` so React pending semantics remain intact without the native action reset. Retain browser constraint validation, keyboard submission, feedback focus, dirty detection, and duplicate-submit protection.

- [ ] **Step 4: Implement field-local response-error expiry**

Create a private Record Form context provided by `RecordForm` and consumed by `RecordField`. The form's bubbling `input`/`change` handler records `event.target.name` when it is non-empty. Have `RecordField` suppress only errors for a recorded field name. Reset the edited-name set when a new response completes so a newly returned error can appear again.

- [ ] **Step 5: Make `PersonSelect` participate in the contract**

Dispatch a bubbling input event from its hidden relationship input when its value changes, matching the existing custom select/date controls. Add a focused test proving the event reaches the form.

- [ ] **Step 6: Verify focused form tests pass**

Run: `npx vitest run src/components/ui/record-form-contract.test.tsx src/features/people/components/person-select.test.tsx`

Expected: PASS with zero failures.

### Task 2: Align Lease actions with PostgreSQL fixture identifiers

**Files:**
- Create: `src/lib/validation/postgres-uuid.ts`
- Modify: `src/features/leases/actions.ts`
- Modify: `src/features/leases/lease-action-input.ts`
- Modify: `src/features/properties/actions.ts`
- Modify: `src/features/units/actions.ts`
- Test: `src/features/leases/actions.test.ts`
- Test: `src/features/leases/lease-action-input.test.ts`
- Test: `src/features/properties/actions.test.ts`
- Test: `src/features/units/actions.test.ts`
- Test: `src/lib/validation/postgres-uuid.test.ts`

**Interfaces:**
- Consumes: UUID-shaped PostgreSQL identifiers from form data and deterministic local fixtures.
- Produces: one Zod schema factory used by Property, Unit, and every Lease create/lifecycle/occupancy/deposit/reversal/rent-policy identifier check.

- [ ] **Step 1: Add failing identifier-boundary tests**

Use deterministic zero-version UUID-shaped values such as `10000000-0000-0000-0000-000000000001` in Lease create and representative lifecycle/deposit actions. Assert that valid form data reaches the mocked checked RPC. Cover future rent-term parsing with deterministic Lease and superseded-term IDs. Add schema tests that accept both deterministic fixture IDs and versioned UUIDs and reject malformed values.

- [ ] **Step 2: Verify the Lease action tests fail for fixture IDs**

Run: `npx vitest run src/features/leases/actions.test.ts src/features/leases/lease-action-input.test.ts src/lib/validation/postgres-uuid.test.ts`

Expected: FAIL before RPC invocation because `z.uuid()` rejects deterministic fixture identifiers.

- [ ] **Step 3: Create and adopt the shared schema**

Implement the helper with Zod's UUID-shaped GUID validation and a caller-provided message. Replace every database-ID `z.uuid()` check in Lease actions and Lease action-input parsing, then replace the equivalent Property local GUID and Unit regular-expression helpers without changing returned field-error keys.

- [ ] **Step 4: Verify all action tests pass**

Run: `npx vitest run src/features/leases/actions.test.ts src/features/leases/lease-action-input.test.ts src/features/properties/actions.test.ts src/features/units/actions.test.ts src/lib/validation/postgres-uuid.test.ts`

Expected: PASS with checked RPC argument assertions unchanged except for newly accepted fixture IDs.

### Task 3: Expose a truthful Property next action and financial period

**Files:**
- Modify: `src/features/properties/components/property-detail-view.tsx`
- Modify: `src/features/properties/components/property-inspector.tsx`
- Test: `src/features/properties/components/property-detail-screen.test.tsx`
- Test: `src/features/properties/components/property-screen.test.tsx`

**Interfaces:**
- Consumes: existing `PropertyDetail.nextAction`, `healthIndicators`, `financialSummary.periodLabel`, `financialSummary.noiDisplay`, and cumulative `netIncome`.
- Produces: one actionable handoff, limited visible alerts, and unambiguous period labels.

- [ ] **Step 1: Replace the legacy-negative assertions with failing workflow assertions**

Assert that the detail overview renders the next-action link and its explanation, renders warning/danger indicators without duplicating informational noise, and labels period-specific NOI with `financialSummary.periodLabel`. Assert that any cumulative inspector metric is labeled `Ledger net (all time)`.

- [ ] **Step 2: Verify focused Property tests fail**

Run: `npx vitest run src/features/properties/components/property-detail-screen.test.tsx src/features/properties/components/property-screen.test.tsx`

Expected: FAIL because the detail view currently hides `nextAction` and labels a cumulative value `Net income`.

- [ ] **Step 3: Render the canonical Property handoff**

Add a compact overview callout using the existing next-action tone, label, description, and href. Show only actionable warning/danger health indicators nearby. Do not add another form or duplicate the downstream Unit/Lease UI.

- [ ] **Step 4: Clarify financial time range**

Render the existing period-specific NOI with its period label on the detail record. If cumulative `netIncome` remains in the register or inspector, rename it to `Ledger net (all time)`.

- [ ] **Step 5: Verify focused Property tests pass**

Run the same Vitest command and require zero failures.

### Task 4: Separate Unit readiness from Lease state

**Files:**
- Modify: `src/features/units/unit.types.ts`
- Modify: `src/features/units/data/units.ts`
- Modify: `src/features/units/data/unit-summary.ts`
- Modify: `src/features/units/components/unit-screen.tsx`
- Modify: `src/features/units/components/units-table.tsx`
- Modify: `src/features/units/components/unit-inspector.tsx`
- Modify: `src/features/units/components/unit-detail-screen.tsx`
- Test: `src/features/units/data/unit-summary.test.ts`
- Test: `src/features/units/components/unit-screen.test.ts`
- Test: `src/features/units/components/unit-detail-screen.test.tsx`

**Interfaces:**
- Consumes: stored Unit status, already-loaded current/draft Lease rows, Unit detail hrefs, and the existing `repairAction` model.
- Produces: explicit operational readiness plus Lease state and one correctly prioritized handoff.

Add these contracts in `unit.types.ts`:

```ts
export type UnitOperationalReadiness = "available" | "maintenance" | "inactive";
export type UnitLeaseReadiness = "none" | "draft" | "occupied";
export type UnitReadiness = {
  operational: UnitOperationalReadiness;
  lease: UnitLeaseReadiness;
  canStartLease: boolean;
};
```

`UnitSummary` exposes `readiness` and optional `draftLease`; `UnitDetail` keeps `activeLease`. Stored `maintenance` and `inactive` map directly; legacy `vacant`, `occupied`, and `reserved` all map to operational `available` while `statusValue` remains visible for mismatch diagnostics. Lease-state precedence is active/notice-given -> `occupied`, otherwise newest draft by descending `lease_start_date` then stable ID -> `draft`, otherwise `none`. `canStartLease` is true only for operational `available` plus Lease `none`.

- [ ] **Step 1: Write failing readiness and priority tests**

Cover available/no Lease, available/draft, available/occupied, maintenance/no Lease, inactive/no Lease, and maintenance/draft combinations. Assert that maintenance/inactive repair outranks Lease creation, a draft links to the exact Lease as `Continue draft`, and only available/no Lease yields `Create draft lease`.

- [ ] **Step 2: Verify focused Unit tests fail**

Run: `npx vitest run src/features/units/data/unit-summary.test.ts src/features/units/components/unit-screen.test.ts src/features/units/components/unit-detail-screen.test.tsx`

Expected: FAIL because the current repair action recommends adding a Lease before resolving maintenance and only models an active Lease.

- [ ] **Step 3: Derive readiness from already-loaded rows**

Add typed operational and Lease readiness to the Unit summary/detail. Extend `buildUnitSummary` and `buildUnitDetail` to accept `activeLease` and `draftLease`. Add `selectNewestDraftLease`, and have both list and detail loaders select current and draft records from the same already-loaded `current_leases` rows. Preserve `statusValue`, `hasActiveLease`, and linked Lease identifiers for compatibility and mismatch diagnostics.

- [ ] **Step 4: Reorder and render the canonical next action**

Prioritize maintenance/inactive repair, then draft continuation, then vacancy creation, then the occupied-record action. Display operational readiness and Lease state as separate text in the list, inspector, and record. Link draft continuation to `/leases/{leaseId}`.

- [ ] **Step 5: Remove only a proven duplicate vacancy control**

If the selected-row header and the inspector both render the same creation handoff after the canonical action is visible, delete the duplicate header action while preserving URL filters and deep links.

- [ ] **Step 6: Verify focused Unit tests pass**

Run the same Vitest command and require zero failures.

### Task 5: Preserve Lease placement and provide explicit handoffs

**Files:**
- Modify: `src/features/leases/components/lease-form.tsx`
- Modify: `src/features/leases/components/lease-screen.tsx`
- Modify: `src/features/leases/components/lease-inspector.tsx`
- Modify: `src/components/layout/app-shell.tsx`
- Test: `src/features/leases/components/lease-screen.test.tsx`
- Test: `src/components/layout/app-shell.test.tsx`

**Interfaces:**
- Consumes: Lease start/end dates, property/unit availability options, create action success state with `leaseId`, `LeaseSummary.nextAction.href`, and role capabilities.
- Produces: explained availability prerequisites, selection-preserving date changes, `Open draft`, linked next action, and Finance Manager Lease navigation.

- [ ] **Step 1: Write failing Lease interaction tests**

Assert that placement explains why controls are disabled before both dates are valid. Change a date and assert a still-eligible Property and Unit remain selected; assert only an ineligible Unit is cleared. Return a successful create state and assert the drawer stays in a saved state with an `Open draft` link. Assert the inspector's next action uses its href.

- [ ] **Step 2: Write the failing navigation test**

Assert that Finance Manager navigation contains `Leases` while Finance Member navigation remains submission-only.

- [ ] **Step 3: Verify focused tests fail**

Run: `npx vitest run src/features/leases/components/lease-screen.test.tsx src/components/layout/app-shell.test.tsx`

Expected: FAIL because date changes currently clear placement unconditionally, creation closes without the saved handoff, next action is plain text, and Finance Manager has no Lease destination.

- [ ] **Step 4: Implement placement preservation and explanation**

Derive eligibility for the complete term. Preserve both selections if still eligible, clear only Unit when another eligible Unit remains in the Property, and clear both only when no eligible Unit remains. Place concise prerequisite copy next to the disabled controls.

- [ ] **Step 5: Implement saved and linked handoffs**

Keep create success visible and link `Open draft` to `/leases/{leaseId}`; retain existing edit-success close behavior. Render `nextAction` as a link when it has an href and expose existing related Property/Unit links without duplicating the full records.

- [ ] **Step 6: Add Finance Manager discoverability**

Add Leases to Finance Manager's Finance children. Do not broaden Finance Member navigation or authorization.

- [ ] **Step 7: Verify focused tests pass**

Run the same Vitest command and require zero failures.

### Task 6: Integrated regression and authenticated acceptance

**Files:**
- Modify only if verification exposes a regression: the smallest owning file from Tasks 1-5 plus its focused test.
- Record evidence: `.codex-artifacts/property-unit-lease-workflow-repair-2026-08-15/`

**Interfaces:**
- Consumes: the completed shared form, action, Property, Unit, Lease, and navigation contracts.
- Produces: repository checks and a read-only browser evidence set.

- [ ] **Step 1: Run the integrated focused suite**

Run: `npx vitest run src/components/ui/record-form-contract.test.tsx src/features/people/components/person-select.test.tsx src/features/leases/actions.test.ts src/features/leases/lease-action-input.test.ts src/features/properties/actions.test.ts src/features/units/actions.test.ts src/lib/validation/postgres-uuid.test.ts src/features/properties/components/property-detail-screen.test.tsx src/features/properties/components/property-screen.test.tsx src/features/units/data/unit-summary.test.ts src/features/units/components/unit-screen.test.ts src/features/units/components/unit-detail-screen.test.tsx src/features/leases/components/lease-screen.test.tsx src/components/layout/app-shell.test.tsx`

Expected: PASS with zero failures.

- [ ] **Step 2: Run static and production checks**

Run: `npx tsc --noEmit`

Run: `npm run lint`

Run: `npm run build`

Expected: all commands exit 0. If the repository uses different script names, inspect `package.json`, run the exact equivalent, and record the command.

- [ ] **Step 3: Run the broader test suite**

Run: `npm test`

Expected: PASS. The pre-change full-suite baseline exceeded a 184-second command window without reporting a failure, so record a verification timeout separately from an assertion failure if that behavior repeats.

- [ ] **Step 4: Verify the authenticated workflow without persistent writes**

Use the existing authenticated local fixture and exercise Property create, Unit create, and Lease create through validation errors without completing a valid mutation. Capture screenshots proving values remain, corrected errors clear, availability prerequisites are explained, and readiness/next actions are visible. Also inspect the browser console for errors.

- [ ] **Step 5: Review branch scope and provenance**

Run: `git status --short`, `git diff --check`, `git log --oneline --decorate -8`, and compare the branch base to local `main`. Confirm no migration, generated type, seed, unrelated worktree, or persistent fixture changed.
