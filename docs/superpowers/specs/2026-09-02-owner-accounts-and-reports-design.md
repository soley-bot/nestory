# Owner Accounts and Reports Design

**Status:** Corrected product design; awaiting review

**Date:** 2026-09-02

**Implementation base:** `9c618d0d718c0508b7587c080c7727885455ea9e`

## 1. Correct product boundary

Nestory is used only by the property-management company. Property owners are records managed by company staff; they are not Nestory users and will not receive an account, invitation, portal, or direct access to any Nestory page, API, report, or stored artifact.

The requested work is therefore an internal **Owner Accounts & Reports** experience for authorized company staff. Its job is to help staff understand each owner's position, review property activity, close periods, and produce trustworthy reports that staff can download and deliver through their existing business process.

This replaces the earlier external-owner-portal design in full.

This document authorizes planning and local implementation only. It does not authorize a hosted database write, merge to `main`, Pilot deployment, production deployment, or delivery of a report to a real owner.

## 2. Product principles

1. **Company-operated:** every screen uses the existing organization membership and staff permission model.
2. **Owner-centered, not owner-facing:** staff see the operational context needed to investigate and explain an owner's account.
3. **Simple navigation:** the Owner accounts workspace should feel as direct as a chart of accounts, not like a second accounting system.
4. **Fast routine work:** viewing, filtering, previewing, printing, and downloading require no confirmation.
5. **Safe financial authority:** corrections, close, publish, supersede, and opening-balance actions remain permission-gated and auditable.
6. **Clear truth:** live activity, draft close data, official publications, and superseded publications are never visually blended.
7. **Strong reporting:** match DoorLoop's useful owner-reporting flow where practical and improve on it through traceable close state and immutable official statements.

## 3. Scope

### Included

- Improve the existing `/balances` Owner accounts workspace.
- Improve the existing `/reports` report center and report-detail pages.
- Connect an owner record to its properties, balance, activity, close state, and statements.
- Provide fast property, owner, month, unit, and report-status filtering where relevant.
- Preserve official Owner Statement PDF and Excel artifacts.
- Improve live Owner activity and Unit Profit & Loss reports.
- Add an Owner balance summary report if the underlying authority can be reused safely.
- Make report status, totals, empty states, errors, and export behavior consistent.
- Provide responsive layouts and accessible keyboard operation.
- Verify parity between visible totals, exports, close data, and underlying finance events.

### Excluded

- Any external owner portal, owner sign-in, owner invitation, or owner identity table.
- Direct owner access to reports or downloads.
- Automated email delivery to owners.
- Owner contributions, payments, requests, documents, or maintenance workflows.
- Ledger and petty cash changes.
- A generic report builder, custom formulas, saved views, and scheduled reports.
- Bank reconciliation, bank feeds, payroll, tax filing, and full general-ledger accounting.
- Changes to unrelated People, Lease, or Maintenance workflows.

## 4. Information architecture

The existing authenticated dashboard remains the only application shell.

```text
Finance
├── Portfolio review        /finance
├── Rent & collections      /rent-income
├── Expenses                /bills-expenses
├── Owner accounts          /balances
├── Reports                 /reports
└── Advanced                /finance/advanced
```

Ledger and petty cash stay under Advanced and are outside this work.

The existing `/owners` People view remains the place to maintain owner contact and ownership records. `/balances` is the financial workspace for those owners. The UI should link between them without duplicating editing controls.

The owner financial journey is:

```text
Owner accounts list
  -> select owner/property/month
  -> review position and close readiness
  -> inspect activity
  -> preview official statement
  -> publish or download when authorized
```

Reports provide the portfolio-wide entry point:

```text
Reports
  -> choose a fixed report
  -> set owner/property/month/unit filters
  -> review results
  -> print or export
```

## 5. Owner accounts workspace

### 5.1 Default list

`/balances` opens as a dense, scan-friendly table of owner accounts. It is closer to a chart-of-accounts experience than a dashboard of cards.

Recommended columns:

- Owner
- Properties
- Current balance
- Current-month movement
- Last closed month
- Latest statement
- Attention

