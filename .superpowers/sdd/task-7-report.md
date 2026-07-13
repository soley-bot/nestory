# Task 7 report: aligned Overview operating lenses

## RED / GREEN

- RED: added parameterized Leasing, Maintenance, and Records tests for the shared lens grammar. The focused test failed because the legacy screen exposed `All` / `Finance` and chart-first branches rather than the required workspaces.
- RED: added a Property finance workspace assertion for a ranked expense queue, compact metrics, and readiness aside. It failed against the previous single-link placeholder.
- GREEN: composed Overview through `OverviewHeader`, `PortfolioWorkspace`, `PropertyFinanceWorkspace`, and the new `OverviewLensWorkspace`. The focused Overview suite passes.

## Lens behavior

- Portfolio remains the Task 6 property cash scorecard and selected-property detail.
- Property finance preserves URL-backed Collections, Expenses, Management fees, Owner statements, and Property transactions. It now shows real property-performance metrics, ranked property rows, exact module links, and an attention/readiness aside.
- Leasing ranks properties by current occupancy and exposes vacancy/gap, expiry, and active-lease work with supporting lease/occupancy evidence.
- Maintenance surfaces open Overview work and unpaid-bill signals. Paid maintenance cost is explicitly marked unavailable because current Overview data does not separate maintenance payments from other property expenses; the action opens the real expenses module.
- Records surfaces statement blockers, missing owner/record links, reporting readiness, and direct repair/report actions.
- Charts are supporting evidence below the primary queue. Layout uses existing neutral semantic tokens, dense borders, overflow-safe navigation, and responsive grids.

## Removed code

- Removed the property-performance-to-company finance adapter.
- Removed legacy company finance view types, company summary/property/receivable types, legacy company subtabs, company P&L rendering, owner receivables rendering, and dormant company metric helpers/imports.
- Production Overview code contains none of the forbidden company-accounting copy; remaining matches are negative assertions in tests.

## Commands and results

- `npm run test -- src/features/overview/components/overview-screen.test.tsx` — RED, then GREEN.
- `npm run test -- src/features/overview` — PASS, 4 files / 38 tests.
- `npx tsc --noEmit` — PASS.
- `npm run lint -- "src/features/overview/**/*.{ts,tsx}"` — PASS.
- `rg -n -i "company p&l|company costs|owner receivables|journal health|general ledger|companyFinance|OverviewCompanyFinance|OverviewOwnerReceivable|OverviewLegacyFinanceView" src/features/overview` — only negative test assertions.

## Files

- `src/features/overview/components/overview-lens-workspace.tsx`
- `src/features/overview/components/overview-screen.tsx`
- `src/features/overview/components/overview-screen.test.tsx`
- `src/features/overview/components/property-finance-workspace.tsx`
- `src/features/overview/overview.types.ts`

## Concerns

- Current Overview data has no maintenance-only paid-cost aggregation or per-property maintenance case counts. The UI reports this honestly and links to the source modules rather than deriving a false value.
- Records uses exact known attention contracts and shows `Not calculated` when a dedicated owner/lease-link total is absent.

## Review follow-up

- Leasing expiry now uses the loader's exact `leaseRiskCount` 60-day contract rather than summing six-month chart buckets.
- Maintenance open work now matches only the exact `Open maintenance` attention item. Paid maintenance cost remains honestly `Not calculated`; its exact source action is `expenseType=maintenance&status=paid`. The all-status source action is labeled `Maintenance expenses`, not unpaid bills.
- Records now recognizes only exact `Properties without owner link` and `Leases missing tenant link` attention contracts. Statement blockers remain a separate property-performance readiness value. Missing dedicated totals render `Not calculated`.
- Nonfinance destination helpers preserve selected property and month where supported; Overview-internal review links use `buildOverviewHref` and retain month/property state.
- Property-finance rankings are view-specific and deterministic: arrears/collection rate, paid expenses, fee outstanding/receipt ratio, statement blockers, or absolute cash movement.
- Rent & Income now parses `incomeScope=management-fees` and applies the four supported fee types server-side. Bills & Expenses parses `expenseType` and applies it server-side. Both filter surfaces preserve the selected scope.
- Added mobile semantic priority-card markup equivalent to the desktop ranked queue.
- Follow-up verification: 10 focused files / 54 tests passed, then Overview focused tests passed 17/17; TypeScript and targeted lint passed.
