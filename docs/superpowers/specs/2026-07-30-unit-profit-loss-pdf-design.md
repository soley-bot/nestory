# Unit Profit And Loss PDF Design

## Goal

Redesign the Monthly Unit Profit & Loss PDF as a clean portrait financial
statement. The document should borrow the hierarchy and restraint of the OpenAI
invoice reference in Google Drive while remaining a Nestory report with
Nestory data, language, and identity.

The PDF must make the selected unit's financial activity understandable
without requiring the reader to follow source counts or interpret an aggregate
unit row.

## Reference And Adaptation Boundary

The visual reference is `OpenAI/Invoice-5JMNBAPS-0006.pdf` in the user's Google
Drive.

Adapt these structural qualities:

- portrait, single-document reading order
- sparse organization and document title header
- clearly separated identity and date metadata
- line items with the applicable date beside each description
- restrained rules and neutral typography instead of metric cards
- compact, right-aligned subtotals and final total

Do not copy OpenAI branding, company details, invoice identifiers, payment
language, tax treatment, or proprietary wording. This remains a Nestory
Monthly Unit Profit & Loss statement, not an invoice.

## Data Authority

The detail lines come only from unit-linked `ledger_entries` already loaded by
the Monthly Unit Profit & Loss report for the selected organization, scope, and
month.

Each PDF line contains:

- transaction date from `ledger_entries.transaction_date`
- income or expense direction
- normalized category
- ledger description, with the category used only when the description is
  empty
- property label
- unit label
- exact stored amount and currency
- ledger source identity retained in the report data

Property-level ledger rows are not assigned to a unit. The PDF must not combine
ledger rows with receipt, payment, obligation, or Owner Statement sources.

The existing summary calculation remains authoritative for total income,
expenses, and net income. Detail-line subtotals must agree with those summary
values for the same scope.

## Document Structure

The unit report uses portrait A4 dimensions.

### Header

The first page contains:

1. organization name with a small Nestory product label
2. `Monthly Unit Profit & Loss` as the document title
3. selected unit and property identity
4. statement period
5. generated date
6. `Cash basis` accounting label

Do not show report-purpose copy, source-count cards, trace labels, technical
readiness language, invoice numbers, due dates, or payment actions.
Net income appears once in the final totals stack, not in a separate header
card.

### Income

Show an `Income` section with columns:

- Date
- Description
- Category
- Amount

Sort lines by transaction date, then category, then stable source identity.
End the section with `Income subtotal`.

### Expenses

Show an `Expenses` section using the same columns and sort order. Display
expense amounts as positive magnitudes inside the expense section. End the
section with `Expenses subtotal`.

### Totals

After the two sections, show a compact right-aligned totals stack:

- Total income
- Total expenses
- Net income

Net income equals total income less total expenses and receives the strongest
typographic emphasis.

### Footer

The footer contains:

- `Nestory unit financial statement`
- page number

Source links and record counts remain available in the authenticated Nestory
screen rather than being printed as PDF decoration.

## Pagination

- Repeat the document title, selected scope, period, and table column labels on
  continuation pages.
- Keep a section heading with at least one following transaction row.
- Keep a section subtotal after its final transaction row when space permits;
  otherwise move the subtotal to the next page.
- Keep the three final totals together.
- Long descriptions may wrap to two lines and must not overlap the next row.
- Empty Income or Expenses sections still appear with `No income recorded` or
  `No expenses recorded` and a zero subtotal.

## Product And Code Boundaries

- The authenticated Reports screen and its aggregate unit table do not change.
- Excel export does not change in this slice.
- Owner Statement and Management Fee Statement PDF layouts do not change.
- The PDF endpoint and authentication boundary do not change.
- The report data type gains only the structured ledger detail required by this
  PDF.
- The shared PDF writer may accept page dimensions, but existing landscape
  exports must retain their current media boxes.

## Verification

Implementation is complete when:

1. A failing report-data test proves dated income and expense ledger lines are
   absent before implementation.
2. A failing PDF test proves the unit statement lacks the new portrait,
   section, date, subtotal, and net-income structure before implementation.
3. Focused report and PDF tests pass after the smallest implementation.
4. Existing Owner Statement, Management Fee, and generic report PDF tests
   remain green.
5. The authenticated Unit 09A July 2026 export contains its July rent and
   repair rows with their ledger dates.
6. The generated PDF reports portrait A4 dimensions through `pdfinfo`.
7. Every generated page is rasterized and visually inspected for clipping,
   overlap, weak hierarchy, or unreadable text.
8. Extracted PDF text contains the selected unit, period, both section labels,
   transaction dates, subtotals, and final net income.

## Out Of Scope

- Copying OpenAI branding or reproducing the reference invoice exactly
- Adding tenant, lease, maintenance, document, or timeline sections
- Creating tax, payment, invoice, or owner-distribution calculations
- Changing financial authority or introducing new report kinds
- Redesigning the Reports application screen
