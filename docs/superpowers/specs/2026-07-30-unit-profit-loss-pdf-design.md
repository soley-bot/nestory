# Unit Profit And Loss PDF Design

## Goal

Redesign the Monthly Unit Profit & Loss PDF as a clean portrait financial
statement. The document should borrow the hierarchy and restraint of the OpenAI
invoice reference in Google Drive, plus the indented category hierarchy of the
IPS Meeting Summary reference, while remaining a Nestory report with Nestory
data, language, and identity.

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
- spreadsheet-style category labels with their transaction details indented
  beneath them
- restrained rules and neutral typography instead of metric cards
- compact, right-aligned subtotals and final total

Do not copy OpenAI branding, company details, invoice identifiers, payment
language, tax treatment, or proprietary wording. This remains a Nestory
Monthly Unit Profit & Loss statement, not an invoice.

## Data Authority

The detail lines come only from resolved, unit-linked operating events in the
canonical `propertyCashEvents` contract for the selected organization, scope,
and month. `ledger_entries` can remain linked evidence, but it is not the
financial authority for this statement.

Each PDF line contains:

- canonical cash-event date
- income or expense direction
- normalized category
- canonical source type as the compact description
- property label
- unit label
- exact signed bigint cents and currency, without a JavaScript `number`
  conversion
- canonical event and source identity retained in the report data

Property-level, owner-funding, deposit, company-fee, non-operating, and
unresolved events are not assigned to a unit statement. Receipt and payment
allocations are valid statement sources when the canonical cash-event contract
classifies them as resolved unit-linked operating activity.

The canonical event calculation remains authoritative for total income,
expense magnitude, and net income. Detail-line subtotals must agree exactly
with those summary values for the same scope. Income and expense reversals
retain their negative signs in their respective sections.

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

Do not show report-purpose copy, source-count cards, technical readiness
language, invoice numbers, due dates, or payment actions in the statement body.
Net income appears once in the final totals stack, not in a separate header
card.

### Income

Show an `Income` section with columns:

- Date
- Category / Description
- Amount

Show each normalized category once as a compact group label. Place its dated
transaction descriptions beneath it with a visible indent. Preserve the
existing deterministic line order within each category and order category
groups by their first transaction in the report data.
End the section with `Income subtotal`.

### Expenses

Show an `Expenses` section using the same columns and sort order. Normal
expenses display as positive magnitudes; expense reversals display as negative
amounts. End the section with `Expenses subtotal`.

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

After the statement body, append a portrait `Source trace` section containing
the report row, source label and record type, exact source ID, and operator
link for every source. The appendix uses the full uncapped export data and
continues the document's global `Page X of Y` numbering.

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
- Financial values must render in full and must never be ellipsized.

## Product And Code Boundaries

- A selected unit uses the production portrait statement and portrait source
  appendix. `All units` keeps the existing traceable landscape summary so each
  report row retains its unit identity and full sources.
- The authenticated Reports screen and its aggregate unit table do not change.
- Excel export does not change in this slice.
- Owner Statement and Management Fee Statement PDF layouts do not change.
- The PDF endpoint and authentication boundary do not change.
- The report data type gains only the structured canonical cash-event detail
  required by this PDF.
- The shared PDF writer may accept page dimensions, but existing landscape
  exports must retain their current media boxes.

## Verification

Implementation is complete when:

1. A report-data test proves dated income and expense detail comes only from
   resolved unit-linked canonical operating cash events.
2. A failing PDF test proves the unit statement lacks the new portrait,
   section, date, subtotal, and net-income structure before implementation.
3. Focused report and PDF tests pass after the smallest implementation.
4. Existing Owner Statement, Management Fee, and generic report PDF tests
   remain green.
5. A selected-unit export retains income and expense reversal signs, exact
   bigint cents, and every canonical source identity and operator link.
6. The generated PDF reports portrait A4 dimensions through `pdfinfo`.
7. Every generated page is rasterized and visually inspected for clipping,
   overlap, weak hierarchy, or unreadable text.
8. Extracted PDF text contains the selected unit, period, both section labels,
   transaction dates, subtotals, final net income, source trace, exact source
   IDs, and operator links.

## Out Of Scope

- Copying OpenAI branding or reproducing the reference invoice exactly
- Adding tenant, lease, maintenance, document, or timeline sections
- Creating tax, payment, invoice, or owner-distribution calculations
- Changing financial authority or introducing new report kinds
- Redesigning the Reports application screen
