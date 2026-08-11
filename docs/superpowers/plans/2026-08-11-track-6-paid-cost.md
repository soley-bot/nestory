# Track 6 Paid Cost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let IPS record, independently approve, trace, reverse, and correct an already-paid property cost with immutable receipt evidence and exact downstream financial effects, without introducing accounts payable.

**Architecture:** Preserve `expense_submissions`, `submit_expense`, `review_expense`, and `reverse_expense` as the only paid-cost authority. Add one narrowly scoped, service-verified evidence-registration boundary for Finance submitters, require its immutable document in the general paid-cost submission, and prove every responsibility/funding outcome through existing payment, Ledger, owner-allocation, tenant-charge, close, and Owner Statement authorities. The UI remains under `/finance`, uses exact decimal strings at the server boundary, and calls the existing checked financial RPCs; it does not add bills, payables, vendor balances, or a parallel ledger.

**Tech Stack:** Next.js App Router server actions, React, TypeScript, Zod, Supabase Storage/Postgres/RLS, pgTAP, Vitest, Playwright, Node.js real-session concurrency harnesses.

## Global Constraints

- Work only in `D:\nestory\.worktrees\ips-operational-readiness` on `codex/ips-operational-readiness` and preserve all approved Track 1-5 and Track 9 commits.
- Operator outcome: a Finance Member records an already-paid cost with paid date, funding source, receipt/payment reference, immutable receipt evidence, responsible party, and exact money; a different Finance Manager rejects or approves; a Super Admin reverses a wrong approval; every accepted effect is traceable through Ledger, owner/tenant authority, close, and Owner Statement.
- The workflow is not accounts payable: do not add unpaid bills, due dates, vendor balances, payment scheduling, payment execution, or a generic accounting engine.
- Finance Member or Super Admin may submit; Finance Manager or Super Admin may review; only Super Admin may reverse. Preserve maker-checker separation and reject cross-tenant or wrong-role access.
- General paid-cost submission requires both an immutable evidence file and a non-empty receipt/payment reference. Maintenance handoff continues to use its existing task-scoped evidence authority.
- Money accepted by changed application actions must remain canonical two-decimal strings and must never pass through JavaScript numeric coercion before the RPC boundary.
- New public database surfaces require explicit grants plus RLS where applicable. Every privileged function must be owner-reviewed, have `search_path = ''`, authenticate/authorize explicitly, and expose only the minimum role grant.
- Evidence registration must verify retained Storage bytes, hash, size, MIME type, object identity, organization/property scope, and actor authority before creating the immutable document record. A failed or ambiguous retry must reuse or verify create-only bytes; it must not delete possibly registered evidence.
- During implementation run only focused tests for changed behavior. Run one complete authenticated browser acceptance flow, then one full application/database/security/build/accessibility/concurrency/role matrix. After the matrix, batch milestone findings and rerun only affected gates.
- Record unrelated legacy or cosmetic findings in the existing backlog; do not expand this milestone.
- No hosted Supabase/Vercel mutation, real IPS data, email, cron, backup, deploy, push, merge, or `main` cleanup is authorized in Track 6.

## Acceptance Criteria

1. All creation/review/reversal copy says “paid cost” and states that money was already paid; no changed surface implies an unpaid bill or payment execution.
2. The submission form visibly requires property, optional unit, paid-cost category, payee, exact amount paid, paid date, “Paid from” source, owner/tenant responsibility, receipt/payment reference, and receipt evidence. It states that submission has no balance effect before approval.
3. A Finance Member can upload and submit verified evidence without acquiring document-management or review authority. A Finance Manager can inspect immutable evidence but cannot submit as the maker in the acceptance flow or reverse.
4. Missing, wrong-tenant, wrong-property, replaced, deleted, hash/size-mismatched, or unavailable evidence fails closed with no expense, payment, Ledger, owner-allocation, tenant-charge, or idempotency residue. Exact retry returns the same evidence/submission identities.
5. Normal owner/property, owner-responsible, tenant-responsible, petty-cash-funded, rejection, rejection/resubmission, approval, reversal, wrong-amount reverse/resubmit, and missing-evidence cases have literal database oracles.
6. Approval creates exactly one intended paid-cost/payment identity and the correct responsibility effect: owner allocation/owner invoice for owner responsibility, tenant charge for tenant responsibility, petty-cash reduction for petty-cash funding, and matching Ledger/source lineage. Rejection creates none.
7. Reversal appends exact opposite payment, Ledger, customer, owner-allocation, and petty-cash effects without altering frozen original evidence. Wrong-amount correction is reverse then new evidence-backed submission; history remains append-only.
8. Close readiness and the next official Owner Statement include the approved cost and source links exactly once; reversal/reclose produces a new revision while preserving the prior official statement bytes and hashes.
9. Actor-bound idempotency, canonical financial-month then stable source/submission lock order, real-session duplicate/review/reversal races, RLS, grants, and tenant isolation pass.
10. One authenticated browser flow completes submit, reject, resubmit, approve, downstream inspection, reverse/correct, close, publish, and statement inspection with real local roles and database effects.
11. One expensive regression matrix is run after browser acceptance. One independent milestone reviewer approves the exact committed head with no unresolved Critical/Important accounting, authorization, isolation, evidence, idempotency, concurrency, or irreversible-data defect.

