# Lease User Flow Design

> **Superseded in part on 2026-08-17.** The user-facing vocabulary and
> task-specific lifecycle actions remain accepted. The no-database-change,
> globally selectable create flow, and mandatory global Rent policy assumptions
> are replaced by the Property Workspace, Lease, and Finance Simplification
> design: Property or Unit owns creation context, whole-property leases use a
> null Unit, and each Lease owns its rent-generation rules.

## Goal

Make the Lease frontend describe and support the work a property operator performs, while leaving the existing Supabase schema, checked RPCs, lifecycle rules, and historical authority unchanged.

## Product Direction

The Lease area is task-first. Operators choose a tenant and unit, create a draft, activate it when ready, and then use named actions for renewal, rent changes, notice, move-out, termination, deposit activity, and files. Database lifecycle and evidence vocabulary remain implementation details.

The existing single-drawer creation flow remains. A wizard is not introduced.

## Register And Quick View

- Keep the compact Lease register and quick view.
- Preserve current lifecycle status because it helps users scan the portfolio.
- Present the secondary status text as the next required task rather than as a raw related-record state.
- Keep the quick view focused on tenant, unit, term, rent, deposit balance, and one next action.

## Lease Record Actions

- A draft lease exposes `Edit draft` and `Activate lease`.
- An active or notice-given lease is changed through explicit workflow actions, not a generic editor.
- Active actions are `Renew lease`, `Change rent`, `Record notice`, `Complete move-out`, and `Terminate lease` when allowed by the existing lifecycle state.
- Archiving remains available as a secondary record-management action.
- No frontend control directly selects lease status or term status.

## Creation And Draft Editing

- Creation stays in one drawer with three user concepts: `Tenant and unit`, `Lease period`, and `Rent and deposit`.
- The primary action is `Create draft lease`.
- Draft editing may change tenant, dates, property, unit, rent, due day, payment frequency, and deposit only where the existing checked action permits it.
- Active-term edits use the existing renewal and rent-change actions so history is preserved.

## Rent And Deposit

- Rename `Rent terms` to `Rent schedule`.
- Translate term status for display: `Current`, `Starts later`, `Ended`, or `Cancelled`.
- Rename `Deposit events` to `Deposit activity`.
- The entry form begins with a user action: `Deposit received`, `Deposit used`, `Deposit retained`, or `Deposit refunded`.
- Event rows read as sentences with a formatted date and amount. Raw enum values and fixture-style references are not the primary visible content.
- `Reference` becomes `Receipt or note`; `Record event` becomes `Save deposit activity`; `Reverse` becomes `Undo entry`.

## Move-In And Move-Out

- Rename the `Occupancy` section to `Move-in & move-out`.
- Show `Planned dates`, `Confirmed dates`, and `Confirmation` instead of `Scheduled`, `Confirmed`, and `Evidence`.
- Replace `Occupancy evidence` with `Move-in confirmation`.
- The action is `Confirm move-in`; its explanation asks how the move-in was confirmed.
- Existing evidence state, confidence, lineage, and RPCs remain unchanged.

## Accessibility And Responsive Behavior

- Removed controls must not remain as disabled required inputs.
- Every remaining workflow action keeps a text label and keyboard focus style.
- Status is communicated by text, not color alone.
- Forms retain visible labels, responsive single-column layout, and a reachable sticky footer at narrow widths.

## Data And Security Boundary

- No migration or generated database type changes.
- No direct table writes.
- Existing server actions and checked RPCs remain the only mutation path.
- No production record is created or changed during verification.

## Verification

- Add failing component tests for task-specific actions and user-facing vocabulary before production edits.
- Run focused Lease component tests, TypeScript, ESLint, and a production build.
- Verify the creation drawer, draft record, active record, rent/deposit section, and move-in/move-out section in a local authenticated fixture.
- After authentication is available, verify the same read-only journey against the production tenant host.
