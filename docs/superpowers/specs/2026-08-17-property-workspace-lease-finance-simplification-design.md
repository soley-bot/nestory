# Property Workspace, Lease, and Finance Simplification Design

## Goal

Make Property and Unit records the primary operating workspaces, make each
Lease the source of its own rent schedule, and keep global Finance as a
secondary portfolio-wide review surface.

The first successful journey must be chronological and usable without knowing
Nestory's database model:

1. Create a property with its basic identity.
2. Choose whether the property has separately managed units.
3. Open the property or unit record.
4. Create a tenant inline or choose an existing tenant.
5. Create a minimal lease in that record context.
6. Activate the lease today or schedule activation for a date.
7. Let Nestory create rent charges automatically.
8. Work with rent, expenses, and the owner account in the same record context.

## Structural Decisions

### Property and unit hierarchy

- Property is always the top-level operating record.
- A property has an explicit rental structure:
  - `single_space`: the property is leased directly and has no visible unit.
  - `multi_unit`: leases belong to units under the property.
  - `undecided`: imported or existing properties that still need the operator's
    choice.
- A `single_space` property uses the existing nullable `leases.unit_id`. Nestory
  must not create or display a fake unit.
- A `multi_unit` property cannot create a property-level lease.
- A property cannot change rental structure after it has conflicting units or
  non-archived leases. The blocked state explains what must be resolved.

### Property creation

- The create form asks for the property's name, property type, address, photo, registered date, and other basic identity details.
- The user may enter a property code, including a pattern based on owner information such as the owner's name or owner code; Nestory generates an internal property code when none is provided and defaults status to Active.
- Owner, acquisition, ownership share, photo, notes, and other setup details
  move to the property record after creation.
- Success opens the property record. The next visible decision is whether the
  property has separate units.

### Lease creation

- Lease creation starts only from a Property or Unit record.
- The global Lease register remains a secondary portfolio register; it does not
  expose a competing Create lease action.
- Context fixes property and optional unit. The user does not reselect them.
- The first Lease form contains, in this order:
  1. Tenant, with inline tenant creation.
  2. Start date and end date.
  3. Monthly rent and rent due day.
  4. Security deposit, optional.
- V1 creates monthly leases only.
-Advanced relationship, occupancy, fee, proration, and evidence data may be
entered during first creation or remain available afterward through named
workflows; they are not required as first-create prerequisites.

### Lease-owned rent rules

-New rent generation depends only on the policy configured within each Lease; no global Rent policy is required.
- Effective-dated `lease_billing_terms` store each lease's rent-generation rule
  snapshot together with collection and recipient details.
- V1 uses one documented rule set:
  - workspace operational timezone;
  - due day from the Lease, clamped to the last calendar day in short months;
  - actual-calendar-day proration for partial first and final months;
  - rent continues through the Lease end date;
  - a mid-period rent change begins with the next full billing month;
  - concessions, rent-free periods, and waivers are unsupported in V1 and use a
    manual adjustment charge when needed.
- These defaults appear as a compact read-only Rent behavior summary before
  activation. They are not hidden even though the first form does not ask the
  user to configure them.
- Existing `rent_policy_versions` and historical invoice references remain
  intact for audit evidence. Retire Rent policy writes and ordinary navigation
  only after migration and parity tests prove the Lease-owned billing rules.

### Activation

- A draft Lease exposes one Activate lease action.
- The action asks for either:
  - `Activate today`, using the workspace's operational date; or
  - `Activate on date`, using a selected future date.
- Scheduled activation is cancellable before it runs.
- Activation is idempotent and creates any currently due rent charge exactly
  once. Future scheduled rent generation remains automatic.
- A failed scheduled activation stays Draft and shows a typed repair message.

### Finance location

- Property and Unit records each keep one Finance tab.
- Property Finance contains:
  - Rent & charges scoped to the property;
  - Expenses scoped to the property;
  - Owner account for the property.