---

### Task 1: Freeze Paid-Cost Database Behavior Under RED

**Files:**
- Create: `supabase/tests/ips_paid_cost_acceptance_test.sql`
- Modify: `supabase/tests/finance_expense_approval_test.sql`
- Modify: `supabase/tests/ips_expense_responsibility_test.sql`
- Modify: `supabase/tests/maintenance_cost_handoff_test.sql`

**Interfaces:**
- Consumes: `public.submit_expense(...) -> jsonb`, `public.review_expense(...) -> jsonb`, `public.reverse_expense(...) -> jsonb`, Track 3 owner-allocation/source lineage, Track 4 close/publication authority.
- Produces: literal pgTAP contracts for required verified evidence, exact money, role/tenant denial, responsibility/funding effects, rejection, reversal, correction, close, and statement lineage.

- [ ] **Step 1: Write the focused failing contracts**

  Add rolled-back pgTAP scenarios whose assertions use exact IDs/counts and canonical text money. Require a general submission with `p_supporting_document_id IS NULL` to fail `23514 paid_cost_evidence_required` even when a reference exists. Add owner, tenant, property-cash, petty-cash, rejection, reversal, reverse/resubmit, close-line, and statement-source assertions. Preserve the maintenance-task alternative source path.

- [ ] **Step 2: Run the focused database RED**

  Run:
  ```powershell
  npx supabase test db --local supabase/tests/ips_paid_cost_acceptance_test.sql
  ```
  Expected: exit 1 because general paid cost still accepts reference-only evidence and no verified registration RPC/catalog contract exists; existing unaffected assertions must pass.

- [ ] **Step 3: Record RED evidence before production edits**

  Append the command, assertion count, exact SQLSTATE/messages, and rollback residue to `.superpowers/sdd/2026-08-11-track-6-paid-cost/track-6-progress.md`.

- [ ] **Step 4: Commit the retained RED contracts**

  ```powershell
  git add supabase/tests/finance_expense_approval_test.sql supabase/tests/ips_expense_responsibility_test.sql supabase/tests/maintenance_cost_handoff_test.sql supabase/tests/ips_paid_cost_acceptance_test.sql .superpowers/sdd/2026-08-11-track-6-paid-cost/track-6-progress.md
  git commit -m "test(finance): define paid cost acceptance"
  ```

### Task 2: Add Verified Immutable Paid-Cost Evidence

**Files:**
- Create via `npx supabase migration new harden_paid_cost_evidence`: the resulting `supabase/migrations/*_harden_paid_cost_evidence.sql`
- Create: `src/features/finance-operations/paid-cost-evidence.ts`
- Create: `src/features/finance-operations/paid-cost-evidence.test.ts`
- Modify: `src/features/finance-operations/actions.ts`
- Modify: `src/features/finance-operations/actions.test.ts`
- Modify: `src/types/database.ts` by generated Supabase types only

**Interfaces:**
- Consumes: `createSupabaseAdminClient()`, `createSupabaseServerClient()`, `requireFinanceSubmissionContext()`, bucket `nestory-documents`, `documents`, `expense_submissions`, `financial_idempotency_requests`.
- Produces: service-only `get_paid_cost_evidence_object(...) -> jsonb`, service-only `register_paid_cost_evidence_verified(...) -> jsonb`, private `is_paid_cost_evidence_object_locked(text) -> boolean`, and `preparePaidCostEvidence(input) -> Promise<{ documentId: string; sha256: string }>`.

- [ ] **Step 1: Write action/evidence RED tests**

  Test a real `File` for allowed PDF/JPEG/PNG/WebP, maximum configured size, deterministic create-only path, retained-byte SHA-256/size/MIME verification, exact retry identity, conflicting bytes, upload failure, registration failure, unavailable retained bytes, wrong property, wrong actor, and no cleanup after ambiguous registration. Assert `submit_expense` is not called until verified registration succeeds.