The default sort places accounts requiring attention first, followed by owner name. Search matches owner, property, and property code. Quick filters cover All, Needs attention, Ready to close, Closed, and No activity. Staff can open an account by selecting its row; the row has one clear primary action rather than multiple competing buttons.

Amounts use one organization currency and consistent debit/credit semantics. If positive and negative balances have business labels such as `Due to owner` and `Owner owes`, those labels appear beside the amount and are never communicated by color alone.

### 5.2 Owner account detail

The detail view keeps the selected owner, property, and month visible. Its information hierarchy is:

1. **Position:** opening balance, income, expenses, withdrawals/distributions, adjustments, and closing balance.
2. **Period state:** Live, Ready to close, Closed, Official, or Superseded, with effective dates.
3. **Activity:** the transactions and events that explain the movement.
4. **Statement:** latest official artifact plus history.

The page uses three internal sections or tabs:

- **Summary** — balance bridge, current period totals, ownership context, and close readiness.
- **Activity** — filterable event list with source-safe human descriptions.
- **Statements** — immutable publication history with PDF/Excel downloads.

The owner selector is searchable. Property options are limited to properties related to that owner for the selected effective period. When one owner owns multiple properties, staff can view one property at a time and an explicitly labeled All properties summary when the data contract supports exact aggregation.

### 5.3 Empty and exception states

- No owner records: link authorized staff to Add owner.
- Owner has no property: explain that ownership must be added in the owner record.
- No opening balance: show setup status and the permitted next action.
- No activity: say there was no activity for the selected period; do not imply a loading failure.
- Live data unavailable: show unavailable, not `$0`, and offer a safe retry.
- Closed but unpublished: explain that the close exists and the statement has not been published.
- Superseded statement: keep it visible in history with a clear Superseded label and the current official version nearby.

## 6. Reports workspace

The report center stays intentionally small and task-oriented. Each report card states its purpose, required filters, live/official status, and available formats.

### 6.1 Phase 1 report set

#### Official Owner Statement

- Audience: company staff preparing or retrieving an owner statement.
- Scope: exact owner, property, and closed month.
- Status: draft close preview, Official, or Superseded.
- Output: immutable numbered PDF and Excel artifacts.
- Entry points: Reports and the selected Owner account.

#### Owner Balance Summary

- Audience: finance staff reviewing the portfolio before close or distribution.
- Scope: selected month with optional owner and property filters.
- Columns: owner, property, opening balance, income, expenses, withdrawals/distributions, adjustments, closing balance, and close status.
- Output: screen, print/PDF, and safe Excel export.

#### Owner Activity

- Audience: staff investigating the movement behind an owner's balance.
- Scope: selected month with owner, property, and category filters.
- Categories: rent, management fees, property costs, withdrawals/distributions, corrections, and other account activity.
- Output: screen, print/PDF, and Excel.

#### Unit Profit & Loss

- Audience: staff comparing unit performance within a property.
- Scope: selected property and month with optional unit filter.
- Output: screen, print/PDF, and Excel.

The product may call Owner Activity `Cash Activity` if user testing shows that name is clearer, but the underlying report must remain the same authoritative event view rather than a second calculation.

### 6.2 Report interaction

- Defaults use the current month and the most recently relevant in-scope property or owner.
- Filter state is URL-backed so refresh and browser navigation are reliable.
- Required filters are grouped in one compact bar.
- Apply is unnecessary when a safe filter can update immediately; expensive reports use one clear Run report action.
- Reset returns to documented defaults.
- Totals remain visible when scrolling long result sets.
- Export actions sit beside the report title/status, not at the bottom of the table.
- A report result always displays its owner/property/month scope and `Live through`, `Closed`, `Official`, or `Superseded` status.
- Download and print do not show confirmation dialogs.

## 7. Routine speed and financial safeguards

### No confirmation required

- Open an owner account.
- Change owner, property, month, unit, or category filters.
- Clear filters.
- Preview a report.
- Print or download an already authorized report.
- Navigate between the owner record, account, activity, and statements.

### Explicit review required

- Set or replace an opening balance.
- Create a correction or adjustment.
- Close a month.
- Publish an official statement.
- Supersede an official statement.
- Reopen or otherwise change closed-period authority, if supported.

