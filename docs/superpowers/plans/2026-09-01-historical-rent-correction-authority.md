# Historical Rent Correction Authority Implementation Plan

> **For Codex:** Execute this plan with test-driven development. Keep every database change forward-only and additive. Do not mutate hosted/production/Vercel state, merge, or deploy.

**Goal:** Add a Super Admin-only, preview-confirmed, append-only correction workflow for one issued historical rent invoice, including obligation replacement, settlement replay, tenant-credit evidence, fee/owner effects, and Owner Close safeguards.

**Architecture:** Preserve `tenant_invoices` and `lease_terms` as immutable issued/schedule evidence. Extend the existing tenant-invoice correction authority with a `historical_rent` occurrence, signed reversal plus positive successor lines/items, settlement link evidence, and tenant-credit occurrences. Reuse checked settlement and owner-allocation commands under one transaction. Present corrected values through derived views and a two-step Server Action/UI flow.

**Tech Stack:** PostgreSQL 17/Supabase migrations and pgTAP, Next.js 16 App Router Server Actions, React 19, TypeScript, Zod, Vitest/Testing Library.

---

### Task 1: Pin red database behavior

**Files:**
- Create: `supabase/tests/historical_rent_correction_authority_test.sql`
- Create: `supabase/tests/historical_rent_correction_concurrency_test.sql`

1. Add failing pgTAP cases for Super Admin-only preview/execution, issued historical invoice validation, exact amount/due-date preview, and immutable source snapshots.
2. Add failing cases for reversal plus positive obligation lineage, adjusted invoice balance/due date, fee replacement, owner allocation/component movements, IPS settlement replay, direct-owner settlement replay, and decrease-to-tenant-credit evidence.
3. Add failing cases for idempotent replay, payload mismatch, stale preview, locked correction month, closed Owner Close, explicit reopen, immutable prior statement/publication, direct DML, and two concurrent correction attempts.
4. Run only the new tests and record the expected missing-object failures.

### Task 2: Add the forward-only database authority

**Files:**
- Create with `supabase migration new`: `supabase/migrations/20260901035111_historical_rent_correction_authority.sql`
- Modify after local type generation: `src/types/database.generated.ts`

1. Extend correction, invoice-line, income-item, and fee evidence with successor/snapshot columns and restrictive constraints/indexes.
2. Add immutable settlement-reapplication and tenant-credit occurrence tables, indexes, RLS, read policies, direct-DML revocations, and append-only guards.
3. Add active-lineage helpers and update `tenant_invoice_balances` so adjusted totals/due dates/payment states derive from signed correction evidence.
4. Add private deterministic preview construction and public Super Admin preview RPC.
5. Add private helpers for settlement replay, tenant-credit evidence, replacement fee/owner effects, close-state checks, and stale propagation.
6. Add public correction RPC with canonical idempotency, stable lock order, preview-hash confirmation, full rollback on any unsafe chain, activity log, and explicit result JSON.
7. Re-run focused pgTAP until green, then reset/lint locally and generate current database types.

### Task 3: Pin red application input and Server Action behavior

**Files:**
- Create: `src/features/leases/historical-rent-correction-input.test.ts`
- Create: `src/features/leases/historical-rent-correction-input.ts`
- Modify: `src/features/leases/actions.test.ts`
- Modify: `src/features/leases/actions.ts`

1. Add failing parser tests for invoice UUID, two-decimal positive rent, due day 1–31, reason 8–500, idempotency key, and preview hash.
2. Implement the Zod parser and exact RPC payload builders without binary-float arithmetic.
3. Add failing Server Action tests for protected Super Admin authority, preview RPC payload/result, apply RPC payload/result, stale preview, locked month, reopen requirement, and settlement-chain messages.
4. Implement preview/apply Server Actions using `requireSuperAdmin`, the generated Supabase RPC types, safe error mapping, and revalidation of lease/finance/ledger/report/owner-balance routes.
5. Run the focused parser/action tests to green.

### Task 4: Load correction candidates and pin red UI behavior

**Files:**
- Modify: `src/features/leases/data/leases.ts`
- Modify: `src/features/leases/lease.types.ts`
- Modify: `src/app/(dashboard)/leases/[leaseId]/page.tsx`
- Modify: `src/app/(dashboard)/leases/[leaseId]/page.test.tsx`
- Modify: `src/features/leases/components/lease-detail-screen.test.tsx`
- Modify: `src/features/leases/components/lease-detail-screen.tsx`

1. Add failing loader/page tests proving candidates load only for Super Admin and remain organization/lease scoped.
2. Add failing component tests proving **Correct historical rent** is distinct from **Change rent**, hidden from custom roles, requires all fields, renders preview deltas/evidence/blockers, and only enables confirmation for the exact preview hash.
3. Implement typed candidate loading from issued historical invoice balances.
4. Add Super Admin permission state, menu action, and two-step modal with dense old/new preview and explicit retained-evidence copy.
5. Keep the existing future term modal and tests unchanged except for the additional independent action.
6. Run focused page/component tests to green.

### Task 5: Verify the complete local story

**Files:**
- Modify only if generated by the documented commands: `src/types/database.generated.ts`

1. Run the new pgTAP tests repeatedly, including the concurrency harness.
2. Run the existing invoice correction, settlement, owner-balance/close, statement, lease action, and lease detail regression suites.
3. Run local database reset, database lint, generated-type parity, TypeScript, ESLint, unit/integration tests, and production build.
4. Inspect `git diff --check`, migration policy/grant definitions, and the final clean/dirty scope. Confirm no hosted, production, Vercel, merge, or deployment mutation occurred.

### Task 6: Hand off through a no-merge pull request

1. Review the diff and verification evidence against the approved design.
2. Commit on `codex/historical-rent-correction-authority` with an exact-scope message.
3. Push the branch and open a pull request describing authority boundaries, fail-closed behavior, local verification, and explicit non-actions.
4. Do not merge the pull request.