- [ ] **Step 2: Run application RED**

  Run:
  ```powershell
  npx vitest run src/features/finance-operations/paid-cost-evidence.test.ts src/features/finance-operations/actions.test.ts
  ```
  Expected: exit 1 because `preparePaidCostEvidence`, the file schema, and verified RPC calls do not exist.

- [ ] **Step 3: Generate one additive migration with the Supabase CLI**

  ```powershell
  npx supabase migration new harden_paid_cost_evidence
  ```

  Implement the two service-only verified RPCs and the private immutable-object helper. The registrar must lock the exact `storage.objects` row, validate object ID/version/path/content type/metadata size, validate `p_actor_id` has the paid-cost submit capability in the stated organization, validate property scope, insert or replay an immutable `documents` row categorized `Paid cost evidence`, and log the actor. Revoke `PUBLIC`, `anon`, and `authenticated`; grant only `service_role`. Extend document and Storage mutation guards so registered paid-cost evidence cannot be changed or removed before or after submission. Replace `submit_expense` additively so `source_type = 'general'` requires both `supporting_document_id` and reference while maintenance behavior is unchanged.

- [ ] **Step 4: Implement the server evidence boundary**

  `preparePaidCostEvidence` must upload with `upsert: false`, download through the admin client, compute the SHA-256 from retained bytes, inspect Storage identity through the service RPC, compare byte length/MIME/metadata size, then register with the current `context.userId`. On 409 it must download and verify the existing object. It must never delete an ambiguous object.

- [ ] **Step 5: Keep paid-cost money string-exact**

  Replace the changed paid-cost `z.coerce.number()` fields with the existing exact-money canonicalizer. Pass `p_internal_cost_amount` and `p_internal_markup_amount` as canonical strings and reject whitespace drift, exponent notation, leading-zero drift, overprecision, negative values, and unsafe large cents before authorization/RPC.

- [ ] **Step 6: Run focused GREEN and clean migration apply**

  Run:
  ```powershell
  npm run db:reset
  npm run db:types
  npx supabase test db --local supabase/tests/ips_paid_cost_acceptance_test.sql
  npx vitest run src/features/finance-operations/paid-cost-evidence.test.ts src/features/finance-operations/actions.test.ts
  ```
  Expected: all focused assertions pass; a clean reset applies the additive migration; generated types expose only the service-only RPCs to the admin client overrides.

- [ ] **Step 7: Commit evidence authority**

  ```powershell
  git add supabase/migrations supabase/tests src/features/finance-operations/paid-cost-evidence.ts src/features/finance-operations/paid-cost-evidence.test.ts src/features/finance-operations/actions.ts src/features/finance-operations/actions.test.ts src/types/database.ts
  git commit -m "feat(finance): verify immutable paid cost evidence"
  ```

### Task 3: Make The Operator Workflow Unambiguously “Paid Cost”

**Files:**
- Modify: `src/features/finance-operations/components/finance-operations-screen.tsx`
- Modify: `src/features/finance-operations/components/finance-operations-screen.test.tsx`
- Modify: `src/features/finance-operations/finance-operations.types.ts`
- Modify: `src/features/finance-operations/data/finance-operations.ts`
- Modify: `src/features/finance-operations/data/finance-operations.test.ts`

**Interfaces:**
- Consumes: `submitExpenseAction`, verified evidence file input, existing `ExpenseSubmissionSummary.evidence`, finance role capabilities.
- Produces: “Record paid cost” form, evidence/review/history display, exact per-outcome status and recovery copy.

- [ ] **Step 1: Write UI RED tests**

  Assert the creation trigger/title is `Record paid cost`; the form says `Already paid` and `Submitting does not record a new payment`; fields include `Paid date`, `Paid from`, `Receipt or payment reference`, and required `Receipt evidence`; review buttons say `Approve paid cost`/`Reject paid cost`; reversal says `Reverse paid cost`; no changed surface contains `Approve expense`, `Expense submitted`, or accounts-payable language. Assert Finance Member submit-only, Finance Manager review/read-only, Super Admin reversal, and Operations denial.

- [ ] **Step 2: Run UI RED**

  Run:
  ```powershell
  npx vitest run src/features/finance-operations/components/finance-operations-screen.test.tsx src/features/finance-operations/data/finance-operations.test.ts
  ```
  Expected: exit 1 on legacy expense copy and absent file input/recovery states.