The final confirmation for a financial authority action shows the owner, property, month, resulting balance, and consequence. Typing a phrase is not required for normal close or publish work. Superseding an official artifact requires a reason and clearly identifies which publication becomes historical.

Every mutation remains protected by server-side organization and permission checks. Hiding a button is not authorization.

## 8. Authorization and data boundary

No owner-auth schema or external route group is created.

All access continues through the existing host-scoped company context:

```text
authenticated user
  -> active organization membership
  -> role capability
  -> organization-scoped finance operation
```

Implementation uses the repository's actual finance capabilities rather than inventing a parallel permission system. At minimum, viewing reports, recording or correcting finance, closing periods, and publishing statements remain separable authorities where the existing model separates them.

Security-definer database functions must keep an empty `search_path`, bind the authenticated company user and organization internally, and expose only the necessary result. Existing function grants must not be broadened merely to simplify a screen.

Report routes must reject foreign organization, owner, property, close revision, publication, and artifact identifiers. Protected artifacts remain organization-scoped and private. Every download re-authorizes the requested artifact before reading it.

## 9. Data truth and report integrity

- `supabase/migrations` remains the forward-only schema source of truth.
- Live reports reuse the authoritative finance-event adapters; they do not introduce competing total calculations.
- Official statements reuse closed revision and immutable publication authority.
- Published PDF and Excel downloads return the exact stored bytes and pass integrity verification.
- Money remains exact decimal/string data through calculation and rendering; JavaScript floating point is not accounting authority.
- Every supported event source has an approved staff-facing label.
- Raw source diagnostics such as `sources=`, database table names, or unformatted IDs never appear in visible report columns.
- Unknown source types render a neutral human label in live internal views and fail official publication until mapped.
- Preview and official output clearly identify which is which.

The current internal evidence workbook may retain identifiers required for audit if that is its approved purpose, but the visible workbook surface must label them intentionally and must never expose raw debug strings. Any owner-delivery copy created later requires a separate reviewed redaction contract; it is not part of this phase.

## 10. UX laws and interface rules

- **Visibility of system status:** every balance and report states Live, Ready to close, Closed, Official, or Superseded and includes a period/as-of date.
- **Recognition over recall:** owner and property names replace UUIDs; filters remain visible; terminology matches the close workflow.
- **Hick's law:** a short report catalog and one primary row action prevent choice overload.
- **Progressive disclosure:** the list supports scanning; account detail reveals the full balance bridge and audit trail.
- **Error prevention:** authority actions are permission-gated and summarize their financial effect before execution.
- **User control:** routine navigation and filtering is immediate, reversible, and does not trigger discard warnings.
- **Consistency:** the same money, date, status, filter, table, empty-state, and download patterns apply throughout Finance.

Desktop uses dense tables appropriate for daily operations. Mobile uses stacked records for owner accounts and activity, keeps the selected owner/property/month visible, and preserves at least 44-by-44 CSS-pixel interactive targets. Keyboard order, visible focus, screen-reader labels, contrast, and non-color status cues are required.

## 11. DoorLoop baseline and Nestory target

DoorLoop is the baseline for discoverability and report access, not the product model for external owner usage.

| Capability | DoorLoop baseline | Nestory target |
| --- | --- | --- |
| Owner financial overview | Owner and staff views | Faster internal owner-account list plus balance bridge |
| Property filtering | Supported | Owner-aware property scope with persistent month context |
| Owner statements | View, generate, download | Closed-period preview plus immutable Official/Superseded artifacts |
| Owner activity | Portal and staff workflows | Internal investigation view tied to authoritative finance events |
| Profit & Loss | Broad report access | Focused Unit P&L with clear live scope |
| Report exports | PDF/Excel | Exact official artifacts plus safe live-report exports |
| Status clarity | Functional | Stronger Live/Closed/Official/Superseded language |
| Close integrity | Product-dependent | Explicit close authority and immutable publication history |
| External owner portal | Supported | Intentionally absent |

Nestory should be as fast as DoorLoop for the company operator's common owner-reporting tasks and better at close-state clarity, immutable statement provenance, and navigating from a balance exception to its source activity. It may remain narrower in report count, scheduling, bulk delivery, and customization.

## 12. Verification gates

### Authority

