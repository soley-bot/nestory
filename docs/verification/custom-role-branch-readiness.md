# Custom Role And Branch Authorization Readiness

## Release scope

The package is authorized for publication and production release after every
local and CI gate passes. Production migrations may run only from the exact
merged `main` SHA through the protected `production-database` environment in
`.github/workflows/ci.yml`; developer-checkout and connector writes remain
forbidden.

## Proven baseline and recovery checkpoint

- Worktree: `C:/Users/USer/.codex/worktrees/9c29/nestory`
- Package merge: `79d9f5199f44daeaee19bfc6e0631cd8dfe76ce8`
- First recovery merge and current recovery base:
  `f12788d599f919c5b1b563e95d52c6eb9f053ef3`
- Package baseline: 99 migrations, ending at
  `20260821155604_add_unit_room_counts.sql`; the hosted checkpoint is 103 and
  the complete local package is 107.
- PR #77 migration reconciliation, PR #84 Unit room counts, and PR #85 compact
  Settings cleanup are merged.
- Linked project default privileges require explicit grants for new public
  tables/functions. RLS and grants must ship together.
- The protected package release stopped atomically when `20260822053215` found
  CRLF in five legacy hosted function bodies. Those five approved targets were
  normalized through the protected workflow; the next atomic attempt exposed
  the same legacy newline difference in three photo functions and again
  recorded no package migration. The hosted ledger remains 103 at
  `20260822045638`, with exactly four Git migrations pending.
- The approved recovery pins all eight raw and LF-normalized definitions. The
  first five must remain normalized; the three photo targets must be all raw or
  all normalized before any definition executes. It changes CRLF to LF only
  and verifies unchanged function identity, ownership, ACLs, and
  execution/planner metadata before migration apply.
- Its checkpoint classifier runs normalization only at 103, rejects partial
  package ledgers, and becomes a verified skip after all four migrations exist
  so later production releases remain available.

## Approved transition inventory

- Organization `Pilot`: four current users, all Super Admin; unchanged.
- Organization `Nestory`: five legacy ordinary memberships: one Finance
  Manager, one Finance Member, one Operations Manager, two Operations Members.
- Active branch choices: exactly one, `Synthetic Pilot Phnom Penh`
  (`SYN-PP-260812`).
- The five-user manifest and exact permission profiles are approved.
- Synthetic accounts are test data. Jester Heng is included exactly in the
  approved manifest. No unlisted user may be inferred or converted.
- Ordinary activation remains closed until a separate protected release
  applies the five approved assignments atomically.

## Property branch foundation (local only)

- CLI-generated forward migration:
  `20260822023001_property_branch_scope_foundation.sql`.
- Property now has a nullable, same-organization branch identity with the
  `(organization_id, branch_id, archived_at)` supporting index.
- The migration backfills only organizations with exactly one active,
  non-archived branch. Zero/multiple-active-branch Properties remain null;
  inactive/archived links are counted as conflicts.
- Checked readiness reports active-branch, total/scoped/unscoped Property, and
  conflict counts. A fresh organization with no Properties is ready; an
  organization with Properties and zero active branches is not.
- Checked branch assignment locks authorization state, then the caller's
  current organization membership before reading Super Admin authority; it
  then locks branch and Property in that order. It rejects
  null, inactive-only, active-with-archived-evidence, and cross-organization
  targets, and records one activity event. Authenticated and service roles
  cannot change Property branch directly.
- Ordinary activation additionally requires zero unresolved/conflicting
  Property rows. The exact applied transition-manifest and zero-legacy checks
  remain unchanged and are still required when applicable.

## Remaining unresolved scope

- Organizations with zero or multiple active branches retain unresolved
  Properties and remain Super-Admin-only for ordinary-access readiness.
- Current broad member-read policies for Property/Unit/Person are unintended
  and close under the new model.
- Existing organization-wide financial month locks remain global blockers.
  Branch-specific locks are available to ordinary `finance.close_periods` in
  their assigned branch; reopen/unlock remains Super-Admin-only.

## Unit contract

Released local and hosted schema contain nullable `smallint` bedroom/bathroom
columns with `0..100` checks and four callable overloads:

```text
create_unit(uuid,uuid,text,text,numeric,numeric,numeric,text)
create_unit(uuid,uuid,text,text,numeric,text)
update_unit(uuid,uuid,uuid,text,text,numeric,numeric,numeric,text)
update_unit(uuid,uuid,uuid,text,text,numeric,text)
```

The handwritten `src/types/database.ts` override preserves all four overloads,
including the two room-count signatures and both intentionally retained legacy
signatures for rollback compatibility.

## Local verification evidence

- Migration discipline passes with 99 immutable base migrations, eight
  forward-only package migrations, and 20 historical reconciliation
  declarations. No released migration changed.
- A clean 107-migration replay succeeds and `supabase db diff --local --schema
  public` reports no schema changes.
- Generated public types are byte-identical after regeneration. Database lint
  exits zero with warnings only.
- The definitive database gate passes 78 pgTAP files / 2,782 assertions plus
  the loaded-fixture lifecycle contract.
- Application gates pass: ESLint, TypeScript, 1,376 unit assertions, 733 UI
  assertions, 127 contract assertions, and the optimized Next.js build.
- The five approved fixture-role journeys pass at desktop, laptop, and phone
  sizes. Compact browser checks also pass for Super Admin Roles, Branches, and
  Access management, and for Finance Manager Month Lock with no unlock option.
- User-facing package copy uses compact product terms. The Month Lock consequence
  says financial changes are prevented, and the role permission is labeled
  `Lock month`; user-visible package text does not use `mutation`.
- The protected database job captures aggregate-only Pilot entity/history
  counts before migration apply and requires a byte-identical postflight with
  exactly four Super Admin memberships.
- Recovery PR CI, the protected 103-to-107 hosted release, Pilot postflight, and
  exact-main deployment evidence are still required before production completion.
