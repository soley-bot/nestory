# Compact Dual-Orientation Unit Profit And Loss Design

## Goal

Produce two comparison PDFs for the Unit 09A July 2026 profit and loss
statement:

- compact A4 portrait
- compact A4 landscape

Both versions use the same sample rows, ordering, labels, and totals. These are
comparison artifacts, not the production report contract. Production now uses
the selected-unit portrait statement plus portrait source appendix; all-unit
exports retain the traceable landscape summary.

The design should feel like a restrained spreadsheet prepared for a client:
dense enough to scan quickly, but still clearly grouped into income, expenses,
subtotals, and net income.

## Approved Direction

The approved comparison uses these rules:

- document title on the upper left
- client logo on the upper right
- exactly two metadata rows below the title
- four table columns: Date, Category, Description, Amount
- category shown on every transaction row beside its description
- no standalone category rows
- narrow transaction rows and reduced line spacing
- smaller top, bottom, and side margins
- the same content in portrait and landscape
- no large summary card above the table

## Branding Boundary

The sample documents use the reviewed IPS Cambodia logo originally published
online:

`https://biz.prlog.org/IPSCambodia/logo.png`

The generator reads a checksum-locked local copy and never downloads the logo
during a runtime request. The mark is shown as an aspect-fitted image on a
white background. Excess
whitespace around the published mark may be trimmed, but the logo itself must
not be redrawn, recolored, stretched, or otherwise altered.

This comparison is sample-only branding. It does not add an organization logo
column, upload control, storage bucket, settings screen, or per-organization
branding workflow. Product-level logo configuration is a separate follow-up
decision.

Remove the visible `Nestory` sample label from the header. The footer contains
only the statement label and page number, so the document reads as
client-facing rather than as a Nestory marketing sample.

If a future production renderer has no client logo, it should fall back to the
organization name in the same upper-right area.

## Shared Page Structure

### Header

The first visual row contains:

- `Profit and loss details` on the left
- the IPS logo on the right

The title and logo share the same compact header band. The logo is aligned to
the page's right content edge and must not increase the header height beyond
what the title requires.

Below that band, show exactly two metadata rows:

1. `Property: <property name> | Unit: 09A`
2. `Period: <start>-<end> | Generated: <date> | Cash basis`

Do not give property, unit, period, generated date, or cash basis their own
additional rows. Do not show report-purpose copy, technical trace text, source
counts, readiness language, or a net-income card.

### Table

Use the same four columns in both orientations:

1. Date
2. Category
3. Description
4. Amount

Category is repeated for each transaction and appears on the same row as its
description. It is set in semibold or bold text with restrained accent color.
Give category text a small left inset beneath its Income or Expenses section
so the grouping still reads as an indented hierarchy. Description remains
regular-weight body text. This replaces the previous standalone category row
plus indented child-row structure.

Income and Expenses remain separate sections. Each section begins with one
slim, lightly shaded section row. Transaction rows follow immediately.

Rows use:

- approximately 7.8-8 point body text
- approximately 9-9.5 point line spacing
- a 16-18 point minimum row height
- roughly 3-4 points of vertical cell padding
- fine horizontal rules
- a white background without heavy cards

Descriptions may wrap to a second line. A wrapped row grows only enough to
contain the second line and may not collide with the following row.

Amounts are right-aligned and currency remains explicit. The current sample
contains no reversals; production preserves negative income and expense
reversal signs and never ellipsizes a financial value.

### Subtotals And Final Totals

End Income with `Income subtotal` and Expenses with `Expenses subtotal`.
Subtotal rows use the table grid and remain compact.

After Expenses, show a right-aligned three-row totals stack:

- Total income
- Total expenses
- Net income

Net income receives the strongest weight. Do not place it inside a large
filled card.

### Footer

Use a minimal footer:

- `Unit financial statement`
- `Page X of Y`

The footer uses one fine rule and no client or Nestory marketing copy.

