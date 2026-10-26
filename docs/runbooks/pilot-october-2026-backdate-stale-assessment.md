# Financial reset: backdating and stale-data review

Generic review guidance based on source commit `4129597c75f948a83deab46546a58e70a613b6c5`. This extends the [finance reset assessment](pilot-october-2026-finance-reset-assessment.md). Customer-specific hosted observations and target identities belong in the private operation evidence. October/November dates below are illustrative acceptance cases. See the separate validation record for tests actually executed on synthetic data.

## Conclusion

Preserve legitimate backdating within October, while enforcing a 1 October financial start boundary and rejecting intents based on the old books. Date limits, request replay protection, report freshness and job containment are separate requirements. Clearing caches or deleting invoices alone does not satisfy them.

Check active leases with missing issued invoices or unresolved `billing_setup_missing` exceptions. Retaining ineffective rules will leave reporting incomplete after reset.

## Required private live inventory

| Inspect | Required interpretation |
| --- | --- |
| Missing invoices, billing exceptions and rule coverage | Resolve actual configuration gaps without inventing obligations. A transaction reset does not repair configuration. |
| Business dates and immutable entry timestamps | Do not use `created_at` to decide financial period or reset eligibility. A limited clean screen does not prove every posting path is safe. |
| Month locks and earliest permissible financial date | Existing month locks do not substitute for a reset cutoff. |
| Lease and organization timezones | Verify intentional clock settings rather than silently rewriting them. |
| Cron, external callbacks and executable queues | A UI notice or deployment lock does not stop writers. Account for other organizations before containing shared jobs. |
| Idempotency results and pending work | Retire financial results while preserving master-workflow protection. A completed-row snapshot does not prove no uncommitted writer exists. |
| Activation schedules, notifications and maintenance costs | Classify retained and delayed inputs, including financial projections on preserved operational records. |
| Published/failed artifacts and their source references | Explicitly retire active lookup authority while preserving authorized evidence and bytes. |

## Backdating findings

### 1. A reporting start date needs database enforcement

The baseline posting paths reviewed at the pinned source commit had no reset-specific cutoff. Its `lock_open_financial_month` definition checks matching organization/branch month-lock rows, not an earliest permissible date. The candidate safeguards add a separate lifecycle boundary; the actual executor still requires its own validation.

Historical rent recovery can take a September billing period and issue it today. Checking only creation or issue date would therefore still admit a pre-October obligation. It can also recover qualifying ended/terminated lease history, unlike the scheduled generator's active/notice-given scope.

Enforce the reset boundary at the authoritative write layer across invoice billing/recognition periods, receipt/payment effective dates, expenses, fees, owner events, deposit events, corrections/reversals, manual recovery and scheduled generation. Reject a new pre-October financial effect even when its issue date is in October. Preserve older contractual lease dates; configuration history is not itself a financial posting. Define handling of any reporting period that spans the boundary instead of blindly rewriting dates.

Expected behavior: a valid receipt dated 5 October entered on 22 October is allowed, subject to ordinary checks; its immutable entry timestamp remains 22 October. A financial posting dated 30 September is rejected after cutover. October corrections still obey month locks, permissions, available balances and issued-document safeguards.

### 2. Merged backdating support already exists

Past lease activation is supported in merged September 28 migrations. Current hosted `schedule_authoritative_lease_term` also permits backdated effective changes within the predecessor term. It locks affected periods and uses linked correction checks for issued invoices, including month-start alignment, source/proration restrictions and a current preview hash.

The untracked local `20260926082835_allow_backdated_unbilled_rent_changes.sql` is not on `origin/main`; it must not be mistaken for the production implementation or deployed as part of reset without reconciliation. Preserve existing checked correction paths rather than banning all past dates or bypassing invoice history.

### 3. Billing clocks can cross the cutoff differently

The reviewed rent resolver follows each lease billing rule's timezone and uses UTC when no rule resolves. General rent business-date calculations use organization configuration. In a synthetic UTC+07:00 example, local midnight on 1 October is still 30 September in UTC. Test the boundary and first scheduled runs with the privately verified rule mix. Keep business date-only values separate from UTC timestamps.

### 4. Deposit chronology needs a targeted reproduction

Synthetic chronology case: receive $100 dated 20 October, then refund $100 dated 5 October. The reviewed baseline legacy deposit recorder checks held balance over all unreversed events, without restricting availability to the requested event date. Its historical-negative-balance trigger applies that chronological check only when a `deposit_rent_custody_confirmations` row exists.

