# IPS Finance Workflow Simplification Design

**Date:** 2026-07-30
**Status:** Product direction approved; detailed design pending user review

## Authority and supersession

This design translates the
[IPS Meeting Summary](https://docs.google.com/document/d/1y8Gi_mxuf4L46fKxq_3FdriUpQObFz6043TujW20LJQ)
into the smallest coherent Nestory Finance experience.

For Finance operator language, form placement, table design, and first-release
scope, this document supersedes:

- the operator-UI portions of
  `docs/superpowers/plans/2026-07-06-finance-workspace-v1.md`;
- the Finance inspector/drawer assumptions in the platform UI redesign spec
  and plan;
- the product-roadmap and operator-UI portions of the accounting-kernel spec
  and plan; and
- the owner-facing presentation in the 2026-07-14 Owner Statement spec and
  plan.

It does not supersede implemented RPC, RLS, exact-money, settlement,
reversal, source-identity, period-lock, or audit guarantees. The Owner Close
package remains the authority for financial safety and future close
implementation. Historical plans remain evidence and must not be rewritten as
if they originally described this design.

## Goal

Make Finance answer the questions IPS staff actually have:

1. What should the tenant pay, and what remains unpaid?
2. What cost belongs to the owner or property, and what remains unpaid?
3. What money is IPS holding for the owner?
4. What has IPS paid to the owner?
5. What should appear on the Owner Statement?
6. What management fee did IPS earn from those same property records?

Nestory is not becoming a general accounting product. The first release is
optimized for accurate owner reporting and day-to-day property finance.
Questions 3 and 4 describe the target Owner Balance workflow. In this slice,
Nestory shows only exact existing owner-funding, owner-payment, and held-fund
evidence, labels missing authority, and does not claim that a running available
balance or owner-distribution write is safe.

## Product model

The operator sees five business-event families:

| Business event | Meaning | Owner Statement treatment | Primary workflow |
|---|---|---|---|
| Tenant income | Money charged to or collected from a tenant | Expected/unpaid is disclosure; allocated cash received enters the current cash-basis preview | Tenant Income |
| Property expense | Cost carried by the owner/property | For non-fee costs, recorded/unpaid is disclosure and allocated cash paid enters the Preview; management fee follows the single-record recognition rule below | Property Expenses |
| Deposit | Money held in custody | Excluded from operating totals and owner balance; available only as a separate custody disclosure | Leases & Deposits |
| Owner contribution | Money supplied by the owner | Read-only until Plan 13 authorizes owner-funding writes; only a qualified canonical cash event enters the Preview | Owner Statement preview |
| Owner payment | Money released from IPS-held owner funds | Read-only until Plan 14 authorizes distributions; only a qualified canonical cash event enters the Preview and it is never a property expense | Owner Statement preview |

In this design, qualified existing Owner funding/payment evidence means a
committed, reversal-aware receipt/payment allocation emitted once by
`property_cash_events_v1`, with exact organization, property, owner, currency,
and event-date attribution and no unresolved flag. The original and its
reversal net through their distinct canonical event identities. An
`owner_contribution` or `owner_payout` obligation without that allocation
evidence is disclosure-only and triggers the matching coverage blocker.
Missing or ambiguous owner attribution also blocks the Preview; current
ownership is never substituted for event-time evidence.

Management fee is one business event with two views:

- the owner sees a management fee charged by IPS as a property deduction; and
- IPS sees the same event in its internal Management Fee report.

The operator records or confirms that event once. Nestory must not ask the user
to create an owner expense and a second IPS income record.

## First-release boundaries

### Included

- simplify the existing `/rent-income`, `/bills-expenses`, `/ledger`, and
  `/petty-cash` workspaces, the deposit controls in `/leases`, and the two
  IPS finance reports described below;
- rename their user-facing concepts without changing route compatibility;
- remove side-inspector and side-drawer interaction from those Finance routes;
- replace stat-card grids with one compact totals line;
- make row details and mutations focused modal flows;
- keep a dedicated page only when the record is too large for one focused
  modal;
- remove unsupported event families from generic create dropdowns;
- preserve historical and compatibility records in filters and read views;
- place management fee in the Property Expenses experience while preserving
  its existing compatibility source until the later fee authority replaces it;
- remove owner-payment creation from generic Finance forms; preserve exact
  existing owner-payment records as a read-only, separately labeled section in
  owner-facing context until Plan 14 authorizes distributions;
- remove owner-contribution creation from Tenant Income; preserve exact
  existing contributions as read-only owner-funding evidence until Plan 13; and
- update current rules and prior plans so future work does not reintroduce the
  mixed model.

### Deferred behind existing Owner Close gates

- automatic fee agreement calculation and assessment;
- new deposit disposition policy beyond the existing checked lease-deposit
  event workflow;
- authoritative running Owner Balance and reserve rules;
- immutable close-backed Owner Statement publication;
- automatic invoice delivery;
- reconciliation and close; and
- historical backfill or hosted cutover.

The UI must not display controls that imply these deferred workflows are
complete.

## Information architecture

Routes stay stable. User-facing names become:

| Route | Label | Single job |
|---|---|---|
| `/rent-income` | Tenant Income | Review tenant charges, balances, receipts, and reversals |
| `/bills-expenses` | Property Expenses | Review owner/property costs, payments, and management-fee deductions |
| `/petty-cash` | Petty Cash | Maintain one accountable cash register |
| `/ledger` | Financial History | Read the property cash history and add rare manual adjustments |
| `/leases` | Leases & Deposits | Maintain tenant terms and held-fund events outside operating income |
| `/reports/owner-statement` | Owner Statement | Review the property-scoped owner preview, unit activity, qualified owner-funding/payment evidence, and blockers |
| `/reports/management-fees` | IPS Management Fees | Review recorded fee income sourced from the same management-fee records |

Owner Balance remains a named target workflow in the plan corpus. It does not
receive placeholder navigation until its write authority exists.

## Interaction architecture

Every Finance list uses this structure:

```text
Title + one primary action
Local Finance navigation
Search + the few filters needed for this table
Route-specific compact totals line
Route-specific operational table
Pagination / result count
```

Rules:

- Show at most Search, Property, Status, and Date/Period before `More filters`;
  omit any filter that does not materially narrow that table.
- No persistent or responsive side inspector.
- Do not call a centered quick view an inspector in Finance code or copy.
- Selecting a row opens a centered record modal and preserves the table's URL
  filters and scroll context.
- Create, receipt, payment, reversal, void, attachment, and period actions use
  focused centered modals.
- Close the current modal before opening another action; do not stack modals.
- Use a dedicated page only for a record that needs multiple independent
  sections or a durable shareable URL.
- Keep direct record links for keyboard and assistive-technology users.
- Filters and selected record IDs remain URL-backed.
- Do not add dashboard introductions, stat cards, decorative cards, or charts
  above operational tables.
- On Property Expenses, one `Record` action opens a short menu for
  `Property expense` or `Management fee`; each choice then opens its own
  focused modal. Do not combine them in one conditional form.

## Visual direction

This is a quiet property cashbook, not an accounting dashboard.

### Tokens

- Canvas: existing `#f3f5f4`
- Work surface: existing `#fafbf9`
- Raised modal: existing `#ffffff`
- Text: existing `#17211f`
- Border: existing `#d7ddda`
- Action/focus: existing `#135e4b`

Inter remains the interface face. Money and compact reference values use the
existing tabular/monospace utility treatment. No new font or decorative color
system is introduced.

### Signature

The recognizable Finance element is a single ledger-like totals line directly
above the table. It carries three or four values separated by rules, not
individual cards. Each route uses the same rhythm with route-specific labels.

Never sum different currencies into one displayed total. When the selected
scope contains more than one currency, require a currency filter or render one
compact totals line per currency.

## Tables

### Tenant Income

Desktop columns:

1. Due
2. Property / unit
3. Tenant
4. Charge
5. Expected
6. Received
7. Balance
8. Status

`Expected`, `Received`, and `Balance` are right-aligned and use tabular
numerals. The status describes the supported workflow stage: Open, Partial,
Received, or Void. Reversed labels belong to the receipt-history event that
was reversed. The charge row returns to its derived balance state. It does not
use `Posted` as the main user language.

The totals line is Expected, Received, and Outstanding for the selected
currency.

### Property Expenses

Desktop columns:

1. Invoice / due
2. Property / unit
3. Payee
4. Expense
5. Amount
6. Paid
7. Balance
8. Status

Management fee rows appear here as `Management fee charged by IPS`, using the
same source identity as the internal report. They are a separately labeled
subset of property expense and are counted once. Until fee-settlement
authority exists, their Paid and Balance cells show an em dash and their state
is Recorded or Void.

Ordinary expense status is Draft, Ready to pay, Partially paid, Paid, or Void.
The existing technical `posted` state appears only as secondary evidence such
as `In financial history`, not as the main business status. The totals line is
Recorded, Paid, and Outstanding for ordinary bills plus separately labeled
Recorded management fees. Owner-payment records do not appear in this table or
its totals.

### Financial History

Desktop columns:

1. Date
2. Property / unit
3. Description
4. Source
5. Money in
6. Money out
7. State

The table uses the owner/property cash perspective. Source-derived rows are
read-only and link back to their owning workflow. The create action is `Add
manual adjustment`, not `Add ledger entry`.

Its totals line is Money in, Money out, and Net movement for the selected
currency. A running balance is intentionally absent: a filtered,
multi-property cash history is not the authoritative Owner Balance. Petty Cash
keeps a running balance because it represents one physical register.
State uses Active, Reversed, or Archived according to the source evidence.

### Petty Cash

Desktop columns:

1. Date
2. Property / unit
3. Detail
4. Paid to / received from
5. Cash in
6. Cash out
7. Running balance
8. Status

The totals line shows Opening, Cash in, Cash out, and Closing. Receipt and
exception counts belong in filters or table states, not eight metric cards.
Row status is Draft, Cleared, In financial history, or Void; `posted` is not
shown as unexplained accounting jargon.

At narrow widths, related identity values share a two-line cell and the table
may scroll horizontally. Amount and action columns remain readable; the
primary action never disappears.

### Owner Statement

This route is a report, not a dashboard. The first-release statement identity
remains Owner + Property + Month, matching current report and Owner Close
authority. Activity groups every Unit in the selected property into one
owner/property balance statement. Property-level rows appear in an explicit
`Property level` group and are included in the same totals.

IPS asked to count all of an owner's units in one balance statement, but it is
not yet explicit whether that crosses property boundaries. An owner-wide
cross-property statement remains deferred until IPS confirms that scope and
Plans 13-19 are amended for ownership, currency, balance, close, and statement
identity.

The body shows:

1. opening owner balance;
2. tenant cash received and paid non-fee property expenses grouped by Unit;
3. management-fee rows as a separately labeled subset of property expenses,
   included exactly once from the same source identity;
4. unit subtotals;
5. qualified canonical owner-contribution and owner-payment cash events in
   separate read-only sections, with unallocated source rows disclosed but
   excluded; and
6. one consolidated owner/property closing balance when the required opening,
   owner-funding, and owner-payment evidence is authoritative.

Use one compact summary strip and the grouped statement table. Do not repeat
the same numbers in cards. Until immutable close-backed publication exists,
label the current report `Preview` and explain its evidence blockers without
implying that it is an official closed statement. Do not display an invented
zero opening or closing balance when owner-balance evidence is missing.

### IPS Management Fees

This internal report uses:

1. Fee date
2. Property / unit
3. Fee amount
4. Reference
5. State

Controls are Month and optional Property. The only summary is Total recorded
fees per currency, and there is no create action on the report.

It reads the same management-fee event shown in Property Expenses. It is not a
second entry workflow and it does not calculate management-company profit,
payroll, overhead, or tax. The first release is explicitly a **recorded fee**
report, not proof of cash collected. Collected/outstanding columns remain
absent until a checked fee-settlement authority can support them.

## Forms

### Record tenant charge

The common path contains only:

- Tenant charge type
- Property
- Unit
- Tenant, automatically selected from the unit/lease when authoritative
- Due date
- Amount
- Reference
- Note

Supported tenant-charge labels from IPS are Rent, Parking charged to tenant,
Utility charged to tenant, Late fee, Cleaning charged to tenant, General
maintenance charged to tenant, General repairs charged to tenant, Laundry
service, Access card fee, Pet fee, and Other tenant charge. The repeated
`charged to tenant` wording is intentional where the same service can also be
an owner/property expense.

Security deposit, owner contribution, management fee, leasing commission,
service fee, and maintenance markup are not offered in this dropdown.
Historical rows remain readable.

Because `finance_income_items` has no separate category field, newly supported
tenant charge categories require the exact additive stored values `cleaning`,
`general_maintenance`, `general_repairs`, `laundry_service`,
`access_card_fee`, and `pet_fee`, plus the matching action/type enums. Existing
`utility_reimbursement` is presented as Utility charged to tenant. Approval of
this design allows a later implementation plan to propose only that narrow
constraint/enum adapter; it does not authorize a generic financial schema
rewrite.

### Record receipt

Receipt is a separate action against one tenant charge. It shows:

- tenant, unit, charge, outstanding balance, and currency as read-only context;
- cash account;
- amount received;
- received date; and
- reference.

Partial receipts and reversal preserve the implemented Plan 05 contract.
`Reverse receipt` shows the original tenant, amount, receipt date, and cash
account as context, then asks only for reversing cash account, reversal date,
and reason. The original event remains immutable.

### Record property expense

The common path contains only:

- Expense category
- Property
- Unit, when applicable
- Payee
- Invoice date
- Due date
- Amount
- Reference
- Note

IPS categories are presented as user-facing reporting categories. They use the
existing broad `expense_type` only where that value controls established
behavior; the existing `category` field preserves the precise IPS label.

The first-release category list from IPS is Maintenance, Cleaning,
Electricity, Water, Cable and Internet, Gas, Commission, Association fees,
Bank fees, Car parking, Air-conditioner cleaning, Unit refresh, Furnishing,
General supplies, Insurance, Laundry services, Legal and professional fees,
Renovation, Taxes, Labor, and Other expense. `Management fee charged by IPS`
is a separate action. `Property management services fee` normalizes to that
same action; it is not a duplicate category. Owner payment is absent.

The common form does not expose `Company handling`, owner billing state,
reimbursable amount, reimbursed amount, or company loss as independent fields.
Those fields describe later recovery state and currently permit combinations
that the RPC normalizes away.

A draft record keeps the existing `Approve expense` transition as a short
confirmation modal. It shows payee, property/unit, amount, and due date and
adds no extra fields. Approval remains distinct from payment.

### Record management fee

Management fee is a separate Property Expenses action, not a Tenant Income
type. The compatibility form captures Property, optional Unit, Fee date,
Amount, Reference, and Note. Fee date maps to the existing source `due_date`
and determines the report month. It writes one existing management-fee source
and renders that source in:

- Property Expenses as an owner deduction; and
- the internal IPS Management Fee report as IPS fee income.

The compatibility UI must state that automatic flat-rate or percentage
calculation is not active. Later fee-agreement authority may replace the
adapter without changing this user model.

The manually confirmed fee is Gate E's narrow recognition exception: it is
included once as an owner deduction on Fee date and as recorded IPS fee income,
even though it is not proof of cash collection. This exception does not create
collected/outstanding settlement state or authorize automatic assessment.

### Record expense payment

Payment shows the bill context and accepts payment date, amount, and reference.
The amount defaults to the remaining balance but remains editable for partial
payment when the existing RPC supports it. If implementation proves only
full-balance payment is safe, the action is explicitly named `Pay remaining
balance`.

Until Owner Close Plan 06 makes expense settlement and projection atomic, the
UI must not pretend the current payment and Ledger-posting actions are one
transaction. When a paid compatibility record lacks a projection, its record
modal shows `Not yet in financial history` as an honest blocker. Do not offer a
manual Ledger shortcut that can duplicate cash, and do not surface technical
journal or posting controls in the table. Plan 06 owns the atomic fix.

### Owner payment target

Owner payment is not an expense category. Existing exact `owner_payout`
compatibility records remain readable in the Owner Statement preview, outside
Property Expenses and its totals. This slice adds no create, approve, pay, or
post action because the current checked posting path rejects owner payouts and
Plan 14 still owns available-balance, reserve, approval, and distribution
authority. The later owner-payment form must not be designed or exposed until
that authority is approved.

### Owner contribution target

Owner contribution is not tenant income. Existing exact
`owner_contribution` compatibility records remain readable once in the Owner
Statement preview as Owner funding, outside Tenant Income and Property
Expenses. This slice adds no owner-contribution create or settlement action;
Plan 13 owns owner identity, opening-balance, and contribution authority.

### Deposits

Deposit events stay with the lease and use the existing checked
`lease_deposit_events` workflow. They never return to Tenant Income. The
operator records or reverses the event in a focused modal instead of an inline
form inside the lease quick view.

The target lease-deposit labels are Security deposit, Utility deposit, and Pet
deposit. All are tracking-only and excluded from Owner Statement operating
lines, totals, and owner balance. When close evidence requires it, they appear
only in a clearly separated custody disclosure outside the statement
calculation.

For an existing deposit parent, `Record deposit event` asks for Event type,
Event date, Amount, and Reference. The current supported event types remain
Receipt, Application, Retention, and Refund. `Reverse event` shows the original
type/date/amount/reference and asks for the reversal date supported by the
checked RPC. Creating new Utility or Pet deposit parents, or adding new
application/retention/refund policy, remains Plan 10 work.

### Manual financial adjustment

The Ledger form is an exceptional append-only adjustment tool. It uses
`Property cash effect` with `Money in` and `Money out`, identifies that it
creates a manual row and linked accounting projection, and cannot mutate a
source-derived row.

The fields are Property, optional Unit, Property cash effect, Transaction
date, Category, Amount, and optional Description. The confirmation shows the
resulting cash effect before submit. Once created, every journal-linked manual
row is read-only: the current Ledger edit/archive paths do not atomically
correct its accounting journal. Existing unlinked legacy manual rows are also
read-only in this slice. A later checked correction authority must create an
atomic reversal and replacement adjustment before edit, archive, restore, or
in-place correction controls may exist.

`Attach supporting file` is a separate focused modal for a manual row. It is
operational evidence, not a formal tenant receipt. Existing file type, size,
storage, and rollback rules stay unchanged.

The existing Ledger period lock remains under `More actions`, not beside the
primary create action. Its centered modal shows Month, Lock/Unlock, Reason, and
the exact effect on historical changes. A period lock is not a property close
or an Owner Statement approval.

### Petty Cash

`Create petty cash account` asks only for Account name, Account number,
Opening float, and optional Custodian. It appears only when no usable account
exists.

The form asks:

1. `Cash movement`: Cash paid out, IPS advance into register, or Cash
   returned/top-up.
2. For cash paid out only, `How should this be treated?`: Owner/property cost,
   IPS advance to recover from owner, or IPS company cost.

The core fields are Transaction date, Status (Draft by default or Cleared),
Property and optional Unit when the movement belongs to a property, Category,
Amount, Paid to/Received from, Description, and optional receipt/invoice
reference. Clear date appears only for Cleared. Follow-up treatment fields
appear only when the selected answer needs them. Manual owner-recovery fields
are labeled as manual and do not imply that a bill, invoice, or receipt was
created.

Draft and Cleared descriptive rows may be edited. Posted and Void rows remain
read-only and use their dedicated lifecycle actions.

If a cleared property expense still needs the existing separate Ledger
projection, its record modal shows `Add to financial history` as the next
compatibility action. `Void cash row` asks only for the reason after showing
the original amount and balance effect. `Open next month` shows the carried
balance and optional top-up; it does not claim physical-count reconciliation
unless a counted amount is actually captured and verified.

### Edit, void, reverse, and archive

Lifecycle actions never reopen the create form with hidden semantics:

- manual adjustments are creation-only in this slice; their record modal
  explains that financial correction requires the later atomic
  reversal-and-adjustment authority;
- other safely editable descriptive fields open in an `Edit details` modal;
- void, reverse, archive, and restore each use a short confirmation modal that
  names the record, amount, effective date, downstream effect, and recovery
  path;
- source-derived Financial History rows offer navigation only; and
- reconciliation, period-close, fee-calculation, and reserve controls stay
  absent until their owning plans are authorized.

## Owner-facing and IPS-facing language

- Owner Statement: `Management fee charged by IPS`.
- Internal IPS report: `Recorded management fee income`; do not say
  `collected` until checked settlement evidence exists.
- Property view: `Owner/property cost`.
- Ledger: `Money in` and `Money out` from the property perspective.
- Petty Cash: physical cash movement first, economic responsibility second.

Do not add a generic Perspective dropdown. Perspective is fixed by the
workflow and report.

## Owner Statement target

The safe first-release target is grouped by Unit and consolidated into one
owner/property balance:

```text
Opening owner balance
+ Tenant income
- Property expenses, including management fees
= Net income generated
+ Owner contributions
- Owner payments
= Closing owner balance / balance carried forward
```

Security, utility, and pet deposits are excluded. The current live
compatibility report does not become authoritative merely because its labels
change; immutable close-backed publication remains later Owner Close work.

The current Preview uses a deliberately narrow mixed recognition rule:
allocated tenant cash received and allocated non-fee property expenses paid,
plus each manually confirmed management-fee source once on its Fee date.
Expected tenant charges, unpaid non-fee expenses, and outstanding balances are
disclosure only. A later fee settlement cannot create a second owner
deduction. This is the one narrow calculation change authorized for the
compatibility implementation after this design and its TDD plan are approved;
it is not general accrual-accounting authority. Qualified existing Owner
funding/payment cash events enter the Preview once. Unallocated compatibility
obligations remain disclosure-only. If evidenced opening balance,
owner-funding coverage, owner-payment coverage, or exact single-owner
attribution is missing, the Preview shows a blocker instead of inventing a
closing balance.

Deposit custody does not appear in the statement calculation, operating lines,
or owner balance. If required for close evidence, it is a separate custody
appendix outside the Owner Statement totals.

## Failure and legacy handling

- Unsupported legacy categories remain visible but cannot enter a dead-end
  generic settlement flow.
- A missing or unavailable selected row closes the modal and shows a clear
  table-level message.
- Field errors appear beside the relevant control and focus the first invalid
  control.
- Cash or destructive actions show the exact record, amount, date, and effect
  before submission.
- Errors name what failed and what the operator can do next.
- Source-derived and journal-linked manual Ledger rows reject
  edit/archive/restore in both UI and server action.
- Current URLs, historical rows, and exact IDs remain compatible.

## Verification

Implementation requires:

- tests proving only tenant-charge types appear in Tenant Income create;
- tests proving management fees render in Property Expenses and not as tenant
  income;
- tests proving deposits and owner payments are excluded from generic
  income/expense creation;
- tests proving existing owner-payment rows are read-only and absent from
  Property Expenses;
- tests proving existing owner contributions are read-only Owner funding and
  absent from Tenant Income;
- constraint/action/type tests for only the six additive tenant-charge values
  named in this design;
- tests proving the exact IPS expense categories map to existing broad
  behavior without exposing management fee or owner payment in the generic
  dropdown;
- table-header and totals-line tests for all four primary Finance routes;
- mixed-currency tests proving totals are separated rather than added;
- tests proving the Property Expenses fee row and IPS Management Fees report
  share one source identity rather than duplicating the event;
- tests proving the recorded-fee report does not invent collected or
  outstanding settlement state;
- tests proving one manually confirmed management fee reduces the owner
  Preview once on Fee date and a later settlement does not deduct it again;
- tests proving only qualified, reversal-aware canonical Owner funding/payment
  allocations enter the Preview, while obligation-only or ambiguously
  attributed rows remain disclosure-only and raise blockers;
- tests for the Owner Statement preview label, grouped-unit presentation, and
  owner/property/month allocation-plus-recorded-fee consolidated
  formula/blockers without upgrading it to close authority;
- focused lease-deposit modal and operating-total exclusion tests;
- modal focus, Escape, backdrop, and focus-return tests;
- URL selection and filter-retention tests;
- Plan 05 receipt, partial receipt, and reversal regression tests;
- source-derived and journal-linked manual Ledger mutation guards, plus one
  matched Ledger/journal projection for manual-adjustment creation;
- money-total parity for unchanged event families, plus an explicit
  expected-delta reconciliation for Gate E's approved Fee-date
  management-fee recognition change;
- desktop, compact desktop, and phone browser checks;
- accessibility and horizontal-overflow checks; and
- the standard lint, TypeScript, application-test, build, and applicable
  database gates.

## Non-goals

- Corporate payroll, overhead, company P&L, tax, general-ledger, or ERP UI
- A universal accounting-event form
- A configurable workflow engine
- A card-based Finance dashboard
- A broad Reports, Overview, Maintenance, or Documents redesign
- Hosted database mutation, deployment, backfill, or cutover without separate
  authorization