- [ ] **Step 3: Implement the paid-cost form and history**

  Add an `accept="application/pdf,image/jpeg,image/png,image/webp"` required file input named `evidenceFile`; keep exact amount text input semantics; label the date `Paid date`; display immutable filename/hash/size in submission and review history; show typed evidence retry guidance without offering delete/replace. Keep source/responsibility fields visible and preserve the pre-approval no-effect warning.

- [ ] **Step 4: Run focused GREEN**

  Run the two Vitest files from Step 2 plus `src/features/finance-operations/actions.test.ts`. Expected: all pass with no changed paid-cost legacy copy.

- [ ] **Step 5: Commit operator workflow**

  ```powershell
  git add src/features/finance-operations
  git commit -m "feat(finance): clarify paid cost approval workflow"
  ```

### Task 4: Prove Fixture, Concurrency, And End-To-End Financial Effects

**Files:**
- Create: `scripts/fixtures/ips-paid-cost-scenarios.json`
- Create: `scripts/ips-paid-cost-fixture-contract.node-test.mjs`
- Create: `scripts/smoke-ips-paid-cost-scenarios.mjs`
- Create: `scripts/paid-cost-concurrency.node-test.mjs`
- Modify: `scripts/load-compact-end-to-end-fixture.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: checked paid-cost/evidence RPCs, existing compact fixture roles/properties/sources, owner close/publication RPCs.
- Produces: literal scenario manifest, guarded loader, database smoke, and real-session race evidence.

- [ ] **Step 1: Write fixture and harness RED contracts**

  Freeze exact IDs and canonical totals for: owner/property cost; tenant cost; petty-cash-funded cost; rejected then resubmitted cost; approved reversal; wrong amount reverse/resubmit; missing evidence. The smoke must assert submission/review/evidence identities, payment/allocation/tenant/petty-cash/Ledger effects, source fingerprints, close lines, statement source links, reversal symmetry, and zero difference.

- [ ] **Step 2: Run fixture/concurrency RED**

  Run:
  ```powershell
  node --test scripts/ips-paid-cost-fixture-contract.node-test.mjs
  node --test scripts/paid-cost-concurrency.node-test.mjs
  ```
  Expected: fixture fails on absent scenario rows and the race harness fails on absent retained pause/oracle coverage.

- [ ] **Step 3: Load the scenarios only through checked commands**

  Extend the guarded fixture without direct inserts into financial authority tables. Upload/register evidence through the production helper boundary, submit/review/reverse through real local sessions, and retain literal hashes/counts/totals in the manifest.

- [ ] **Step 4: Add real-session race cases**

  Cover exact duplicate submit, approve-vs-reject, approve-vs-reversal boundary, reversal-vs-resubmit, evidence registration-vs-mutation, and cross-month source/close contention. Each case must assert real wait/serialization, no `40P01`, one winner or exact replay as specified, no pending idempotency, and no duplicate/negative financial rows.

- [ ] **Step 5: Run focused GREEN**

  Run the fixture contract, fixture loader, paid-cost smoke, and concurrency harness. Expected: every literal scenario passes and the baseline is restored in `finally`.

- [ ] **Step 6: Commit retained operational evidence**

  ```powershell
  git add scripts package.json
  git commit -m "test(finance): retain paid cost lifecycle evidence"
  ```

### Task 5: Run One Complete Authenticated Browser Acceptance Flow

**Files:**
- Create: `scripts/smoke-ips-paid-cost-browser-acceptance.mjs`
- Create: `scripts/ips-paid-cost-browser-contract.node-test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: guarded paid-cost fixture, `/workspace` and `/finance`, local Finance Member/Finance Manager/Super Admin/Operations actors, checked close/publication flow.
- Produces: one retained browser script and one complete pass with real local roles/database effects.

- [ ] **Step 1: Write and run the browser contract RED**

  Assert the script logs in from `/workspace`, never uses a direct privileged route as setup, covers the named roles/phases, checks database effects after each mutation, verifies both old/new statement artifacts, and restores the fixture in `finally`. Expected: RED before the script exists or before all phases are present.

- [ ] **Step 2: Run one isolated complete browser flow**

  Start the exact worktree on a verified unused local port with local Supabase environment loaded in-process. Complete: Finance Member upload/submit; Finance Manager reject; Finance Member corrected resubmit; Finance Manager approve; inspect Ledger/responsibility/funding; Super Admin reverse and submit correct amount; Finance Manager approve; ordered close/reclose and publish; inspect superseded/current statements; Finance read-only proof; Operations route denial.

- [ ] **Step 3: Batch and correct all browser findings once**

  Correct only Track 6 selector, validation, authorization, evidence, accounting, and recovery defects found by the flow. Rerun the affected browser flow once after the batch. Do not start the full matrix until it is green.

