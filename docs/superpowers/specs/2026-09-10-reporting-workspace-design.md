# Reporting workspace

User approved the DoorLoop gap analysis and requested implementation beyond expenses, with DoorLoop UI/UX as reference. This scope extends Nestory's existing internal reporting workspace; owners remain managed records.

## Experience

A dense report directory grouped by Transactions, Rent and Owners replaces the three large cards. Add Transactions, Management fees, Rent roll and Rent collections. Keep Owner activity, Unit P&L and official statements. Use compact navigation between reports, a quiet filter toolbar, an optional Columns menu, grouping, source details, consistent export, and named browser-local saved views explicitly labeled as such. No dashboard decoration or marketing language.

Transactions and management fees use a custom date range plus property/unit, search, type, status and payee filters where authoritative data supports them. Rent collections shows charges, received and outstanding with due dates; rent roll is a current snapshot and must say so rather than pretend to reconstruct historical occupancy. Monthly owner reports retain their validated month semantics. Report screen and export share filters and must not silently truncate totals.

## Data

Reuse scoped finance context, authenticated Supabase reads and existing authoritative report/operational sources. Implement new report loaders in dedicated files. Do not expose retired generic builders without testing their current source coverage. Transactions includes rent charges, recorded receipts, paid costs and management fees with distinct types and separate totals: charges must never be summed as cash receipts, nor incurred management fees as paid vendor costs. Preserve signed reversals, source identities and source links; skip cancelled financial effects or explicitly label them without affecting totals. Do not count parent and children twice. Property/unit filtering is applied before totals. Multi-line records use clear line-level rows and source links where necessary.

Management fees show actual fee occurrences and dates; no inferred IPS vendor mapping from text. A current/scheduled billing-rule audit is supplementary only if authoritative effective-dated data is available. Never change financial data from a report. Fail closed on incomplete/failed source reads, permissions or excessive scope.

## Shared contracts

Extend ReportKind with transactions, management-fees, rent-collections (rent-roll already exists). ReportsViewQuery adds optional dateFrom/dateTo/query/transactionType/transactionStatus/payeeId/groupBy/columns. All remain optional for compatibility with existing fixtures. TrustedReport may expose filterOptions and presentation columns through a shared presentation layer. Shared filtering and grouping is applied server-side before screen preparation and export. Views store filter preferences only, scoped to organization/user in the browser, never report rows.

## Verification

Source tests cover scoped reads, pagination, exact money, reversal/cancellation handling, split lines, source failure and filtered totals. UI tests cover filters, navigation, saved-view isolation, column controls and export links. Existing owner report outputs and permissions remain compatible. Browser-test local fixture reports and downloads at desktop/mobile widths. Run lint, type check, full application/database CI and review before authorized Pilot release. Production database writes, if needed, only through exact-main protected CI. No hosted financial mutations.
