# Database Authorization Second-Wave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep lease-activation schedule visibility aligned with the existing tenant-isolated Lease visibility boundary.

**Architecture:** Replace the surviving organization-membership-only SELECT policy on `public.lease_activation_schedules` with a policy that resolves each schedule through its same-organization Lease and reuses the final Lease read predicates. Preserve the existing authenticated SELECT grant and all mutation/RPC behavior.

**Tech Stack:** PostgreSQL 17, Supabase migrations, Row Level Security, pgTAP.

**Spec:** Delegated second-wave manual database authorization audit in Codex task `01a0399f-c4ef-7c61-ac67-05ab8e9c99b6`.

## Global Constraints

- Baseline is detached HEAD `7c79b342761e5320379b10b298221703570a2cdb`, corresponding to `codex/security-remediation-integration`.
- Supabase/Postgres only; do not edit application request/auth code.
- Do not touch hosted Supabase, use `apply_migration`, push, merge, deploy, repair migration history, or reset/reseed hosted data.
- Preserve all privileged email step-up, public-intake, upload, PDF, dependency/CI, and browser/auth remediation already present.
- Add only a forward migration created with `npx supabase migration new scope_lease_activation_schedule_reads`.
- Test RED before writing migration SQL, then test GREEN locally.

---

### Task 1: Scope lease-activation schedule reads to readable leases

**Files:**

- Create: `supabase/tests/lease_activation_schedule_read_scope_test.sql`
- Create via CLI: the exact timestamped migration emitted by `npx supabase migration new scope_lease_activation_schedule_reads`

**Interfaces:**

- Consumes: the final Lease read predicates and the `(organization_id, lease_id)` foreign-key relationship from schedules to Leases.
- Produces: final policy `lease_activation_schedules_branch_select` on `public.lease_activation_schedules`.

- [ ] **Step 1: Write the failing pgTAP reproduction**

Create an activated organization with two branches, two custom-role members carrying `leases.view`, one same-branch custom-role member carrying only `finance.view`, one legacy operations member, and one Lease plus activation schedule per branch. Assert that the Lease and schedule result sets stay identical for every actor: branch-scoped Lease viewers and the Finance viewer see only their authorized branch, while the legacy operations member sees neither Lease nor schedule after ordinary access is enabled.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `npx supabase test db --local supabase/tests/lease_activation_schedule_read_scope_test.sql`

Expected: all Lease assertions pass, while the schedule assertions expose the organization-membership-only mismatch for branch/custom-role and legacy-role actors.

- [ ] **Step 3: Create the forward migration through the repository workflow**

Run: `npx supabase migration new scope_lease_activation_schedule_reads`

Record the emitted timestamped filename. In that file, drop only `"Organization members can read Lease activation schedules"` and create `lease_activation_schedules_branch_select` for `authenticated` with an `EXISTS` join to `public.leases` plus the same authorization predicates used by the final Lease SELECT policy.

- [ ] **Step 4: Apply the migration locally without reset**

Run: `npx supabase db push --local`

Expected: exactly the new migration applies to the disposable local database.

- [ ] **Step 5: Run the focused test to verify GREEN**

Run: `npx supabase test db --local supabase/tests/lease_activation_schedule_read_scope_test.sql`

Expected: all assertions pass.

- [ ] **Step 6: Verify the full database lane**

Run:

```powershell
npm run db:verify-migrations
npx supabase migration list --local
npx supabase db lint --local --schema public,app_private --level warning --fail-on error
npx supabase test db --local supabase/tests
npm run test:database:contracts
```

Expected: migration discipline passes; local migration history is complete; lint has no error-level finding; every pgTAP file and database contract passes.

- [ ] **Step 7: Review and commit only this lane**

Inspect `git diff --check`, the exact diff, and `git status --short`; request an independent database-security review; then commit only the plan, focused pgTAP test, and new migration with message `fix(db): scope lease activation schedule reads`.
