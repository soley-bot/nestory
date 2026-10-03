# Reporting basis and reconciliation plan

Baseline: main `9b9d7a86a7937d3eff0cd7e84611eaebe2cba04a`. Branch: `fix/report-profit-funding-separation`.

The approved direction is Cash by default, selectable Cash/Accrual, funding outside profit, separate deposit custody, owner-direct income without management-held cash, separate profit/cash, and consistent screen/PDF/Excel values. This document stages that direction rather than claiming it is all implemented.

## Phase 1: remove misleading funding-adjusted profit

This branch removes the P&L total that added contributions and opening property-account activity to operating profit. It retains funding as separately labeled informational rows and preserves unavailable unit attribution. The screen and both export formats identify the existing Accrual basis. Critical warnings remain visible. No posting, fee, authorization, historical data or published-statement logic changes.

The report UI overlaps the reusable contextual-help worker. That worker owns the Help component and integration; this branch supplies copy below. Finance posting and paused CRUD workers own their existing paths; this branch changes only report presentation and report tests.

## Phase 2: canonical basis-aware read model

Introduce explicit basis in parsed/serialized report filters, return links, saved views, filenames and exports. Default to Cash only when its complete source projection is verified. Invalid/unsupported basis fails closed. Existing published statements remain frozen and retained artifacts remain unchanged.

Cash operating profit is not the total of held-owner-cash movements: contributions, distributions, transfers and deposits are not income/expense. Owner-direct rent must remain owner income with zero management-held cash. Accrual continues using signed recognized invoice/cost sources. Each basis-aware event needs company/property/unit/currency, economic class, amount, date, source ID, original/reversal lineage, and settlement evidence where relevant. One model must feed UI, PDF and Excel.

Map cash rent from verified receipt allocations and owner-direct collection allocations; retain original correction/refund signs. Map paid expenses from actual recorded settlement allocations, not submission or approval status alone. An unpaid bill is not a cash expense. Do not equate bank movement with recorded settlement or assume a transfer integration.

Before enabling Cash, review management-fee settlement and retained amounts with IPS: whether fee retention is a paired owner-component transfer, an allocated payment, or another existing settlement. Do not assume every fee occurrence is paid or invent retained categories. Review tenant-paid recoveries and corrections against current responsibility rules. Deposit application to rent requires a linked custody release and invoice settlement; deduction alone is insufficient. A reporting projection that needs material database/security changes requires separate review before implementation.

## Phase 3: comprehensive owner activity and reconciliation bridge

Keep owner activity distinct from cash held by management. Show direct-owner collections, owner dues, held cash, contributions/distributions/transfers, corrections and deposit custody as their own categories/components. Use frozen owner shares and source snapshots for official statements; do not rewrite old publications. Do not present primary-owner property P&L as a co-owner's entitlement. Fix monthly activity completeness before relying on that legacy projection for comprehensive totals.

Explain profit-to-held-cash differences with source-linked receivables, unpaid expenses, direct collections, funding, distributions, component transfers, deposit custody and date differences. Opening `property_account_entries` is a mixed account projection, not canonical available cash. No balancing plug or inferred unit allocation.

## Phase 4: acceptance and release gate

Use an isolated disposable local database with synthetic fixtures; never reset or mutate a shared/hosted database. Existing concurrency suites write fixture memberships and financial records, so they must not be pointed at an existing shared container.

Test source → checked posting command → basis-aware report → screen/PDF/Excel. Cover unpaid/partial/full rent; September recognition/October receipt; owner-direct receipts; fee earned/paid/retained; posted paid cost and unpaid bill; optional pending approval; owner/tenant responsibility and recovery; contribution/distribution/component transfer; deposit receipt/refund/deduction/application; signed full/partial reversals and replacement; co-owner midmonth change; cross-company/branch denial; more than one API page; publication/supersession; backdated concurrent corrections.

Require: each source exactly once; obligations minus active allocations/credits equal outstanding; each owner component opening plus movements equals closing; owner shares sum to source; paired transfers conserve value; custody stays outside profit; funding never changes operating profit; screen/PDF/Excel share basis/scope/dates/amounts and unavailable states; old published bytes/hashes remain stable. Retried commands are idempotent. Failed or canceled correction leaves financial state unchanged; a replacement cannot be implemented as non-atomic delete/re-enter.

Phase 1 synthetic tests validate report models, not database posting. Database verification here was blocked by Docker engine access denial; no database tests or production changes were attempted after that denial. Do not release a Cash selector on presentation tests alone.

## Help worker handoff

Use one optional Help button near the P&L title. The reusable side panel must support keyboard/touch, restore focus on close and preserve filters.

- What this shows: Owner income and expenses recognized in the selected month. Net operating income is income minus expenses.
- Three steps: select month/property/unit; expand an account and open a source; review warnings and export the filtered report.
- Basis help: Accrual means income earned and expenses incurred even before payment; this report uses recorded invoice/cost recognition dates. Cash means income received and expenses paid. In phase 1, state that Cash selection is not yet available.
- Example: September rent recognized in September and paid in October appears in September accrual profit and October cash activity.
- Common questions: funding and deposit custody are outside operating profit; direct-owner collections do not increase cash held by management; unassigned property activity is not guessed into a unit.
- Visible warnings: pending expenses are excluded; profit is not withdrawable cash; opening account activity is not an available cash balance; unavailable unit attribution remains visible.

After phase 2, update copy to reflect the implemented selector and actual settlement rules. No live chat or unimplemented capability should be promised.
