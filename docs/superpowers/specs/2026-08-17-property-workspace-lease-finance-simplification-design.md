# Property Workspace, Lease, and Finance Simplification Design

## Goal

Make Property and Unit records the primary operating workspaces, make each
Lease the source of its own rent schedule, and keep global Finance as a
secondary portfolio-wide review surface.

The chronological journey is:

1. Create a Property with its basic identity.
2. Choose whether the Property is rented as one space or through separate Units.
3. Create or choose a tenant from the Property or Unit record.
4. Create a minimal monthly Lease in that fixed context.
5. Activate today or schedule activation.
6. Let Nestory create rent charges automatically.
7. Work with rent, expenses, and the owner account in the same record context.

## Property And Unit Hierarchy

- Property is always the operating root.
- `single_space` means the Property is leased directly with
  `leases.unit_id = NULL`; Nestory must not create a fake Unit.
- `multi_unit` means Leases belong to Units under the Property.
- `undecided` preserves existing zero-Unit records until the operator chooses.
- Conflicting active Units or non-archived Leases block a structure change and
  the UI explains what must be resolved.

## Property Creation

- Ask for name, optional Property code, Property type, address, registered
  date, and an optional Property photo. Nestory generates a collision-safe code
  when the user leaves it blank and defaults status to Active.
- Owner, acquisition, ownership share, notes, and other setup facts belong on
  the Property record after creation. A photo remains editable there.
- Success opens the Property record and immediately asks whether the Property
  is rented as a whole or through separate Units.

## Lease Creation And Rent

- Lease creation starts only from a Property or Unit record. Context fixes the
  Property and optional Unit; dates never clear or replace that context.
- The global Lease register remains searchable but has no competing Create
  Lease action.
- The first form is ordered as Tenant, dates, monthly rent and due day, then
  optional security deposit. V1 creates monthly Leases only.
- Advanced relationship, occupancy, fee, proration, and evidence workflows may
  remain available after creation but are not first-create prerequisites.
- Effective-dated `lease_billing_terms` own each Lease's visible generation
  rules. New rent generation has no global Rent policy prerequisite.
- V1 uses the workspace timezone, clamps short-month due days, prorates actual
  calendar days, charges through Lease end, and starts mid-period rent changes
  on the next full billing month.
- Historical Rent policy and invoice references remain immutable audit evidence.
  An unresolved historical Lease stays visibly blocked pending confirmation.

## Activation

- One Activate Lease action offers `Activate today` or `Activate on date`.
- Scheduled activation is cancellable, idempotent, and exactly-once under
  retry. A failure leaves the Lease Draft with a typed repair message.
- Activation creates any currently due rent charge once; later charges remain
  automatic.

## Finance And Charges

- Property Finance contains scoped Rent and charges, Expenses, and Owner account.
- Unit Finance contains scoped Rent and charges and Expenses, plus a read-only
  parent-Property owner summary.
- Contextual actions arrive with Property, Unit, Lease, and tenant locked when
  known. They reuse canonical Finance loaders and checked mutations.
- Manual types are Manual rent, Utilities, Cleaning, Repairs and maintenance,
  and Other. Other requires a user description. Manual rent requires a Lease
  and billing month and cannot duplicate base rent for the same Lease-month.
- Global Finance is a secondary portfolio review surface. Ledger and Petty cash
  remain implemented and directly addressable under Advanced finance.

## Compatibility, Security, And Acceptance

- Migrations are additive first. Existing Property, Unit, Lease, invoice,
  payment, expense, owner-account, Ledger, Petty cash, report, and activity
  history remains readable.
- Preserve fixed-role capabilities, RLS, explicit grants, checked RPCs,
  exact-decimal money, idempotency, immutable evidence, and organization scope.
- The complete journey must pass focused application tests, pgTAP and local
  database verification, and authenticated real-browser testing including
  validation, retry, and concurrency breaks.
- Every discovered break is fixed or documented with a clear blocking reason
  before release. Historical financial counts and totals must reconcile.

