# Custom Roles And Branch Authorization Design

## Status

Approved for local implementation and local verification from detached baseline
`05e84e9b75c4507f2b133ccaf8e7de93a20a5a92`. No commit, push, hosted database
write, deployment, or production release is authorized.

The linked project and repository both contain 99 released migrations. Migration
history reconciliation, Pilot dashboard consistency, Unit bedroom/bathroom
counts, and the compact Settings cleanup have shipped.

## Product contract

- `Super Admin` is the only protected built-in role. It is organization-wide,
  cannot be edited or archived, and exclusively manages branches, teams, users,
  roles, permissions, and cross-branch assignments.
- Every ordinary user has exactly one active branch and one active, non-empty
  custom role.
- Role names are organization-defined. Permission keys and semantics are
  Nestory-defined.
- Custom roles are `active` or `archived`. New roles are active and empty;
  empty or archived roles cannot be assigned; assigned roles cannot archive.
- Every non-View permission depends on its group's View permission. Adding a
  dependent adds View. Removing View removes every dependent in that group.
- Permission removal requires affected-user confirmation. Each permission
  addition/removal creates a separate activity event.
- Existing Pilot organization users remain Super Admin. No automatic user
  conversion or inferred assignment is permitted.
- Ordinary-access activation remains closed until the separately authorized
  protected release applies every approved legacy assignment atomically and
  proves zero legacy ordinary memberships remain.

## Permission catalogue

| Group | Stable key | Label |
| --- | --- | --- |
| Properties | `properties.view` | View |
| Properties | `properties.write` | Add & edit |
| Properties | `properties.archive` | Archive |
| People | `people.view` | View |
| People | `people.write` | Add & edit |
| People | `people.archive` | Archive |
| Leases | `leases.view` | View |
| Leases | `leases.prepare` | Prepare drafts |
| Leases | `leases.activate` | Activate |
| Leases | `leases.change_terms` | Change terms |
| Leases | `leases.close` | Close |
| Leases | `leases.archive` | Archive |
| Finance | `finance.view` | View |
| Finance | `finance.record_payments` | Record payments |
| Finance | `finance.submit_expenses` | Submit expenses |
| Finance | `finance.approve_expenses` | Approve expenses |
| Finance | `finance.correct_records` | Correct records |
| Finance | `finance.close_periods` | Close periods |
| Finance | `finance.publish` | Publish |
| Maintenance | `maintenance.view` | View |
| Maintenance | `maintenance.create_assign` | Create & assign |
| Maintenance | `maintenance.complete` | Complete |
| Maintenance | `maintenance.review` | Review |

## Approved legacy transition

The `Nestory` organization has one active branch, `Synthetic Pilot Phnom Penh`
(`SYN-PP-260812`). This branch is approved for the five identified legacy
ordinary memberships. Assignment is a protected release action, not a local
implementation side effect.

Exact profiles:

- Finance Manager: every Lease key; `finance.view`,
  `finance.record_payments`, `finance.approve_expenses`,
  `finance.correct_records`, `finance.close_periods`, `finance.publish`.
- Finance Member: `leases.view`, `finance.view`,
  `finance.submit_expenses`.
- Operations Manager: all four Maintenance keys.
- Operations Member: `maintenance.view`, `maintenance.complete`.

The transition must preserve stricter workflow invariants. Permission is
necessary, never sufficient, for maker-checker separation, assignee/execution
mode, period reopen/unlock, exceptional correction/reversal, historical
recovery, immutable evidence, lease-owned rent, lifecycle, and audit rules.

## Branch model

- Property is the canonical branch root.
- Unit and Lease inherit through Property. A Lease Unit must belong to the same
  Property.
- Person identity remains organization-wide. Ordinary users see only branch
  relationships; Super Admin sees the complete identity.
- Property creation is branch-aware. An ordinary caller may create only in the
  caller's assigned active branch; Super Admin selects an active branch. The
  released unscoped Property RPC signatures remain compatibility contracts but
  cannot create an unscoped Property after ordinary access is activated.
- Person-to-branch relationships are explicit, audited, and many-to-many.
  Ordinary Person creation atomically creates the identity and its relationship
  to the caller's assigned active branch. Standalone or unresolved Person
  creation remains Super-Admin-only.
- Finance, Documents, Maintenance, Activity, and Storage inherit an
  authoritative parent branch. Unresolved or organization-wide rows remain
  Super-Admin-only. Scope is never guessed.
- Financial month locks become branch-aware for ordinary users. Existing locks
  without a branch remain organization-wide blockers for every branch; a new
  ordinary close applies only to the caller's branch. Reopen and unlock remain
  Super-Admin-only.
- Current broad member-read access to Properties and People is unintended and
  must be closed in database policy, checked functions, server loaders/actions,
  route handlers, navigation, and presentation.

## Unit compatibility

All four released contracts remain supported:

```text
create_unit(uuid, uuid, text, text, numeric, numeric, numeric, text)
create_unit(uuid, uuid, text, text, numeric, text)
update_unit(uuid, uuid, uuid, text, text, numeric, numeric, numeric, text)
update_unit(uuid, uuid, uuid, text, text, numeric, text)
```

The legacy create overload records unknown counts. The legacy update overload
locks and forwards stored counts so rollback clients cannot erase room data.
Authorization and grants must agree across both overload families.

## Interface and containment

- Settings remains compact, table-first, and user-facing. No implementation
  vocabulary or instructional catalogue cards.
- Role register columns: Role, Assigned users, Status, action. One `New role`
  action. Protected Super Admin row. Editor: name, five permission groups,
  Save, Archive.
- Branch/team archive never cascades business data and reports exact active
  dependency consequences.
- A code rollback plus forward containment disables new ordinary assignment
  and custom-role mutation without dropping roles, permissions, assignments,
  or activity.
