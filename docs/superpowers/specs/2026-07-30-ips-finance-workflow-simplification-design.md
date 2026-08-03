# IPS Finance Domain and Simplified UX Design

**Original date:** 2026-07-30
**Revised:** 2026-08-03
**Status:** Finance domain approved by the user; the consolidated model, staff
flows, and first-release UX wireframes are placed in Figma for review. Runtime
implementation still requires a separate reviewed plan.

**Design artifact:** [Nestory Finance — Simplified Flow & UX Wireframes
(Complete)](https://www.figma.com/design/N7HYfaJ9159eWDdBev0sxG)

## Purpose

This document replaces the earlier owner-only Finance product direction with
the approved model shown in the user's Nestory finance diagram and clarified
through the product discussion.

Nestory must show two linked but clearly separated financial perspectives:

1. the owner and property's financial position; and
2. a small IPS operating view for management-fee income, service income,
   recoverable advances, and customer balances.

One real business event may affect both perspectives, but staff must enter it
only once. Nestory is not intended to become a complete accounting or ERP
system for IPS.

This revision supersedes the previous decisions that Finance must expose only
one owner/property perspective, exactly two primary tabs, and no IPS operating
view. Historical documents remain evidence of earlier product direction and
must not be rewritten as though they already described this model.

This design does not itself authorize production writes, schema changes,
backfills, migrations, or release work. Existing RPC, RLS, exact-money,
approval, reversal, source-identity, idempotency, period-lock, Ledger, journal,
and audit guarantees remain mandatory. The Owner Close plan package remains
the authority for gated accounting and publication work.

## Product principles

- Start from the staff task, not the accounting structure.
- Keep one property linked to one owner in the first version.
- Keep every property's balances and activity separate.
- Use one linked event instead of duplicate owner and IPS entry.
- Separate what the owner earned from cash IPS physically holds.
- Show unpaid amounts separately from confirmed collections.
- Use customer language on customer documents.
- Use pages or focused centered modals instead of cramming unrelated sections
  into one screen.
- Remove permanent explanatory filler from working screens. Use short labels,
  validation, statuses, and a small optional evidence area instead.
- Preserve complex controls in the backend and audit trail without requiring
  ordinary staff to understand accounting implementation details.

## First-version scope

The first version covers:

- property and owner finance;
- lease billing rules;
- tenant and company invoices;
- rent collected through IPS or directly by the owner;
- management-fee calculation and recovery;
- owner- or tenant-responsible costs paid by IPS;
- optional service markup stored internally;
- owner invoices for management fees and IPS advances;
- owner/property running balance and IPS-held cash;
- IPS-staff owner withdrawals;
- paid, partly paid, unpaid, and overdue customer balances;
- owner reports and a small IPS operating report; and
- property-value and ROI analytics.

It excludes IPS payroll, tax, treasury, bank reconciliation, a complete IPS
general ledger, and a generic ERP workflow engine.

## Core domain model

### Parties and ownership

- A property has one owner in the first version.
- A property may have units and multiple leases over time.
- A lease has one effective-dated billing recipient: an individual tenant or a
  company. Invoice issuance snapshots the debtor and recipient selected from
  authoritative lease terms and accepted party evidence at that time; changing
  a contact later does not rewrite an issued invoice.
- A company-billed lease keeps its occupants as references, but the company is
  the invoice recipient.
- Financial activity, balances, invoices, withdrawals, and owner reporting
  never combine different properties into one account.
- An owner dashboard may consolidate read-only totals across the owner's
  properties while preserving each property's separate records.

### Linked finance event

`Linked event` is a product concept, not a proposed universal transaction
table. Each action remains owned by a typed domain source such as a rent
receipt, owner collection confirmation, management-fee assessment, expense
settlement, customer invoice, or owner withdrawal. Deterministic projections
link those typed sources into owner/property and IPS views. No implementation
may replace them with one generic writable financial-event schema.

| Event | Owner/property effect | IPS effect |
| --- | --- | --- |
| Rent received by IPS | Confirmed rent income; IPS-held owner cash increases | IPS holds cash for the property |
| Rent received by owner | Confirmed rent income; IPS-held cash unchanged | External collection recorded only |
| Management fee | Owner management-fee expense | IPS management-fee income |
| Owner cost funded from held cash | Owner cost; held cash decreases | No IPS advance |
| Owner cost advanced by IPS | Owner cost; amount owed to IPS increases | Recoverable IPS advance |
| Tenant service charge | No owner expense | Tenant receivable, cost recovery, and optional markup income |
| Owner withdrawal | Owner running balance and held cash decrease | Cash paid to the owner |

Every event stores its property, source record, responsible party, funding
source, collection route where applicable, amount, currency, business date,
and evidence references.

## Lease and billing rules

Each lease stores effective-dated financial terms:

- normal monthly rent;
- rent collection route: `Through IPS` or `Direct to owner`;
- management fee as a flat amount or percentage of normal monthly rent;
- whether the management fee is charged while the lease is active;
- whether first-month rent may be prorated;
- whether final-month rent may be prorated;
- whether the management fee remains full during a prorated month; and
- billing recipient and billing information.

Rent and management-fee changes require an effective date. Historical invoices
and fees retain the terms that applied to their billing period.

For the first and final month, staff may select prorated billing and enter the
agreed amount. Automatic daily proration is not required in the first version.
The management fee remains the full normal amount by default, with a per-lease
option to use a different rule.

For company billing, Nestory creates one invoice per lease and billing period,
addresses it to the company, and lists the occupants as references.

## Tenant and company invoices

The approved product target is one invoice per lease and billing period. That
invoice may contain:

- Rent;
- Cleaning;
- Utility;
- Repairs and Maintenance; and
- Other.

Customer documents never use `Disbursement` as a line label. They also never
show an internal markup or service-fee split.

Example:

```text
Internal record: Cleaning cost $50 + markup $20
Customer invoice: Cleaning $70
```

The internal record retains the base cost and markup separately. The customer
sees one understandable service line and total.

Basic invoice states are `Unpaid`, `Partly paid`, `Paid`, and `Voided`.
`Overdue` is derived from an unpaid balance after the due date.

Each invoice line has an immutable identity and binds to one typed obligation.
When a payment does not cover the full invoice, Nestory proposes draft
allocations to Rent first. Staff may select `Change what this payment covers`
before committing the payment. A committed allocation is never silently
retargeted; correction uses append-only reversal and a new allocation.

The current runtime's narrower invoice and allocation cardinality does not yet
authorize this target. Multi-line issuance and atomic multi-allocation payment
commit remain gated by the ratified tenant-invoice and formal-receipt plans. The
UI must not expose this flow until the backend can commit all selected line
allocations idempotently in one checked action.

## Rent collection

### Rent collected through IPS

1. IPS records the received payment against the tenant or company invoice.
2. After the invoice-bound allocation commits, Nestory creates the product
   target `IPS Payment Receipt`.
3. The allocated rent becomes confirmed owner rent income.
4. IPS-held cash increases only by the owner's rent portion.
5. The management fee becomes an owner expense and IPS income.
6. Amounts due to IPS are settled from available held cash before an owner
   withdrawal.

### Rent collected directly by the owner

1. IPS staff record an `Owner Collection Confirmation`.
2. The checked action stores a canonical source ID, idempotency key, amount,
   date, tenant/company, lease, property, invoice/obligation allocation,
   confirmer, confirmation timestamp, reconciliation source
   `owner_external_collection`, and an owner receipt or reference when
   available.
3. The allocated amount settles the tenant balance and becomes confirmed owner
   rent income.
4. The event is visibly labelled `Collected by owner`.
5. IPS-held cash does not increase.
6. IPS does not issue a tenant Payment Receipt because IPS did not receive the
   money.
7. The management fee still becomes an owner expense and IPS income.
8. If it cannot be settled from existing held cash, it creates or joins an
   Owner Invoice.

The confirmation action requires an authorized IPS staff member, prevents the
same tenant balance from being settled twice, and supports append-only reversal
that restores the derived outstanding balance while preserving the original
confirmation. Supporting proof remains optional in the basic workflow, but the
confirmation identity, authority, allocation, and audit evidence are required.

Only rent received by IPS or confirmed as received by the owner affects the
owner running balance. Rent charged but not collected remains an outstanding
tenant/customer balance.

### Receipt authority boundary

`Payment Receipt` is the approved customer-facing document target, not a claim
that formal receipt authority exists today. A formal receipt requires a unique
number, immutable committed allocation identity, issuer, issue timestamp,
reversal relationship, artifact status, and delivery history. Until the
ratified formal-receipt plan is implemented, the runtime may show checked
payment evidence but must not label it as an issued formal receipt. The same
boundary applies to receipts for direct owner payments to IPS.

## Management fee

- The fee is configured per lease as a flat amount or percentage.
- The fee rule and amount are effective-dated.
- The fee is charged for an active lease according to the lease's billing
  period rule.
- A prorated rent month still uses the full management fee by default.
- The owner/property side records one management-fee expense.
- The IPS side records one management-fee income item.
- One linked fee event creates both effects; the fee is never entered or
  deducted twice.
- If sufficient IPS-held owner cash exists, the fee is settled from that cash.
- Otherwise, the unpaid fee appears on an Owner Invoice.

These are approved product and contract defaults, not current calculation or
recognition authority. Flat/percentage basis, minor-unit rounding, tax,
waiver, reversal, recognition timing, and settlement must be ratified and
implemented through Plans 11/12 before the UI can create or deduct a fee. `Full
fee during a prorated month` is a proposed per-lease policy default until that
authority accepts it; it is not permission to calculate from compatibility
dates or records.

## Costs paid by IPS

Staff record the following critical fields:

- property and optional unit;
- category: Utility, Cleaning, Repairs and Maintenance, or Other;
- vendor, date, amount, and currency;
- responsible party: Owner or Tenant/company;
- funding source: owner cash held by IPS or IPS advance;
- optional internal markup; and
- receipt or supporting document.

Responsibility is selected manually for each transaction in the first version.
Lease- or category-based defaults may be added later.

Split funding, expense settlement, recovery, and reversal require one checked
typed expense-settlement contract. The product flow below remains Plan-06-gated
until that atomic authority can update its source, allocations, owner/IPS
effects, and reversal evidence without duplicate cash.

### Owner responsible

- The full owner-responsible amount becomes an owner expense.
- IPS uses held owner cash when sufficient.
- If held cash covers only part, Nestory records a split funding source.
- The portion paid with IPS company money becomes an `IPS advance` and an
  amount the owner owes IPS.
- Only the advanced portion is invoiced to the owner.
- Recovery of that advance later clears the amount owed; it does not create a
  second expense.

Example:

```text
Repair cost:                         $300
Owner cash held by IPS:              $100
IPS advance and owner invoice:       $200
```

### Tenant or company responsible

- The cost never becomes an owner expense.
- The tenant/company invoice uses the real service category and customer-facing
  total.
- IPS retains the original cost, optional markup, vendor evidence, and funding
  record internally.
- The base amount recovers IPS's cost and the markup is IPS service income.

For the basic cash-based IPS operating report, a service markup is recognized
only when customer cash is committed to that service line. Internal allocation
recovers the base cost first and then the markup. A partial payment that has not
reached the markup portion creates no markup income. Reversal removes the same
recognized amount through opposite evidence. This timing must be implemented
in the checked invoice-allocation authority before IPS reporting uses it.

## Owner invoices

An Owner Invoice is created when an amount due to IPS cannot be settled from
IPS-held owner cash. It may contain, for the same property:

- management fee;
- repair paid by IPS;
- cleaning paid by IPS;
- utility paid by IPS; and
- another owner-responsible IPS advance.

Items from different properties are never combined on one owner invoice.

If IPS later receives rent for the property, staff may apply that held rent to
open owner invoices before an owner withdrawal. If the owner continues to
collect rent directly, the invoice remains unpaid until the owner pays IPS.
When IPS receives direct payment from the owner, IPS records it and issues a
Payment Receipt.

Owner invoice states are `Unpaid`, `Partly paid`, `Paid`, and `Voided`, with
`Overdue` derived from the due date.

## Property account and balances

Each owner-property pair has a small configurable account with these standard
categories:

- Rent income;
- Management-fee expense;
- Owner-responsible expense;
- Withdrawal; and
- Running balance.

The first version also exposes three operational amounts:

### Owner running balance

```text
Confirmed rent income
- management fees
- owner-responsible expenses
- completed withdrawals
= owner running balance
```

This is an economic-performance projection, not cash payable to the owner and
not the amount available for withdrawal. Confirmed owner-direct rent is
included because it is property income even though IPS does not hold the cash.
An authoritative opening balance, ownership-effective source, owner funding,
reserves, and correction history remain Plans 13/14 work. Until those sources
exist, the UI must label the amount `Running balance from tracked activity` and
must not invent an opening zero or present it as close-backed.

### Cash held by IPS

This is only cash IPS physically controls for that property. It increases from
owner rent received through IPS and decreases through settled owner costs,
settled amounts due to IPS, and owner withdrawals. Owner-direct rent never
increases it.

Withdrawal eligibility is driven only by checked IPS-held cash after required
set-off of amounts due to IPS, never by the economic running balance.

### Amount owner owes IPS

This is the unpaid balance of management fees and IPS advances that have not
been settled from held cash or paid directly by the owner.

Account categories must be designed so more configuration can be added later,
but the first release must not expose a chart-of-accounts editor.

## Owner withdrawal

- Only IPS staff can record a withdrawal.
- There is no owner self-service withdrawal in the first version.
- Open amounts due to IPS are settled from held cash before withdrawal money is
  made available.
- A withdrawal cannot exceed available IPS-held cash for that property.
- A completed withdrawal reduces both owner running balance and IPS-held cash.
- Owner-direct rent is not withdrawable from IPS.
- The withdrawal appears in the property account and Owner Report.

## Property value and ROI analytics

Property onboarding has two analytics paths:

- `New`: enter the value of a newly listed property.
- `Existing`: estimate current value and optionally estimate historical revenue.

Property value and estimated historical revenue are analytics-only. They never
create an opening balance, journal, income item, or cash event.

For a selected month or year:

```text
ROI =
(confirmed rent income
 - management fees
 - owner-responsible expenses)
/ latest property value
```

Withdrawals and tenant-responsible charges are excluded from ROI.

## Reports and customer balances

### Operational Owner Report

The Owner Report is separate for each property and shows:

- opening owner running balance;
- rent charged;
- rent collected through IPS;
- rent confirmed as collected by owner;
- outstanding rent;
- management fees;
- owner-responsible expenses;
- withdrawals;
- amount owner owes IPS;
- ending owner running balance; and
- ending cash held by IPS.

Supported report views are monthly, transaction detail, yearly total, yearly by
month, and optional ROI. Only confirmed collections affect the running balance;
unpaid rent appears separately.

This is an operational preview/report until reconciliation, close, immutable
Owner Statement artifacts, and delivery are implemented through Plans 15-19.
It may be printed or exported only with `Operational report — not close-backed`
identification. The action `Issue Owner Statement` and any claim of official
publication remain unavailable until those plans are authorized.

### IPS operating report

The small IPS report shows:

- management-fee income;
- service/markup income;
- IPS advances still unpaid;
- owner invoices paid, partly paid, unpaid, or overdue;
- tenant/company invoices paid, partly paid, unpaid, or overdue; and
- yearly total and yearly-by-month views.

It does not include IPS payroll, tax, treasury, bank reconciliation, or a full
corporate balance sheet.

### Customer balances

Customer balances use separate views:

- `Owners`: management fees and owner-responsible IPS advances.
- `Tenants & companies`: rent and tenant-responsible service charges.

Staff can filter by property, customer, billing period, and payment state, then
open the underlying invoice and payment history.

## Simplified UX architecture

The existing implementation exposes competing Finance destinations, split
inspectors, side drawers, large summary-card strips, and long paragraphs that
explain internal mechanics. The new UX removes those patterns from the normal
staff flow.

Nestory keeps one application shell. The existing global sidebar and command
bar remain the primary navigation; Finance does not introduce a second left
sidebar. Finance uses the same horizontal local-navigation pattern as the rest
of the authenticated product. The first implementation slice shortens the
existing destinations and simplifies the live Rent and Expenses workspaces
before adding new Finance routes.

### Finance navigation

The eventual first-version information architecture is:

```text
Finance
|- Finance work
|- Rent
|- Expenses
|- Balances
|- Leases
`- More

Property record
`- Property account

`More` contains Financial History/Ledger and Petty Cash. Global Reports stays
in the existing Nestory sidebar and is linked contextually from Finance; it is
not duplicated as a competing Finance navigation destination. Deposits remain
owned by Leases.
```

`Reports` contains separate Owner and IPS report views. IPS operating totals do
not appear in the default owner/property Overview.

### Screen 1: Finance work

Purpose: show what staff must handle next.

- Period and Property filters.
- One primary action: `Record payment`.
- One compact totals line: Rent due, Rent collected, Owner expenses, Cash held.
- `Needs attention` table: overdue rent, owner collections awaiting
  confirmation, unpaid owner invoices, and expense items missing a responsible
  party or funding source.
- Recent activity table.
- No charts, glossary cards, or accounting explanations.

### Screen 2: Rent

- Primary action: `Record payment`.
- Secondary action: `Add charge` when a manual tenant service charge is needed.
- Filters: Period, Property, Status, and Collection route.
- Table: Due, Property/unit, Billed to, Rent, Paid, Balance, Status, Route.
- Row opens a centered invoice detail modal for a simple record.
- A durable invoice page is used when payment allocations, documents, and
  history need multiple sections or a shareable URL.

### Screen 3: Expenses

- Primary action: `Add expense`.
- Filters: Property, Category, Responsible party, and Recovery state.
- Table: Date, Property, Category, Vendor, Responsible party, Cost, Paid from,
  Recovery state.
- Row opens a centered expense detail modal.
- The normal list never exposes debit/credit, journal, or projection terms.

### Screen 4: Customer balances

- Two tabs: `Owners` and `Tenants & companies`.
- Filters: Property, Customer, Period, and Status.
- Table: Customer, Property, Invoiced, Paid, Balance, Oldest due, Status.
- Selecting a customer opens a dedicated customer account page with invoices,
  payments, receipts, and activity history.
- Owner and tenant/company balances are never mixed in one total.

### Screen 5: Property account

This is a dedicated page because it has several independent sections:

- Owner running balance.
- Cash held by IPS.
- Amount owner owes IPS.
- Available withdrawal amount.
- Activity table with Rent income, Management fee, Owner expense, and
  Withdrawal.
- Primary action: `Record withdrawal` for authorized IPS staff.
- Links to owner invoices and Owner Reports.

### Screen 6: Reports

- Tabs: `Owner reports` and `IPS report`.
- Owner report filters: Owner, Property, Period, and Report type.
- IPS report filters: Property, Period, Customer type, and Status.
- Reports open on an operational preview page. Official issue is unavailable
  until the close-backed Owner Statement path is authorized.
- ROI appears only when a property value exists.

## Focused actions

Working screens use centered modals for short actions and dedicated pages for
multi-section records. Finance does not use a persistent split inspector or a
large side drawer.

### Record payment modal

- Invoice.
- Amount.
- Payment date.
- Route: `Through IPS` or `Direct to owner`.
- Method and reference.
- Proof attachment when available.
- `Change what this payment covers` optional allocation control.
- Final action changes to `Record payment` or `Confirm owner collection` based
  on route.

The confirmation summary uses only three short lines:

- Tenant balance after payment.
- Owner rent confirmed.
- IPS cash increase or `No IPS cash received`.

### Add expense modal

Step 1, expense:

- Property/unit.
- Category.
- Vendor and date.
- Amount/currency.
- Receipt or reference.

Step 2, responsibility:

- Owner or Tenant/company.
- Paid from owner cash or IPS advance.
- Optional markup.

The modal shows only fields relevant to the selected responsibility. The save
confirmation states which customer balance or property account will change.

### Owner payment modal

- Owner invoice.
- Amount and date.
- Method and reference.
- Receipt action.

### Withdrawal modal

- Property.
- Available IPS-held cash.
- Amount and date.
- Method and reference.
- The submit button is disabled above the available amount.

## Onboarding flow

A property or active lease missing financial setup opens a dedicated four-step
setup page instead of showing explanatory blocks across every Finance screen.

1. `Property & owner`: confirm property, owner, and analytics value path.
2. `Lease billing`: rent, effective date, individual/company bill-to, and
   occupants.
3. `Collection & fee`: rent collector, flat/percentage fee, active-lease rule,
   and proration selections.
4. `Review & activate`: one concise summary and `Activate billing`.

The setup page shows step names and progress, not tutorial paragraphs. After
activation, the permanent Finance UI contains only the operational fields and
statuses needed to do the work.

## Language rules

Use:

- Rent
- Cleaning
- Utility
- Repairs and Maintenance
- Other
- Through IPS
- Collected by owner
- Awaiting confirmation
- Unpaid
- Partly paid
- Paid
- Overdue
- Owner owes IPS
- Cash held by IPS

Do not expose these internal terms on ordinary customer or task screens:

- Disbursement
- Proportion allocation
- Operator-selected allocation
- Debit / credit
- Journal projection
- Accounting authority
- Compatibility adapter

Internal evidence may use technical terms in an optional collapsed Evidence
section for authorized users.

## Current implementation transition

A later implementation plan should make the following presentation changes
without weakening current financial controls:

- replace the current five-destination Finance local navigation with the new
  task-based structure;
- remove persistent Finance split inspectors and side drawers;
- replace large summary-card strips with one compact totals line;
- remove permanent paragraphs that explain obligation, settlement, Ledger,
  journal, and Owner Statement internals;
- keep historical incompatible categories visible as read-only compatibility
  evidence instead of offering them in ordinary create forms;
- preserve existing URLs through explicit redirects or compatibility pages;
- keep Ledger/Financial History secondary and source-linked;
- introduce owner and IPS projections only through reviewed backend authority;
  and
- never implement the linked model by dual-writing unrelated generic records.

The approved 2026-08-03 first implementation slice is narrower: it changes the
current Rent and Expenses presentation to full-width tables, compact totals,
and one centered modal at a time. It keeps every existing loader, action, RPC,
URL, and stored field. It does not add direct-owner collection, customer
invoices, owner balances, management-fee calculation, or a database migration.
Those capabilities remain separate authority and migration slices.

## Safety and implementation guardrails

A future implementation must preserve:

- exact money and currency;
- organization scope and RLS;
- role and approval checks;
- immutable source identity;
- idempotent event creation;
- explicit invoice/payment allocation;
- typed, domain-owned source records rather than a universal event table;
- append-only reversal and void evidence;
- period locks;
- private supporting documents;
- activity history;
- deterministic Ledger and balanced journal projections where authorized;
- separation of obligation, settlement, approval, and cash state; and
- prevention of duplicate management-fee or expense recovery.

The UI may preview an event's effects, but preview text is not financial
authority. Missing owner, lease, billing, responsibility, funding, confirmation,
or balance evidence must block the action rather than invent a default.

## UX acceptance criteria

- A new property can complete finance setup in four clear steps.
- Every working page has one obvious primary action.
- The default Overview shows only critical totals and work needing attention.
- No working screen contains permanent accounting tutorial paragraphs.
- Simple records open in a centered modal; multi-section records use a page.
- Rent collection route is visible on every payment and receipt record.
- Direct-owner collection settles the tenant without increasing IPS-held cash.
- Tenant-responsible costs never appear as owner expenses.
- The customer invoice shows the service total without internal markup.
- Owner invoices clearly show unpaid fees and IPS-paid owner costs.
- Owner running balance, IPS-held cash, and owner amount owed are never merged.
- Owner and tenant/company customer balances remain separate.
- A withdrawal cannot exceed available held cash.
- The same linked event cannot create duplicate owner or IPS effects.
- Laptop layouts at 1440x900 and 1280px width retain readable tables, visible
  actions, modal focus return, and no horizontal page overflow. Small-screen
  fallback remains usable, but mobile-specific redesign is not a first-release
  acceptance gate.

## Non-goals

- Multiple owners for one property
- Full IPS accounting, payroll, tax, treasury, or bank reconciliation
- Automatic daily rent-proration calculation
- Owner self-service withdrawals
- A first-version chart-of-accounts editor
- Historical revenue as an opening financial balance
- A universal finance transaction schema
- A generic workflow engine
- Production database mutation, deployment, backfill, or cutover from this
  design document alone