This baseline code supports a chronology risk; it does not demonstrate an error in any customer's records. Reproduce with and without custody confirmation in isolation and verify every intermediate date stays valid. Apply equivalent dated-availability tests to owner distributions and corrections. Consult the separate validation evidence for the candidate's synthetic chronology tests.

## Stale-data findings

### 5. An old unsent form can survive reset

Owner contribution forms submit retained property/owner IDs, event date, amount and an idempotency key, with no expected reset generation. An old form dated in October can therefore remain valid after reopening. Retiring completed request keys cannot identify a form whose key was never submitted.

Introduce a database-enforced target organization write lifecycle and a reset generation captured when the user forms the intent. Validate it before replay and side effects. Attaching the current generation only when an old request reaches the server would not detect the stale intent. Apply the same rule to relevant expense/payment/deposit and mixed operational writers; define current-generation handling for schedulers and evidence services.

### 6. Request replay and background work need explicit retirement

Generic idempotency replay validates actor/payload then returns saved result IDs. Some wrappers read the result with `INTO STRICT`, so retaining a result whose financial row was deleted can fail; deleting the request instead can permit the old command to run again. Preserve master-workflow idempotency and original financial intent evidence, while marking old financial results retired or otherwise rejecting old-generation replay.

The deferred-owner-cash runner scans eligible work across organizations and settles using execution-time business date; failures can remain retryable. Rent and activation jobs also operate across organizations. A organization-specific database gate must participate in these paths, with a consistent lock order and proof that already-running writers drained. The protected GitHub writer lock serializes release jobs, not application or cron transactions.

Test uploads paused between Storage upload and registration, late cleanup, committed responses lost in transit, and stale maintenance edits. Existing object-version checks and per-task locks are useful but are not reset boundaries.

### 7. Owner Statement results persist in browser state

`OwnerStatementsReport` keeps fetched statements in React state keyed by owner/property. `loadMany` skips existing keys, including a cached empty result. Collapse/re-expand does not reload a changed statement. The page key includes filters/month/page, but not financial source version or reset generation. The explicit Refresh button performs a full reload and is an existing workaround.

This is a source-confirmed cache behavior; no two-session browser reproduction was run. Reset completion needs a visible stale-state/reload mechanism, new-generation report keys, and protection against delayed old responses overwriting fresh state. Saved report views retain filters rather than totals, but can still select pre-cutover months.

### 8. Financial snapshots are distinct from web caches

Owner posting and opening-entry paths already mark affected periods stale, and the repository has a regression scenario for a late contribution invalidating its month and the following month. Close operations check source hashes/watermarks. These are useful safeguards, but deletion outside normal posting paths cannot rely on INSERT hooks to invalidate everything.

Explicitly retire/regenerate old periods and close chains. For a permitted October backdate after November has been calculated, October and all affected later periods must become stale and regenerate chronologically. A closed/published month needs the existing reviewed correction/reopening process.

Owner draft assembly and P&L/funding load multiple source queries. A request spanning reset/re-entry could observe different states. This is a concurrency risk inferred from read structure, not a reproduced mixed report. Contain financial reads during cutover or reject results whose shared generation/fingerprint changed.

### 9. Published files intentionally preserve an older state

Dashboard/report routes are dynamic; authenticated PDF/XLSX and commercial-document downloads return `private, no-store`. Server cache policy is therefore not the principal gap found. Published documents are deliberately immutable artifacts, with byte length/hash checks. Those checks prove file integrity, not that a document describes the current account.

Commercial publication can return the existing artifact rather than render again. Voided/reversed source state is available in download metadata, but the original PDF can remain historical evidence. Truly missing source rows fail current branch/property resolution; do not assume orphan downloads remain authorized. Archive/retire old financial documents explicitly, keep required evidence recoverable, and prevent old files being presented as current post-reset reports. Previously downloaded copies cannot be recalled by a cache refresh.

## Required acceptance tests before reset

