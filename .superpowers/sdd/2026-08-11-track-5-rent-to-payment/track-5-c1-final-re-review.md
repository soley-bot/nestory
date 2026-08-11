# Track 5 C1 focused final re-review

## Review boundary and verdict

- Exact correction range:
  `38a748d9975d9806860718e2fb710e250776e6f1..6413ba0e8bdcbe0c8450fd472bf04d8dd2e64dc3`.
- Exact reviewed head: `6413ba0e8bdcbe0c8450fd472bf04d8dd2e64dc3`.
- Worktree status before and after focused verification: clean.
- Scope: original Track 5 C1 financial-month/lease lock inversion and only
  correction-caused Critical or Important regressions.
- C1 disposition: **ADDRESSED**.
- New findings: **0 Critical, 0 Important**.
- Spec compliance: **Compliant within the focused correction boundary**.
- Verdict: **APPROVED**.

Track 5 is approved at this head. The additive correction establishes the
required financial-month-before-lease order, re-reads and locks the complete
rent authority before invoking the preserved generator, and retains both
terminal race outcomes. The previously reproduced `40P01` interleaving now
passes without deadlock or residue.

## Material reviewed

- Additive migration
  `supabase/migrations/20260811040806_enforce_rent_generation_global_lock_order.sql`.
- Expanded four-case real-session rent concurrency harness.
- Updated implementation and verification reports, treated as context rather
  than proof.
- Live local function owner, `SECURITY DEFINER`, `search_path`, execute-grant,
  lock-order, and pending-idempotency catalog state.

The browser flow and expensive full matrix were not rerun. No production code
was edited during this review.

## C1 disposition — ADDRESSED

### Canonical lock order

The migration renames the already-reviewed generator body to the private
`generate_lease_rent_invoice_after_financial_lock` function and creates a
private wrapper under the original callable name.

For a valid generation scope, the wrapper now:

1. performs only non-locking preliminary lease/first-term discovery at lines
   `56-85`;
2. acquires `lock_open_property_financial_month` at lines `98-103`;
3. re-reads and locks the exact lease/person identity at lines `105-120`;
4. re-reads and validates the first term currency/effective date at lines
   `122-152`;
5. locks the complete applicable term set in deterministic order at lines
   `154-173`;
6. locks the selected billing and policy authority at lines `175-193`; and
7. invokes the preserved generator body only after those locks at lines
   `195-202`.

This matches the scheduler's established financial-month-before-lease order.
The preserved body may reacquire the same financial and row locks, but they are
transaction-reentrant and cannot invert against the scheduler because the
wrapper already owns the financial-month authority.

### Scope-change handling

Preliminary lease identity, primary tenant, first-term currency, and effective
date are revalidated after the financial lock. A scheduler that wins first is
therefore observed as the complete committed term set. A generator that wins
first holds the financial authority until its immutable invoice and segments
commit, after which scheduling receives typed
`rent_obligation_already_generated`.

The two wrapper fallbacks do not recreate C1:

- malformed arguments reach the preserved body's input guard and fail before
  any lease or financial lock;
- a missing lease/applicable term reaches the preserved body's not-found or
  no-term blocker before its financial-month acquisition.

No valid generation scope can acquire a lease/person row lock before the
wrapper's financial-month lock.

### Function security and caller preservation

Fresh catalog state shows both the wrapper and preserved body are:

- owned by `postgres`;
- `SECURITY DEFINER` with `search_path=""`;
- executable only by the owner (`{postgres=X/postgres}`);
- not executable by `anon`, `authenticated`, or `service_role`.

Existing cron, current-month retry, exception retry, activation catch-up, and
historical recovery callers continue resolving the original
`app_private.generate_lease_rent_invoice(...)` name, which is now the checked
wrapper. The preserved body has a new private name and no application grant.

The live function-definition probe placed the financial lock before the first
lease/person `FOR SHARE` and returned `canonical_order = true`.

## Retained both-winner race proof

The expanded harness retains the two original post-lock terminal cases and adds
the exact pre-financial window that reproduced C1:

1. **Generator wins:** an external lease blocker makes the generator wait only
   after it owns the financial month. Scheduling then waits on the financial
   authority. Generation commits one `1450.00` invoice/segment; scheduling
   receives typed `rent_obligation_already_generated`.
2. **Scheduler wins:** an external financial-month blocker queues scheduling
   before generation. Scheduling commits the new term set; generation then
   freezes one invoice with two exact `1450.00,0.00` segments and two
   authoritative active/upcoming terms.

Both cases assert:

- no `deadlock detected` or `40P01`;
- one invoice only;
- exact segment count and segment sum equal the invoice authority;
- correct one-term or two-term terminal evidence;
- zero pending pre-financial idempotency claims.

## Fresh focused verification

- `supabase test db supabase/tests/ips_rent_scenario_acceptance_test.sql`:
  **28/28 passed**.
- `npm run rent:test-concurrency`: **4/4 passed**.
- `npm run rent:test-fixture`: **10/10 passed**, guarded fixture restored.
- Function catalog: owner/search path/security/grants correct for wrapper and
  preserved body.
- Live lock-order probe: financial lock position precedes lease/person row lock.
- Pending financial idempotency requests: **0**.
- `git diff --check 38a748d..6413ba0`: passed.

## Correction-caused Critical or Important findings

None.

The correction does not alter rent amount/proration formulas, segment schema,
invoice identity, role/RLS policy, settlement authority, historical recovery,
owner allocation, close, or publication behavior. It adds serialization and
revalidation around the already-approved generator body.

## Verification boundary

This approval is limited to C1 and correction-caused Critical/Important
regressions. Previously recorded browser and full-matrix evidence remains the
accepted evidence for those broader surfaces; neither was repeated. Hosted
Supabase/Vercel, cron execution, email, backups, deployment, production data,
push, and merge remain outside this review.

## Final verdict

**APPROVED. Track 5 is complete** at
`6413ba0e8bdcbe0c8450fd472bf04d8dd2e64dc3`.

The next milestone may consume Track 5 as approved. Track 2-4 approvals remain
unchanged.
