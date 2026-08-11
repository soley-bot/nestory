# Track 9 independent milestone review

## Review boundary

- Base: `7346d8a0533b202c91fa99413d50357527cc6455`
- Reviewed head: `41380c094cc8e25e19b411927d022000bf8c8b07`
- Scope: Track 9 IPS migration/cutover only. Tracks 1-5 remain approved and were not reopened.
- Initial repository state: exact reviewed head, clean worktree, and `git diff --check` clean.
- Browser acceptance and the expensive full matrix were not rerun, as required. Their retained evidence was reviewed as evidence, not treated as proof of the untested cases below.

## Verdict

**BLOCKED. Do not open the next milestone gate.**

No Critical defect was confirmed. Four Important defects remain in the Track 9 operator outcome: multi-item month locks are not globally ordered and can deadlock; the staged currency contract is not executable and the UI loses currency identity; the required manifest verifier rejects valid multi-tenant/multi-property manifests; and malformed signed-exception timestamps are frozen as ready evidence. These are cutover concurrency, accounting presentation, normal IPS manifest coverage, and evidence-integrity defects, not cosmetic backlog.

## Acceptance disposition

1. **Issues.** The database freezes a canonical manifest and reproducible SHA-256, but the required verifier cannot validate a normal multi-property/multi-tenant manifest, and signed-exception completeness is not enforced.
2. **Compliant.** The four authority tables use RLS plus FORCE RLS; authenticated access is policy-scoped read-only; checked RPCs are `SECURITY DEFINER` with `search_path=''`; private helpers and service role have no execution grant; guarded rows cannot be directly changed or deleted.
3. **Issues.** Core missing/ambiguous/import/owner/money checks are typed and atomic, but a claimed `KHR` tenant position stages ready although the live enum is USD-only, and an impossible approval timestamp is accepted as ready evidence.
4. **Issues.** Selected-month generation and exact per-source count/money comparison work for the retained single-tenant USD fixture, but month locks are not globally ascending across tenant items and the tenant currency is not reconciled to invoice currency.
5. **Compliant for covered scope.** Shared idempotency binds organization, operation, key, actor, and payload. Exact commit replay returns the same identities, conflicting payload is rejected, the three retained races serialize, and no pending request remains. The missing reverse multi-month race is Finding I1.
6. **Compliant.** A staged/blocked batch can be abandoned with reason without deleting imported authority. Reconciled evidence is immutable; mismatch-side rent generation is rolled back before the blocker is persisted.
7. **Issues.** Route/action authorization is Super Admin-only and server-derived organization scope is preserved, but the workspace aggregates allowed currency values into one number and labels it USD.
8. **Cannot independently rerun by instruction.** The retained browser flow covers block, corrected stage, commit, replay, exact selected-month database effects, role denial, and guarded restoration. It uses one property, one tenant, and USD, so it is not an oracle for I1-I3.
9. **Issues.** The two retained rehearsal records reproduce the same database manifest/reconciliation hashes, counts, totals, selected invoices, and zero differences for the redacted fixture. The required preflight verifier cannot accept the normal multi-entity expansion described in I3, so the rehearsal contract is narrower than the milestone outcome.
10. **Blocked at independent review.** The single full matrix evidence is retained and was not repeated. One coordinated correction batch followed by affected gates and one focused re-review is required.

## Strengths

- Track 9 correctly orchestrates the existing immutable import, approved owner-opening, and rent authorities rather than creating a parallel ledger.
- Manifest and item hashes use database-canonical `jsonb::text`, and the pgTAP oracle independently reconstructs both the manifest hash and reconciliation hash.
- Import claims are organization-scoped and bound to unique immutable source-claim hashes; commit independently freezes expected and actual counts.
- Mismatch generation uses a subtransaction: generated invoices are rolled back, exact differences are persisted on the batch, and the idempotency request completes without residue.
- Authorization occurs before batch lookup in every public RPC. Cross-tenant reads and role-denied mutations are covered, while catalog probes confirm RLS/FORCE RLS, grants, `SECURITY DEFINER`, and empty search paths.
- The retained exact-commit and rent-generation races genuinely wait in both start orders and assert one reconciliation, selected invoice identities, exact balance, no deadlock, and no pending idempotency.