## Portrait Variant

- A4 portrait: 595 by 842 points
- approximately 28-point side margins
- approximately 24-point top and bottom margins
- title around 18 points
- logo constrained to approximately 90 by 34 points
- table width approximately 539 points

Suggested column widths:

- Date: 70 points
- Category: 125 points
- Description: 255 points
- Amount: 89 points

The compact layout should fit the current 20 Unit 09A transactions and totals
on one page unless multiple descriptions require two lines.

## Landscape Variant

- A4 landscape: 842 by 595 points
- approximately 28-point side margins
- approximately 22-24-point top and bottom margins
- title around 17-18 points
- logo constrained to approximately 105 by 38 points
- table width approximately 786 points

Suggested column widths:

- Date: 78 points
- Category: 180 points
- Description: 423 points
- Amount: 105 points

Landscape uses the extra width for category and description readability. It
does not introduce extra fields, because the comparison must isolate the
effect of orientation rather than compare two different report contents.

## Data And Ordering

Use the locked Unit 09A July 2026 comparison fixture. It is approved only for
layout comparison and is not financial authority for production output.

Preserve:

- Income before Expenses
- existing deterministic line order within each section
- transaction dates
- normalized categories
- descriptions
- stored currencies and amounts
- report summary totals

The checksum-locked comparison fixture contains 20 sample transactions:
8 income rows and 12 expense rows. Its expected summary is:

- Total income: USD 1,045.00
- Total expenses: USD 788.00
- Net income: USD 257.00

The comparison detail and displayed subtotals must reconcile with these sample
values. Production totals instead come from resolved unit-linked operating
`propertyCashEvents` using exact bigint cents.

## Pagination

Both variants target one page for the current fixture.

If content grows:

- repeat a compact title, scope, period, and table header
- repeat the active Income or Expenses section label with `(continued)`
- never repeat a standalone category heading because categories live on entry
  rows
- keep a subtotal with the final transaction when space allows
- keep the three final totals together
- retain the compact footer and page number

## Output Artifacts

Generate:

- `IPS-Unit-09A-Profit-Loss-July-2026-Portrait.pdf`
- `IPS-Unit-09A-Profit-Loss-July-2026-Landscape.pdf`

Place both files in the comparison output PDF directory. Also rasterize page 1
of each PDF for visual review.

## Product And Code Boundaries

- The authenticated Reports screen does not change.
- The current PDF endpoint and authentication boundary do not change.
- Excel export does not change.
- Other report kinds and their PDF layouts do not change.
- No database migration or organization-settings work is included.
- No logo is fetched from the internet at request time.
- The comparison generator uses a local, reviewed IPS sample asset.
- Orientation selection is not exposed in product UI during this comparison.

## Verification

Implementation is complete when:

1. Focused tests prove the unit statement places category and description on
   the same transaction row without standalone category rows.
2. Focused tests prove the header contains exactly two metadata rows and no
   visible `Nestory` sample label.
3. Portrait and landscape PDFs report the correct A4 media boxes.
4. Extracted text from both PDFs contains the same 20 dates, categories,
   descriptions, amounts, section labels, subtotals, and final totals.
5. Both PDFs reconcile to USD 1,045.00 income, USD 788.00 expenses, and
   USD 257.00 net income.
6. Page 1 of each PDF is rasterized and visually inspected for logo distortion,
   clipping, overlap, excess whitespace, weak hierarchy, and unreadable rows.
7. Existing PDF tests for unrelated report kinds remain green.

## Out Of Scope

- organization logo upload or storage
- persistent organization branding settings
- automatically downloading remote logos during report generation
- changing report calculations or financial authority
- adding new transaction fields or report types
- redesigning the Reports application screen
- changing the production decision: selected-unit exports use portrait plus a
  complete portrait source-trace appendix, while all-unit exports retain the
  traceable landscape summary; these dual-orientation files remain sample-only
