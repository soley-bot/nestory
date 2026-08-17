# Property Workspace, Lease, and Finance Simplification Evidence

Date: 2026-08-17

## Delivered Stage A

- Property creation is concise and hands off to a whole-Property or separate-Unit rental structure.
- Lease creation is contextual to a Property or Unit, with Lease-owned rent rules and simple immediate or scheduled activation.
- Activation and manual tenant charges use checked, organization-scoped database functions and preserve exact-decimal billing behavior.
- Property and Unit records expose scoped Rent and Expenses workspaces; Property also exposes Owner account work.
- Global Finance is a secondary portfolio review surface. Ledger, Petty cash, and historical Rent policies remain available under Advanced.
- Historical Lease billing and finance records remain supported. No destructive legacy retirement is part of Stage A.

## Verification

- Local Supabase migrations replayed from a clean reset and the disposable fixture loaded successfully.
- The complete pgTAP suite passed 1,988 assertions; the new contextual Lease and charge suite passed 31 assertions.
- Vitest passed 249 files and 1,785 tests with no skips or failures.
- Node contract tests passed 103 tests with no skips or failures.
- Authenticated browser verification passed 84 of 84 visible-link journeys across all five roles plus four direct-denial checks.
- The dedicated Property flow smoke, TypeScript check, ESLint, migration discipline, database lint, and production build passed.

## Release Boundary

This evidence covers an additive local Stage A implementation. Verification used the disposable local Supabase project only. No hosted database, production record, deployment alias, or production environment was changed. Destructive removal of legacy routes, tables, policies, or historical data remains a separate Stage B decision.