## Findings

### Critical

None confirmed.

### Important

#### I1. Multi-item cutover locks can reverse the global financial-month order and deadlock

Locations:

- `supabase/migrations/20260811045049_harden_ips_cutover_reconciliation.sql:192-202`
- `supabase/migrations/20260811045049_harden_ips_cutover_reconciliation.sql:221-231`
- `scripts/ips-cutover-concurrency.node-test.mjs:229-256`

The pre-lock loop orders tenant items by `source_key`, then orders months only inside each item. A manifest whose first source selects August and second source selects July therefore acquires August then July, despite acceptance criterion 4 requiring ascending financial-month locks. Existing multi-month finance authorities acquire July then August.

Focused transactional proof acquired July then August in one session and the cutover-observed August then July sequence in the other. PostgreSQL returned `deadlock detected` / `40P01` with each session waiting on the other's `financial_month_v1` advisory lock. Both transactions rolled back and left no residue. The retained three cutover races use one tenant item and do not exercise this order.

Required correction:

- Resolve every tenant item to its immutable lease/property/currency scope, materialize all distinct selected financial months, and acquire the global month locks once in canonical ascending month order before any lease/lifecycle/domain lock. Recheck the resolved source after the locks.
- Add a two-item reverse-source/reverse-month oracle and both start orders against an existing ascending multi-month finance operation. Require an observed waiter, no `40P01`, one correct cutover result, selected-only invoices, no duplicates, no pending request, and no residue on failure.

Affected gates: Track 9 pgTAP selected-month assertions, cutover concurrency, and the focused rent/cutover catalog lock-order probe only.

#### I2. The currency contract stages an unexecutable tenant position and the workspace removes currency identity

Locations:

- `supabase/migrations/20260811043206_ips_cutover_batches.sql:242-251`
- `supabase/migrations/20260811045049_harden_ips_cutover_reconciliation.sql:192-200`
- `supabase/migrations/20260811045049_harden_ips_cutover_reconciliation.sql:221-240`
- `src/features/imports/data/cutover.ts:85-87`
- `src/features/imports/data/cutover.ts:103-105`
- `src/features/imports/components/cutover-panel.tsx:63-64`

Staging explicitly accepts `USD` or `KHR`, but the live `public.currency_code` contains only `USD`. A fresh transactional probe staged a KHR tenant opening as ready; commit then failed at `(payload->>'currency')::public.currency_code` with `invalid input value for enum public.currency_code: "KHR"` rather than a typed cutover blocker. The actual-balance query also does not bind `invoice.currency` to the manifest currency. Independently, the loader sums every tenant/owner amount without grouping by currency and the panel appends `USD`, so a staged KHR/mixed manifest is displayed as USD before commit.

Required correction:

- Align the manifest contract with the live currency authority. In this milestone's existing USD-only system, reject unsupported currency during stage as a typed blocker; do not broaden the program to add a new currency ledger merely to satisfy this review.
- Resolve and freeze the authoritative lease/invoice currency, compare it with the manifest currency, and include currency in the actual-balance predicate and frozen reconciliation evidence.
- Map/render totals per currency rather than summing unlike denominations or hard-coding USD.
- Add USD-positive and KHR/unsupported-negative database, loader, and UI oracles. The negative path must remain atomic and leave no pending idempotency.

Affected gates: Track 9 pgTAP, focused cutover data/component tests, and the manifest verifier; no full matrix or browser rerun is required unless the operator markup contract materially changes.

#### I3. The required manifest verifier rejects valid multi-tenant and multi-property cutovers

Locations:

- `scripts/verify-ips-cutover-manifest.mjs:51-54`
- `scripts/verify-ips-cutover-manifest.mjs:64-70`
- `scripts/verify-ips-cutover-manifest.node-test.mjs:10-38`

