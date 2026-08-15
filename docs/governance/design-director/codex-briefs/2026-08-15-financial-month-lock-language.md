# Codex brief 1 — Restore the financial month-lock boundary

**Priority:** P0 product-contract correction
**Owner:** Codex frontend implementation
**Bounded routes:** `/ledger` only

## Problem

The current Ledger UI renames the product's narrow financial month lock to `Accounting periods`, `Close`, `Reopen`, and `Closed periods`. This implies accounting-period close authority that Nestory explicitly does not have.

## Required outcome

Restore literal operational month-lock language while preserving all existing permissions, RPC/action payloads, lock state, dates, reasons, organization scope, and Super-Admin-only unlock authority.

## Allowed implementation scope

- `src/features/ledger/components/ledger-screen.tsx`
- `src/features/ledger/components/ledger-screen.test.tsx`
- Existing focused copy/route tests only where expectations must match the corrected wording

Do not modify `PROJECT.md`, database code, migrations, generated types, actions/contracts, or unrelated finance screens.

## Copy contract

Use a coherent set such as:

- Trigger/title: `Month lock`
- Description: `Lock or unlock a financial month for the organization.`
- Actions: `Lock` / `Unlock`
- List heading: `Locked months`
- Empty state: `No months are locked.`
- Consequence: explain that locking pauses authorized financial mutations for the selected month; do not say the books or accounting period are closed.

## Acceptance

1. No ordinary Ledger UI copy contains `accounting period`, `period close`, `closed period`, or `reopen` as a substitute for unlock.
2. Finance Manager sees lock but not unlock; Super Admin sees both, matching existing capabilities.
3. Existing server action names and submitted `locked` / `unlocked` values are unchanged.
4. Focus, Escape, close, consequence text, and success announcement remain covered.
5. Run and report:
   - focused Ledger component/action tests;
   - `npm run test:ui-copy`;
   - `npx tsc --noEmit` (report unrelated blockers honestly);
   - `git diff --check`.

## Evidence note

Passing tests that assert `Accounting periods` are not acceptance; those expectations currently encode the contract violation and must be corrected.