- Staff with report-read authority can view and export but cannot mutate finance.
- Close and publication actions require their exact capabilities.
- Foreign organization, owner, property, revision, publication, and artifact probes fail.
- No new path grants access to unauthenticated users or property-owner records as users.
- Direct API calls cannot bypass disabled UI controls.

### Financial correctness

- Owner account totals reconcile to the authoritative event set.
- Opening, movement, and closing balance bridge exactly.
- Owner Activity and Owner Statement totals agree for the same closed scope.
- Unit P&L agrees with the same recognized finance events for its selected scope.
- Multi-owner and ownership-effective-date fixtures behave according to the existing close contract.
- Published PDF and Excel bytes match their immutable hashes.
- Source-label completeness tests prevent raw diagnostic leakage.

### UX and browser

- List search, attention filters, owner selection, property selection, and month navigation.
- Summary, Activity, and Statements transitions preserve scope.
- Live, unavailable, closed, official, and superseded states.
- Report run, reset, print, PDF download, and Excel download.
- No false discard warning on untouched forms.
- Responsive owner-account and report journeys.
- Keyboard, focus, accessible naming, contrast, and non-color status communication.

## 13. Pilot and rollout

1. Implement locally on synthetic company data.
2. Run focused application, database, report-rendering, and browser gates.
3. Merge only from the exact reviewed commit after all protected checks pass.
4. Apply hosted schema only through the protected production database workflow from the exact merged `main` SHA.
5. Deploy the exact build to Pilot.
6. Authenticate as company roles with read-only, finance-operator, and close/publish authority.
7. Verify totals, permissions, immutable downloads, mobile behavior, and foreign-ID denial.
8. Make a separate go/no-go decision before exposing the update to normal company users.

Rollback uses the normal deployment path. Forward-only schema is not destructively reverted. No owner invitation or owner account-access cleanup is necessary because those concepts do not exist.

## 14. Acceptance criteria

1. Only authenticated company members can enter Nestory.
2. The work creates no owner login, invitation, portal route, or owner-auth schema.
3. `/balances` provides a fast, table-first Owner accounts workspace.
4. An account detail explains its balance through Summary, Activity, and Statements.
5. Reports are fixed, understandable, and reachable from both Reports and relevant owner accounts.
6. Every figure has an owner/property/month scope and truth status.
7. Missing or unavailable data is never rendered as zero.
8. Routine read/filter/print/download actions require no confirmation.
9. Corrections, close, publish, and supersede remain permission-gated and auditable.
10. Official downloads return verified immutable bytes.
11. Raw `sources=` diagnostics and unformatted identifiers never leak into user-visible columns.
12. Cross-organization and foreign-record access fails at the server boundary.
13. All non-advanced finance browser journeys pass on desktop and mobile.
14. Pilot remains unapproved until exact-build authenticated testing passes.

## 15. Implementation lanes

After this corrected design is approved, the implementation plan should use narrow lanes:

1. **Owner accounts UX:** `/balances`, account selection, summary, activity, statement history, responsive and accessible states.
2. **Reports UX and exports:** report catalog, filters, results, status language, Owner Balance Summary, PDF/Excel behavior.
3. **Authority and financial truth:** loaders/RPCs, permissions, exact totals, immutable artifact checks, source-label completeness.
4. **Adversarial browser verification:** role matrix, foreign IDs, normal workflows, mobile, accessibility, and regression checks.

Only one lane may own a new migration. Database-heavy gates and hosted release remain serialized under the coordinator. Every lane reports its base and head SHA, changed paths, tests, risks, and confirmation that it made no hosted or production mutation.

## 16. Research references

- DoorLoop, [Introduction to the Owner Portal](https://support.doorloop.com/en/articles/8392701-introduction-to-the-owner-portal).
- DoorLoop, [How to Use the Owner Portal](https://support.doorloop.com/en/articles/8317597-how-to-use-the-owner-portal).
- DoorLoop, [Owner Statement Report](https://support.doorloop.com/en/articles/8160274-owner-statement-report).
- Nielsen Norman Group, [10 Usability Heuristics for User Interface Design](https://media.nngroup.com/media/articles/attachments/Heuristic_Summary1_A4_compressed.pdf).
