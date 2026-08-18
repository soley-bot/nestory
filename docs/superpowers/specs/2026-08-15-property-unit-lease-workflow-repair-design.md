# Property, Unit, And Lease Workflow Repair Design

## Goal

Make Property, Unit, and Lease work as one understandable operator journey from setup to occupancy. A user must be able to enter data, recover from a validation error without retyping valid fields, understand what is blocking the next step, and move to the correct downstream record without learning the database model.

## Evidence And Scope

The approved field-input audit reproduced the failures against the authenticated local fixture. The database remained coherent, but the frontend discarded valid input after application validation, retained errors after fields were corrected, hid relationship prerequisites, and sometimes recommended a Lease action that contradicted the Unit's operational state.

This repair covers the shared form boundary and the Property -> Unit -> Lease operating chain. It preserves the current task-first Lease design, checked server actions, Supabase RPCs, RLS, and historical records. It does not introduce a wizard, workflow engine, migration, generated database type change, or direct browser write.

## Shared Form Contract

`RecordForm` owns submission behavior for record drawers. It submits a snapshot of the current `FormData` inside a React transition instead of binding the action dispatcher directly as the native function-valued form action. An application-level error response must therefore leave every successful field value visible and editable. A successful response may only clear or close a form when that feature explicitly chooses to do so.

Server field errors are response-scoped. When the user changes a field after the latest response, the old error and `aria-invalid` state for that field disappear immediately; errors for untouched fields remain. A later submission may return and display a fresh error for the same field. Custom controls, including the person selector, emit the same bubbling input signal as native controls so dirty tracking and error clearing are consistent.

The form must retain native constraint validation, pending state, one submission per submit event, keyboard submission, dirty-state warnings, and accessible feedback focus.

## PostgreSQL Identifier Contract

All database identifiers accepted by Property, Unit, and Lease actions use one shared PostgreSQL UUID-shaped schema. The contract accepts deterministic fixture identifiers such as `10000000-0000-0000-0000-000000000001` as well as versioned UUIDs. Lease creation, lifecycle, occupancy, deposit, reversal, and rent-policy actions use this same boundary.

This is validation alignment only. Database columns, RPC signatures, organization scoping, and authorization checks do not change.

## Property Operating Record

The Property record shows one primary next action from the already-derived `property.nextAction`, close to the overview. Only actionable warning or danger health indicators accompany it; raw health arrays and duplicate downstream forms do not.

Financial labels state their time range. A period-specific operating result uses the existing financial summary and its period label. If the cumulative ledger value remains visible, it is explicitly labeled `Ledger net (all time)` rather than `Net income`.

Property creation retains the current successful handoff to `Open property record` and `Add units`.

## Unit Readiness

A Unit exposes two separate facts:

- operational readiness: available, maintenance, or inactive;
- lease state: no lease, draft lease, or occupied.

The UI never collapses those facts into a misleading vacancy label. Maintenance and inactive repairs outrank Lease creation. A draft Lease produces `Continue draft` linking to that exact record. Only an operationally available Unit with no current or draft Lease offers `Create draft lease`. Occupied Units point to their current Lease or the next genuine downstream repair.

The readiness is derived from the Unit and Lease rows already loaded for the screen. No extra query or duplicate source of truth is added. If two old controls trigger the same vacancy handoff, keep the canonical next action and remove the redundant legacy control after regression coverage proves the remaining route.

## Lease Creation And Placement

Lease creation remains a single drawer organized around Tenant and Unit, Lease period, and Rent and Deposit. The Tenant selection remains visibly selected after any unrelated error.

Before both valid dates exist, the placement area explains that the full Lease period is required to check availability. Property and Unit controls may be disabled, but the reason is visible next to them.

Changing a date re-evaluates placement without erasing valid choices:

- preserve the selected Property and Unit when the Unit is still available for the new full term;
- clear only the Unit when that Unit is no longer eligible but the Property still has another eligible Unit;
- clear both only when the selected Property has no eligible Unit for the new term.

A successful creation stays in a saved state long enough to offer `Open draft`. Editing success can retain its existing close behavior. The Lease inspector renders the derived next action as a link when it has an `href`, and related Property and Unit links remain discoverable.

## Navigation

The Finance Manager can configure Leases and must be able to reach the Lease register from the Finance navigation. Finance Member navigation remains submission-focused even though read-authorized deep links may exist. Super Admin keeps Leases under Properties.

## Legacy Removal Boundary

Authorization to remove legacy UI is used narrowly. Remove a control only when it duplicates the new canonical action, exposes database state instead of a user task, or contradicts readiness. Preserve compatible URLs, filters, checked server actions, archival behavior, and historical display unless a test proves they are unreachable or wrong.

## Accessibility And Responsive Behavior

- Every actionable recommendation is a real link or button with a text label.
- Errors are associated with their field and are not communicated by color alone.
- Disabled relationship controls have nearby explanatory text.
- Keyboard submission, focus management, and sticky drawer actions remain reachable at narrow widths.
- Operational readiness and Lease state are expressed in text.

## Acceptance Criteria

1. Enter valid values in every Property, Unit, and Lease field, introduce one unrelated invalid value, submit, and observe that all valid values remain.
2. Correct one invalid field and observe that only its stale field error clears before resubmission.
3. Use deterministic local fixture IDs through Lease create and representative lifecycle/deposit paths and observe that the mocked checked RPC is reached.
4. See one truthful next action and an explicit financial period on a Property record.
5. See operational readiness and Lease state separately on a Unit, with maintenance/inactive blocking Lease creation and draft Lease continuation avoiding duplicates.
6. Change Lease dates and keep a still-valid Property/Unit selection; receive a visible explanation before availability can be calculated.
7. Create a draft Lease and receive an `Open draft` handoff.
8. Reach Leases from Finance Manager navigation.
9. Pass focused tests, TypeScript, ESLint, production build, and an authenticated browser journey without writing test records during verification.

## Data And Security Boundary

- No migration, seed, generated type, RPC signature, or RLS change.
- No direct browser database writes.
- Existing organization scoping and capability checks remain authoritative.
- Browser acceptance is read-only unless an isolated disposable fixture is explicitly prepared.