- [ ] **Step 4: Commit browser evidence**

  ```powershell
  git add scripts/smoke-ips-paid-cost-browser-acceptance.mjs scripts/ips-paid-cost-browser-contract.node-test.mjs package.json
  git commit -m "test(finance): retain paid cost browser acceptance"
  ```

### Task 6: Run The Expensive Milestone Matrix Once

**Files:**
- Modify only if a scoped finding requires it: Track 6 production/tests/scripts above
- Modify: `docs/verification/track-6-paid-cost.md`
- Modify: `docs/verification/ips-operational-readiness-progress.md`
- Modify: `docs/superpowers/plans/2026-08-09-ips-operational-readiness-program.md`
- Create: `.superpowers/sdd/2026-08-11-track-6-paid-cost/track-6-report.md`

**Interfaces:**
- Consumes: the green browser-accepted Track 6 head.
- Produces: one complete matrix record, one coordinated correction batch if needed, and exact affected-gate evidence.

- [ ] **Step 1: Execute the complete matrix once**

  Run one clean reset/fixture; all pgTAP; DB lint/advisors/types; application TypeScript/ESLint/all tests/demo tools; paid-cost/opening/rent/owner lifecycle/close/statement/cutover concurrency; route/copy/role/accessibility coverage; production build; migration/catalog/grant/RLS/search-path checks; `git diff --check`. Record every command, count, exit result, database identity, and artifact path.

- [ ] **Step 2: Classify the single findings batch**

  Correct together only genuine Track 6 accounting, authorization, tenant-isolation, evidence-integrity, idempotency, concurrency, irreversible-data, changed-route accessibility, or build defects. Put unrelated legacy/cosmetic findings in the existing backlog.

- [ ] **Step 3: Rerun only affected gates**

  Run the exact focused DB/app/concurrency/security/build gates affected by the correction batch plus the paid-cost smoke. Do not rerun the full matrix or browser flow unless the correction changed browser-visible behavior.

- [ ] **Step 4: Complete criterion self-review and commit**

  Update the verification/program/SDD documents with exact SHAs, counts, limitations, and residuals. Run `git diff --check` and require a clean status after:
  ```powershell
  git add docs .superpowers/sdd/2026-08-11-track-6-paid-cost
  git commit -m "docs: record paid cost milestone evidence"
  ```

### Task 7: Independent Milestone Review And Approval

**Files:**
- Create by independent reviewer: `.superpowers/sdd/2026-08-11-track-6-paid-cost/track-6-review.md`
- If corrected, create: `.superpowers/sdd/2026-08-11-track-6-paid-cost/track-6-re-review.md`
- Modify after approval: `docs/verification/ips-operational-readiness-progress.md`

**Interfaces:**
- Consumes: exact clean Track 6 implementation head, binding plan, raw focused/browser/matrix evidence.
- Produces: independent disposition and an approval gate for Track 7/8/10; no hosted activation claim.

- [ ] **Step 1: Assign one independent reviewer**

  Review only Track 6 against this plan and the parent program. Inspect database authority, evidence bytes/metadata, grants/RLS, role/tenant behavior, exact-money actions, financial effects, reversal/correction, close/statement lineage, test oracles, and retained evidence. Do not rerun the browser or full matrix.

- [ ] **Step 2: Correct load-bearing findings in one batch if required**

  If the reviewer confirms a Critical/Important accounting, authorization, tenant-isolation, evidence-integrity, idempotency, concurrency, or irreversible-data defect, retain a focused RED, fix all such findings together, run only affected gates, and request one focused re-review. Cosmetic/legacy findings go to backlog.

- [ ] **Step 3: Record approval and move immediately**

  After approval, commit the review and approval status, require `git status --short` empty, and open the next unapproved local milestone. Do not push, merge, alter `main`, or activate hosted services.

## Self-Review

- Spec coverage: Tasks 1-7 cover every Track 6 parent-program bullet, the vertical operator outcome, all required paid-cost scenarios, browser/full-matrix/reviewer cadence, and the explicit hosted boundary.
- Placeholder scan: every task contains concrete interfaces, commands, expected failures, implementations, and pass criteria. The migration path is intentionally created by the required Supabase CLI command rather than fabricated.
- Type consistency: `preparePaidCostEvidence` returns `documentId` and `sha256`; the action passes `documentId` as `p_supporting_document_id`; database/application/fixture/browser tasks use the same paid-cost, evidence, responsibility, funding, close, and statement identities.
