# Scoped design constraints and decisions

**Maintained:** 2026-08-15
**Scope:** current enterprise frontend redesign working tree only

These records govern presentation and information architecture. They do not alter authorization, financial authority, routes, database behavior, contracts, or `PROJECT.md`.

## Active constraints

### DD-C01 — Financial month lock language is literal

- **Constraint:** UI copy must use `financial month lock`, `month lock`, `lock`, and `unlock` (or equally narrow operational wording).
- **Prohibited without a product-contract change:** `accounting period`, `period close`, `close the books`, and any copy implying accounting-book authority.
- **Reason:** `PROJECT.md` explicitly defines `financial_month_locks` as the only narrow financial time gate and explicitly says it is not accounting period close.
- **Affected current files:** `src/features/ledger/components/ledger-screen.tsx` and its tests.
- **Status:** satisfied in the current working tree; focused tests, copy scan, and the local Ledger modal check pass.

### DD-C02 — Quick view stays read-oriented and bounded

- **Constraint:** a record quick view may widen to 760px when comparison context requires it, but must retain one canonical record action, managed focus, Escape dismissal, and no long workflow form.
- **Decision:** the property quick view may use the new `wide` size; the default remains 640px.
- **Reason:** this preserves the accepted screenshot-matched property composition without turning the quick view into a persistent inspector.
- **Status:** adopted; browser revalidation pending.

### DD-C03 — Canonical record sections may consolidate duplicated surfaces

- **Decision:** property sections `Overview / Units / Account / Maintenance / Files` and person sections `Overview / Related` are accepted as the current direction.
- **Constraint:** history remains canonical on the timeline destination; records may show only a recent, decision-relevant slice. Placeholder media must not occupy a first-class tab.
- **Constraint:** section controls must provide correct tab or navigation semantics, keyboard operation, URL restoration, and back/forward behavior.
- **Status:** structure adopted; interaction acceptance pending.

### DD-C04 — Consequential actions use focused confirmation

- **Decision:** archive/restore, ledger posting, reversal, and other bounded consequences may use a compact modal instead of a drawer.
- **Constraint:** the dialog names the target and consequence, offers safe cancel, returns focus to the actual opener, and has tests matching the rendered primitive rather than stale drawer vocabulary.
- **Status:** adopted; the full UI tier and TypeScript check now pass. Destructive workflow round trips remain pending.

### DD-C05 — One operational vocabulary per finance concept

- **Constraint:** distinguish tenant payment, owner invoice payment, owner contribution, owner reimbursement, owner distribution, owner-direct rent collection, and owner balance. Do not collapse them into generic `Owner payments`.
- **Reason:** the product contract distinguishes obligations from settlement and requires source-linked cash meaning.
- **Status:** satisfied in the current transaction-work filter; the UI copy gate passes.

## Pending product decisions

### DD-P01 — Canonical Lease placement in navigation

- **Question:** Is `Leases` a first-class destination for Finance roles while nested under `Properties` for Super Admin, or should all relevant roles use one consistent domain placement?
- **Current tree:** Super Admin receives Leases under Properties; Finance Manager and Finance Member receive a separate top-level Leases destination; the mobile Finance local nav omits Leases.
- **Why a decision is needed:** the accepted redesign architecture previously described Leases inside Finance navigation for Finance roles and grouped lease/finance operations as one product domain. The current variant may be valid, but it is not yet a recorded product IA decision.
- **Default until decided:** preserve route access and capability checks; do not add further duplicate Lease links.

### DD-P02 — Meaning of `inactive` in People

- **Question:** Does an inactive person-role relationship need a dedicated operator filter distinct from archived person records?
- **Current tree:** the `inactive` status filter was removed while archive state remains a separate query.
- **Why a decision is needed:** a person can remain an important historical record while a tenant/owner/vendor/staff relationship is inactive. Removing the filter may hide a legitimate operational lens rather than merely simplifying presentation.
- **Default until decided:** do not claim the inactive-state workflow is complete; retain historical labels in records and exports.

## Supersession rule

These decisions are scoped to frontend presentation. A later product decision or explicit `PROJECT.md` change supersedes them. Implementation tests cannot supersede the product contract merely by encoding changed copy.
