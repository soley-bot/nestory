# Cash report presentation draft

`presentOwnerReport` converts the pure owner-report model into the shared generic
PDF/Excel presentation. It has no live route, source reader, permission grant or
posting command. Existing live P&L reports remain Accrual. This draft does not
enable Cash reporting or change the default basis of any live report.

The adapter preserves the model's nullable totals, basis, settlement dates,
scope, source fingerprint, reversals, coverage warnings and separate custody,
funding and unassigned activity. It does not infer management-held cash from
profit or certify that its supplied facts are complete or authorized. A stale
expected fingerprint requires a refresh. The legacy detail P&L renderer is not
used for this adapter because it assumes Accrual and derives totals from detail.

`preserveRowDetails` opts generic exports into continuation rows for long text.
Money appears only on the original row. Excel header styling, filters and frozen
panes follow the actual header position after text expansion. Published owner
statement renderers and stored statements are outside this path.

## Integration dependencies

The presentation patches were prepared over a preserved report-model draft.
They cannot compile alone on base `f2c664d` because `owner-report-model.ts` is
absent there. This integration includes that pure module and its existing model,
acceptance and export-parity tests. Its only production import is the existing
exact-money parser. It does not include snapshot readers, source access changes,
deposit-to-rent readers/commands, draft SQL or migrations.

The preserved tests also exposed a PDF presentation mismatch: the existing
Accrual statement printed subtotals from summary strings, while UI/Excel derived
them from detail cents. The accompanying small correction uses the same existing
`profitLossSummaryRows` function for PDF subtotals. This applies to the existing
Accrual renderer; it does not change financial postings or Cash timing policy.

## Before live Cash activation

- Resolve the owner-expense timing of manager-funded vendor costs and markup.
  The pure model currently leaves affected Cash expense/profit totals unavailable.
- Certify complete authorized source root sets and consistent source snapshots
  under the intended roles, properties, units and branches.
- Establish and verify canonical deposit-to-invoice settlement linkage before
  classifying any deposit application as rent income. Custody activity alone is
  not settlement evidence.
- Independently validate source readers, SQL transactions, rollback/idempotency
  and concurrency. Synthetic model/export tests do not establish these facts.

These gates are separate from this disconnected presentation draft. No access
expansion, transaction change or live Cash activation is part of this integration.
