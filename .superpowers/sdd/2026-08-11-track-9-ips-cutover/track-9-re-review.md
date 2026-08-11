# Track 9 focused correction re-review

## Review boundary

- Original reviewed implementation: `41380c094cc8e25e19b411927d022000bf8c8b07`
- Corrected head: `fba0b2cc71b8e089d074688643b32d2c30a8a95b`
- Initial state: exact corrected head, clean worktree, clean range diff.
- Scope: original I1-I4 and correction-caused Critical/Important defects only. Approved Tracks 1-5 were not reopened.
- Browser acceptance and the expensive full matrix were not rerun, as required.

## Verdict

**APPROVED. Track 9 is complete locally and the next milestone gate may open.**

All four original Important findings are addressed. No correction-caused Critical or Important defect was found.

## Original finding dispositions

### I1 — Global selected-month lock order: ADDRESSED

Evidence:

- `supabase/migrations/20260811062724_harden_ips_cutover_multi_scope.sql:162-229` materializes every distinct selected month, orders the complete set by month/property/currency, acquires financial-month locks before lease locks, then locks lease identities in stable UUID order.
- `public.commit_ips_cutover_batch` calls the helper once at line 275 before generating invoices or taking domain locks.
- `scripts/ips-cutover-concurrency.node-test.mjs:161-182` retains the reverse-source August/July manifest.
- The finance-first race at lines 333-347 observes cutover waiting behind ascending July/August authority, then completes without `40P01`.
- The cutover-first race at lines 349-371 proves cutover holds July before waiting for August, makes the ascending finance session wait, and completes both operations without deadlock.
- Both races assert one reconciliation, two exact selected invoices, `950.00`, no pending idempotency, and no duplicate effect.

Fresh result: cutover concurrency **5/5** and affected rent lock concurrency **4/4** pass.

### I2 — USD-only typed authority and currency-bound truth: ADDRESSED

Evidence:

- `validate_ips_cutover_item` now returns `cutover_currency_unsupported` for non-USD tenant and owner positions before any enum cast (`20260811062724...sql:64-68,94-98`).
- For every selected month, validation requires a live authoritative lease term with the frozen currency (`:119-141`). The schema already constrains lease terms to authoritative authority.
- Commit constrains invoice reconciliation by `invoice.currency = v_currency` (`:294-314`).
- Tenant and owner expected/actual totals freeze `{ amount, currency }`, and those structures are bound into the reconciliation hash (`:312-328,348-355`).
- The loader groups exact-decimal amounts by currency and the panel renders currency-specific tenant/owner totals (`src/features/imports/data/cutover.ts:85-108,112-127`; `src/features/imports/components/cutover-panel.tsx:68-77`).
- pgTAP proves KHR stages blocked with the exact typed issue, the ready USD path reconciles currency-bound totals, and selected invoices are USD.

Fresh result: Track 9 pgTAP **55/55** and exact focused app subset **13/13** pass.

### I3 — Normal multi-property and multi-tenant manifest verification: ADDRESSED

Evidence:

- `scripts/verify-ips-cutover-manifest.mjs:56-70` validates the complete four-component set independently for each property/currency group.
- Lines 81-89 enforce selected-month uniqueness within each tenant opening while allowing different tenants to select the same calendar month.
- `verify-ips-cutover-manifest.node-test.mjs` now retains a positive two-property/eight-component, two-tenant/same-month case and negative incomplete-group/per-tenant-duplicate cases.

Fresh result: verifier **5/5** passes. The two retained rehearsal artifacts also compare identically for manifest hash, currency-bound reconciliation hash, counts, totals, selected invoices, and differences.

### I4 — Canonical signed-exception time and visible evidence: ADDRESSED

Evidence:

- `app_private.is_canonical_ips_cutover_approval_timestamp` requires exact `YYYY-MM-DDTHH:MM:SSZ`, safely parses to `timestamptz`, and round-trips through UTC (`20260811062724...sql:1-26`).
- `validate_ips_cutover_item` returns the typed `cutover_exception_unsigned` blocker for any invalid/noncanonical time (`:147-153`).
- The helper is private to database authority.
- The offline verifier mirrors the canonical timestamp and complete approval checks (`scripts/verify-ips-cutover-manifest.mjs:90-99,137-142`).
- The loader preserves `approvedAt`, and the panel renders the frozen time with approver, reason, and source key (`src/features/imports/data/cutover.ts:98-103`; `src/features/imports/components/cutover-panel.tsx:116-125`).
- pgTAP and verifier tests cover a valid UTC timestamp and the original impossible timestamp.

Fresh result: database, verifier, loader, and panel timestamp oracles all pass.

## Correction-caused findings

### Critical

None.

### Important

None.

### Minor

None requiring milestone expansion.

## Focused verification

- `npx supabase test db --local supabase/tests/ips_cutover_import_test.sql` — **55/55 pass**.
- `npm run cutover:test-concurrency` — **5/5 pass**.
- `npm run rent:test-concurrency` — **4/4 pass**.
- `npm run cutover:test-manifest` — **5/5 pass**.
- Exact cutover action/data/panel/import-screen Vitest subset — **13/13 pass**.
- A broader focused import/cutover Vitest selection also passed **19/19**.
- `compare-ips-cutover-rehearsals.mjs` — pass; both artifacts retain manifest hash `8de15aefa1becebc11d82e77db7510f2b2f1a87c62fa01cf244f14f17efa8af4` and currency-bound reconciliation hash `a7ff1050ba8d23954c73068c5131336175f713d909c6b5c294a39d666e72309e`.
- Catalog probe — five public RPCs remain authenticated-only `SECURITY DEFINER` functions with `search_path=''`; new and replaced private helpers have no anon/authenticated/service-role execution; all four tables retain RLS plus FORCE RLS, authenticated SELECT, and no authenticated DML.
- Residue probe — **0** batches, items, reconciliations, transitions, and pending cutover idempotency requests after fixture restoration.
- Final `git diff --check` — pass.

## Evidence boundary

The retained browser acceptance and prior single full matrix remain valid evidence for their previously executed commit boundary; they were not rerun or broadened. The focused correction gates directly cover all behavior changed for I1-I4. Hosted Supabase/Vercel parity, real IPS data/date/owner, backup/restore, activation, deploy, push, and merge remain later explicit-approval work and are not implied by this local approval.

## Gate

**Track 9 APPROVED at `fba0b2cc71b8e089d074688643b32d2c30a8a95b`. The next local milestone may begin. Hosted activation remains unauthorized.**