- Unit Finance contains:
  - Rent & charges scoped to the unit;
  - Expenses scoped to the unit;
  - a read-only owner-account summary linking to the parent Property Finance
    owner-account view.
- Common actions are available in context and arrive prefilled with property,
  unit, Lease, and tenant where known.
- Global Finance remains available for portfolio search, review queues, bulk
  follow-up, and reports. It is not the first place to operate one property.
- Ledger and Petty cash remain implemented and directly addressable but move
  out of primary navigation into an Advanced finance area. No data is deleted.

### Charges

- Lease activation and the scheduled runner create normal monthly rent charges.
- The user may also create a manual tenant charge in Property or Unit Finance.
-V1 manual charge types are Manual rent, Utilities, Cleaning, Repairs &
  maintenance, and Other. When Other is selected, the user can enter a
  description.
- A Manual rent charge must name a Lease and billing month. It cannot create
  a second base-rent charge for a Lease-month that already has one.
- Other charges require tenant, issue date, due date, amount, and description.
- Manual charges use the existing invoice, invoice-line, income-item, payment,
  allocation, receipt, owner-effect, Ledger-projection, and reversal contracts.
  They do not introduce a second settlement system.

## Migration and Compatibility

- All migrations are additive first.
- Existing Property, Unit, Lease, invoice, payment, expense, owner-account,
  Ledger, Petty cash, report, and activity history remain readable.
- Backfill `multi_unit` only where a property already has a unit. Leave a
  zero-unit property `undecided`; do not assume it is `single_space`.
- Backfill each active historical `lease_billing_terms` row with the effective
  approved Rent policy rules that previously governed it.
- If an existing billing term has no resolvable approved policy, mark its
  lease-owned rule source `pending_confirmation` and keep automatic generation
  disabled until the operator confirms the visible V1 Rent behavior on that
  Lease. Do not silently start charging a historically blocked Lease.
- Existing generated invoices keep `rent_policy_version_id`. New generated
  invoices reference the exact immutable billing term, snapshot
  `rent_rule_contract_version`, and may leave `rent_policy_version_id` null.
- Do not drop Rent policy tables, functions, routes, or columns in the first
  release. Retire writes and remove ordinary navigation only after parity tests
  prove the new generator.

## Authorization

- Preserve the current fixed-role capability boundary.
- Super Admin and Finance Manager may configure Lease/rent behavior according
  to the existing Lease configuration capability.
- Finance Member may read scoped Finance and submit permitted paid expenses but
  cannot activate Leases or create manual customer charges unless explicitly
  granted by the checked database contract.
- UI visibility never replaces checked RPC authorization, grants, or RLS.

## Acceptance Criteria

- The complete user flow must work correctly from property creation through lease activation and rent-charge generation.
- The flow must be tested using an actual browser, including the primary user journeys and relevant error, validation, retry, and concurrency scenarios.
- Browser testing must identify where the flow breaks, and each discovered issue must be fixed or documented with a clear blocking reason before release.

- A new user can create a property, choose its rental structure, create a Lease,
  activate it, and find the resulting rent charge without leaving the record
  hierarchy.
- A house can be leased without a Unit record.
- An apartment building can create Units and lease each Unit independently.
- The Lease create form never clears Property or Unit because dates changed.
- No new Lease is blocked by a global Rent policy prerequisite.
- Scheduled activation runs on the selected workspace date and remains
  exactly-once under retry/concurrency.
- Property and Unit Finance expose scoped rent, expenses, and owner context.
- Global Finance remains functional as a secondary portfolio surface.
- Ledger and Petty cash data remain accessible but are absent from primary
  navigation.
- Historical invoices and reports reconcile before and after the migration.

## Superseded Direction

`docs/superpowers/specs/2026-08-15-lease-user-flow-design.md` remains useful for
human-facing Lease vocabulary, but its no-database-change and global Rent policy
assumptions are superseded by this design.