| Test | Required result |
| --- | --- |
| 30 September versus 1 October dates through each writer, cron and historical recovery | Pre-cutover financial effects rejected; valid October backdating accepted; audit timestamp unchanged by business backdating. |
| September billing period with an October issue date | Rejected after reset; an issue-date check alone must not pass it. |
| October invoice, November receipt | October obligation and November cash remain in their correct reports. |
| Missing billing setup in the approved target roster | All eligible leases generate their correct invoice once; missing settings are not silently guessed. |
| UTC and a synthetic UTC+07:00 month boundary | Correct selected month and cutoff across lease/organization clocks. |
| Refund before deposit receipt, with/without custody confirmation | No negative historical custody; a failing case is fixed before proceeding. |
| Old unsent form, old completed key, delayed transaction and response-loss retry | Old intent rejected/retired; no stale financial resurrection or duplicate new entry. |
| Every relevant job during target freeze and after reopening | Target baseline protected; other organizations unaffected; old deferred items cannot consume new contributions. |
| Already-open statement, cached empty state, Back navigation and delayed old response | Fresh generation/refetch required; no old totals or links accepted as current. |
| Report request spans reset | Complete consistent generation or a retry response, never accepted mixed results. |
| October backdate after November period generation | Affected periods stale; chronological regeneration produces correct November opening. |
| Old published artifact after retirement | Explicit historical access or unavailable; never mislabelled current; byte integrity checks retained. |

These are acceptance requirements, not a claim that the reset executor has passed. Use the separate synthetic validation evidence for implemented safeguard results. Resolve actual billing-setup gaps privately and reproduce chronology risks alongside the executor implementation.

## Evidence pointers

All repository line references are for pinned commit `4129597c75f948a83deab46546a58e70a613b6c5`, not necessarily the older primary working tree.

- `supabase/migrations/20260808235616_operational_schema_baseline.sql:1799-1857,9719-9731,10058-10127,18827`, `20260823014504_lease_owned_billing_rules.sql:1311-1328,1754-1761`: replay, generation, effective dates and historical recovery.
- `supabase/migrations/20260822071638_remaining_branch_scope_domain_enforcement.sql:897`, `20260823122317_correct_lease_billing_review_authority.sql:242-367`: month locks and billing clock.
- `supabase/migrations/20260928060000_allow_effective_month_rent_changes.sql:82-158`, `20260928070000_allow_past_lease_activation_dates.sql:1`, `20261005003645_financial_date_audit_integrity.sql:1`: merged backdating and audit safeguards.
- `supabase/migrations/20261001130514_recover_archived_deposit_settlement_and_idempotency.sql:66-94,414`, `20261009233921_deposit_rent_application.sql:283-297`: deposit balance/date candidate; corresponding hosted definitions inspected.
- `src/features/owner-balances/owner-cash-actions.ts:15-16,39-57`, `components/owner-cash-controls.tsx:39-58`, `supabase/migrations/20260921012238_owner_contribution_unit_attribution.sql:30-61`: contribution intent and replay.
- `supabase/migrations/20260914023901_prevent_future_charge_auto_settlement.sql:3-15,56-105`, `20260818221116_process_scheduled_lease_activations.sql:30-108`: deferred settlement and activation writers.
- `src/features/owner-balances/components/owner-statements-report.tsx:21-48,64`, `src/app/(dashboard)/balances/page.tsx:70`: persistent statement state and explicit hard refresh.
- `supabase/migrations/20260916020425_owner_contribution_transaction_correction.sql:1155-1166`, `20260810053705_owner_balance_rollforward_authority.sql:615-655`, `20260810110520_owner_close_authority.sql:1107-1135,1926-1936,2125-2152`, `supabase/tests/owner_balance_rollforward_test.sql:379-405`: stale propagation and close integrity; test inspected, not run.
- `src/features/owner-balances/data/owner-balances.ts:207-243`, `src/features/reports/data/trusted-report.ts:414-430`: separate report source reads.
- `src/features/finance-operations/documents/commercial-document-artifacts.ts:19-22,81-121,188-198`, `supabase/migrations/20260822071638_remaining_branch_scope_domain_enforcement.sql:1049-1073,1173-1194`: published files and missing-source authorization.
- [Next.js useRouter](https://nextjs.org/docs/app/api-reference/functions/use-router) documents preservation of unaffected client state during refresh; [revalidatePath](https://nextjs.org/docs/app/api-reference/functions/revalidatePath) describes server revalidation. Installed Next documentation was unavailable; reviewer used current official docs (16.4.2) while the pinned repository declares 16.3.8. Reproduce against the actual release before relying on framework-specific refresh behavior.