The database correctly requires four owner components for each `(propertyCode, currency)` group, but the verifier compares the entire component array to exactly four values. It therefore rejects a valid second property with its own complete four-component set. It also requires selected month strings to be globally unique, so two different tenants both selecting July are rejected. Fresh read-only Node probes reproduced:

- `multi-tenant rejected: Selected rent months must be explicit and unique.`
- `multi-property rejected: Manifest must contain all four owner opening components.`

Those are normal cutover cases, not adversarial inputs, and make `npm run cutover:test-manifest` unusable for an IPS-wide manifest.

Required correction:

- Validate the complete four-component set independently for every property/currency group.
- Require selected months to be unique within the correct tenant/source scope, while allowing the same calendar month for different leases/units.
- Add literal positive tests for two properties and two tenants sharing selected months, plus negative tests for an incomplete component group and a duplicate month within one tenant balance.

Affected gates: manifest verifier tests and the two-rehearsal comparison contract only; the expensive application matrix is not affected.

#### I4. Signed-exception evidence accepts an impossible approval timestamp

Locations:

- `supabase/migrations/20260811043206_ips_cutover_batches.sql:274-280`
- `scripts/verify-ips-cutover-manifest.mjs:41,55-60`
- `src/features/imports/data/cutover.ts:99-101`

`approvedAt` is checked only for a `YYYY-MM-DDT` prefix. A fresh transactional helper probe returned `ready|NULL` for `2026-99-99Tnot-a-timestamp`. The offline verifier performs no signed-exception field validation, and the workspace renders source key, reason, and approver but omits the approval timestamp. The resulting immutable manifest can therefore present an exception as signed without a valid approval instant.

Required correction:

- Parse and canonicalize `approvedAt` as a real timestamp at the checked database boundary and return `cutover_exception_unsigned` for invalid/noncanonical input without throwing an untyped cast error.
- Mirror the complete signed-exception contract in the offline verifier and display the frozen approval time in the workspace.
- Add pgTAP/verifier/UI oracles for a valid canonical timestamp and the impossible timestamp above.

Affected gates: Track 9 pgTAP, manifest verifier, and focused cutover loader/panel tests only.

### Minor

None requiring milestone expansion. Unrelated legacy accessibility and discoverability findings remain correctly backlog-only.

## Focused verification performed

- `npx supabase test db --local supabase/tests/ips_cutover_import_test.sql` — **45/45 pass**.
- `npm run cutover:test-concurrency` — **3/3 pass**.
- Focused Vitest for cutover actions, loader, and panel — **8/8 pass**.
- `npm run cutover:test-manifest` — **2/2 pass**.
- Fresh catalog probe — all five public RPCs are `SECURITY DEFINER`, `search_path=''`, authenticated-only; all four authority tables have RLS plus FORCE RLS, authenticated SELECT, and no authenticated DML.
- Fresh residual probe after tests — `0/0/0/0` cutover batch/item/reconciliation/transition rows.
- Fresh lock-order transactional proof — reverse month order produced `40P01`; both sessions rolled back.
- Fresh signed-exception transactional proof — impossible timestamp returned ready; transaction rolled back.
- Final diff check remained clean before this report; only this review report is added by the reviewer.

The green retained and rerun tests are valid for their stated single-property, single-tenant, USD fixture. They do not contradict the findings; they omit the multi-item lock order, allowed-but-unsupported currency, multi-entity verifier, and invalid signed timestamp cases.

## Task quality

The implementation is well-scoped, additive, documented, and substantially stronger than a conventional import checklist. Its authority tables, hashes, rollback behavior, app action boundary, and retained evidence are reviewable and disciplined. The remaining problems are concentrated in normal scale/contract dimensions that the single-property USD fixture did not exercise. They should be corrected together without reopening approved Tracks 1-5 or rerunning the browser/full matrix.

## Gate

**Track 9 is not approved. The next milestone is blocked.** Return I1-I4 to the same implementer as one coordinated correction batch, run only the affected gates named above, then request one focused independent Track 9 re-review.
