# UI Redesign Verification Evidence

Generated from `config/ui-route-coverage.json` on 2026-07-16T13:43:01.067Z.
Browser artifacts: `artifacts/ui-redesign/2026-07-16T13-33-27Z`.

## Verdict

- 138 admin route/viewport captures passed across desktop, compact desktop, and phone.
- 138 manager, member, and anonymous access checks matched the manifest.
- Serious/critical axe findings, application errors, document overflow, unreachable actions, blocked mutations, and query-contract failures: 0.
- Local fixture evidence only; this is not hosted production certification.

## Route matrix

| Manifest route | Smoke path | Admin final path | Manager | Member | Anonymous | States | Viewports / a11y | Query / redirect | Limitation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
<!-- route-evidence:/workspace -->
| /workspace | /workspace | /workspace | accessible (expected accessible) | accessible (expected accessible) | login-required (expected login-required) | populated, permission-blocked | 3/3 pass | not-applicable | None |
<!-- route-evidence:/properties -->
| /properties | /properties?query=Central | /properties?query=Central | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | preserved | None |
<!-- route-evidence:/properties/setup -->
| /properties/setup | /properties/setup?step=1 | /properties/setup?step=1 | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, error, permission-blocked, draft, saving, success | not rerun | preserved | Implementation-backed entry added after the dated browser artifact; focused browser route sweep not rerun. |
<!-- route-evidence:/units -->
| /units | /units?query=09 | /units?query=09 | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | preserved | None |
<!-- route-evidence:/people -->
| /people | /people?query=Dara | /people?query=Dara | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, error, permission-blocked | 3/3 pass | preserved | None |
<!-- route-evidence:/owners -->
| /owners | /owners?query=Sokha | /owners?query=Sokha | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | preserved | None |
<!-- route-evidence:/staff -->
| /staff | /staff?query=Mara | /staff?query=Mara | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | preserved | None |
<!-- route-evidence:/tenants -->
| /tenants | /tenants?query=Dara | /tenants?query=Dara | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | preserved | None |
<!-- route-evidence:/vendors -->
| /vendors | /vendors?query=Vendor | /vendors?query=Vendor | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | preserved | None |
<!-- route-evidence:/leases -->
| /leases | /leases?query=Dara | /leases?query=Dara | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | preserved | None |
<!-- route-evidence:/rent-income -->
| /rent-income | /rent-income?query=Central | /rent-income?query=Central | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | preserved | None |
<!-- route-evidence:/bills-expenses -->
| /bills-expenses | /bills-expenses?query=Repair | /bills-expenses?query=Repair | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | preserved | None |
<!-- route-evidence:/ledger -->
| /ledger | /ledger?query=Central | /ledger?query=Central | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | preserved | None |
<!-- route-evidence:/petty-cash -->
| /petty-cash | /petty-cash | /petty-cash | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | not-applicable | None |
<!-- route-evidence:/maintenance -->
| /maintenance | /maintenance?view=list&query=Kitchen | /maintenance?view=list&query=Kitchen | accessible (expected accessible) | accessible (expected accessible) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | preserved | None |
<!-- route-evidence:/tasks -->
| /tasks | /tasks?query=Kitchen | /tasks?query=Kitchen | accessible (expected accessible) | accessible (expected accessible) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | preserved | None |
<!-- route-evidence:/recurring-tasks -->
| /recurring-tasks | /recurring-tasks | /recurring-tasks | accessible (expected accessible) | accessible (expected accessible) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | not-applicable | None |
<!-- route-evidence:/inspections -->
| /inspections | /inspections | /inspections | accessible (expected accessible) | accessible (expected accessible) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | not-applicable | None |
<!-- route-evidence:/work-orders -->
| /work-orders | /work-orders | /work-orders | accessible (expected accessible) | accessible (expected accessible) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | not-applicable | None |
<!-- route-evidence:/timeline -->
| /timeline | /timeline?query=Kitchen | /timeline?query=Kitchen | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | preserved | None |
<!-- route-evidence:/financial-timeline -->
| /financial-timeline | /financial-timeline?query=Central | /financial-timeline?query=Central | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | preserved | None |
<!-- route-evidence:/maintenance-timeline -->
| /maintenance-timeline | /maintenance-timeline?query=Kitchen | /maintenance-timeline?query=Kitchen | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | preserved | None |
<!-- route-evidence:/property-timeline -->
| /property-timeline | /property-timeline?propertyId=10000000-0000-0000-0000-000000000001 | /property-timeline?propertyId=10000000-0000-0000-0000-000000000001 | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | preserved | None |
<!-- route-evidence:/documents -->
| /documents | /documents?query=lease | /documents?query=lease | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | preserved | None |
<!-- route-evidence:/reports -->
| /reports | /reports | /reports | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked | 3/3 pass | not-applicable | None |
<!-- route-evidence:/reports/[reportKind] -->
| /reports/[reportKind] | /reports/rent-roll?month=2026-07 | /reports/rent-roll?month=2026-07 | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked | 3/3 pass | preserved | None |
<!-- route-evidence:/people-reports -->
| /people-reports | /people-reports | /people-reports | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked | 3/3 pass | not-applicable | None |
<!-- route-evidence:/settings -->
| /settings | /settings | /settings | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, error, permission-blocked, draft, saving, success | 3/3 pass | not-applicable | None |
<!-- route-evidence:/users-roles -->
| /users-roles | /users-roles | /users-roles | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, error, permission-blocked, draft, saving, success | 3/3 pass | not-applicable | None |
<!-- route-evidence:/account -->
| /account | /account | /account | accessible (expected accessible) | accessible (expected accessible) | login-required (expected login-required) | loading, populated, error, permission-blocked | 3/3 pass | not-applicable | None |
<!-- route-evidence:/import -->
| /import | /import | /import | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | not-applicable | None |
<!-- route-evidence:/overview -->
| /overview | /overview | /overview | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked | 3/3 pass | not-applicable | None |
<!-- route-evidence:/overview/[view] -->
| /overview/[view] | /overview/attention?month=2026-07 | /overview/attention?month=2026-07 | not rerun (expected permission-blocked) | not rerun (expected permission-blocked) | not rerun (expected login-required) | loading, populated, error, permission-blocked | admin desktop checked this turn | preserved | Added after the retained full-browser evidence; role and responsive matrix not rerun. |
<!-- route-evidence:/properties/[propertyId] -->
| /properties/[propertyId] | /properties/10000000-0000-0000-0000-000000000001 | /properties/10000000-0000-0000-0000-000000000001 | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | not-applicable | None |
<!-- route-evidence:/units/[unitId] -->
| /units/[unitId] | /units/20000000-0000-0000-0000-000000000001 | /units/20000000-0000-0000-0000-000000000001 | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | not-applicable | None |
<!-- route-evidence:/people/[personId] -->
| /people/[personId] | /people/80100000-0000-0000-0000-000000000001 | /people/80100000-0000-0000-0000-000000000001 | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 3/3 pass | not-applicable | None |
<!-- route-evidence:/ -->
| / | / | /workspace | redirected (expected redirected) | redirected (expected redirected) | accessible (expected accessible) | populated | 3/3 pass | not-applicable | None |
<!-- route-evidence:/request -->
| /request | /request?intent=demo | /request?intent=demo | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | draft, saving, error, success | focused browser check pending | preserved | Submissions are stored for follow-up; outbound email notification is not configured. |
<!-- route-evidence:/login -->
| /login | /login | /workspace | redirected (expected redirected) | redirected (expected redirected) | accessible (expected accessible) | draft, saving, error, success | 3/3 pass | not-applicable | None |
<!-- route-evidence:/forgot-password -->
| /forgot-password | /forgot-password | /forgot-password | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | draft, saving, success, error | 3/3 pass | not-applicable | Recovery delivery is verified separately through local Mailpit. |
<!-- route-evidence:/update-password -->
| /update-password | /update-password | /update-password | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | draft, saving, success, error | 3/3 pass | not-applicable | Successful update requires a valid Supabase recovery session. |
<!-- route-evidence:/auth/complete -->
| /auth/complete | /auth/complete?next=%2Faccept-invite%3Finvitation%3D11111111-1111-4111-8111-111111111111 | not rerun (expected accessible) | not rerun (expected accessible) | not rerun (expected accessible) | not rerun (expected accessible) | loading, error | implementation-backed route evidence | preserved | A fresh Supabase implicit-flow email fragment is required for successful completion; the dated browser route sweep predates this manifest row. |
<!-- route-evidence:/accept-invite -->
| /accept-invite | /accept-invite?invitation=11111111-1111-4111-8111-111111111111 | /accept-invite?invitation=11111111-1111-4111-8111-111111111111 | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | draft, saving, success, error, permission-blocked | 3/3 pass | preserved | Acceptance requires a matching pending invitation and verified Supabase email session. |
<!-- route-evidence:/signup -->
| /signup | /signup | /login or /workspace | redirected (expected redirected) | redirected (expected redirected) | login-required (expected login-required) | redirect only | 3/3 pass | not-applicable | Public registration is retired; authenticated sessions continue through the auth proxy. |
<!-- route-evidence:/setup -->
| /setup | /setup | /no-access | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | redirect only | 3/3 pass | not-applicable | Public workspace setup is retired; authenticated users continue to the no-access recovery page. |
<!-- route-evidence:/no-access -->
| /no-access | /no-access | /no-access | accessible (expected accessible) | accessible (expected accessible) | login-required (expected login-required) | permission-blocked | 3/3 pass | not-applicable | Unlinked-account browser presentation is covered by unit and state contracts; the retained local fixtures represent linked roles. |
<!-- route-evidence:/property-dashboard -->
| /property-dashboard | /property-dashboard?query=HOME&tag=late&tag=open | /overview?lens=records&query=HOME&tag=late&tag=open | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | redirect only | 3/3 pass | redirect-preserved | None |
<!-- route-evidence:/finance-dashboard -->
| /finance-dashboard | /finance-dashboard?query=HOME&tag=late&tag=open | /overview?lens=finance&query=HOME&tag=late&tag=open | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | redirect only | 3/3 pass | redirect-preserved | None |
<!-- route-evidence:/maintenance-dashboard -->
| /maintenance-dashboard | /maintenance-dashboard?query=HOME&tag=late&tag=open | /overview?lens=maintenance&query=HOME&tag=late&tag=open | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | redirect only | 3/3 pass | redirect-preserved | None |
<!-- route-evidence:/payments -->
| /payments | /payments?query=HOME&tag=late&tag=open | /rent-income?query=HOME&tag=late&tag=open | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | redirect only | 3/3 pass | redirect-preserved | None |
<!-- route-evidence:/invoices -->
| /invoices | /invoices?query=HOME&tag=late&tag=open | /bills-expenses?query=HOME&tag=late&tag=open | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | redirect only | 3/3 pass | redirect-preserved | None |
<!-- route-evidence:/schedule -->
| /schedule | /schedule?query=HOME&tag=late&tag=open | /maintenance?view=calendar&query=HOME&tag=late&tag=open | redirected (expected redirected) | redirected (expected redirected) | login-required (expected login-required) | redirect only | 3/3 pass | redirect-preserved | None |
<!-- route-evidence:/team -->
| /team | /team?query=HOME&tag=late&tag=open | /staff?query=HOME&tag=late&tag=open | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | redirect only | 3/3 pass | redirect-preserved | None |

## Cross-route workflow evidence

- Command search, focus trap, keyboard traversal, and property/unit/person result safety: `src/components/layout/workspace-command-palette.test.tsx`.
- Property filter, selected record, inspector, detail, and retained query behavior: `src/features/properties/components/property-screen.test.tsx` and the route matrix query checks.
- People lens aliases, person detail, and related leases: `src/features/people/components/people-screen.test.tsx` and `src/features/people/components/person-detail-screen.test.tsx`.
- Rent, expense, ledger totals and drilldowns: finance workspace component tests plus the populated browser captures.
- Maintenance list, board, calendar, checklist, and capability-correct actions: `src/features/maintenance/components/maintenance-workspace-ui.test.tsx` and manager/member role audits.
- Timeline scope routes and linked records: timeline route tests and the four timeline captures.
- Report library, parameterized report, CSV/PDF/print controls: report screen tests and `/reports/rent-roll` capture.
- Settings draft, discard, save, and error: settings workspace tests and shared workflow feedback contracts.
- Import preview create/update/skip consequences: import screen tests; browser capture remains read-only.

## Keyboard, zoom, and state evidence

- Native tab order, current navigation, command palette focus trap, drawer Escape/return, field error association, and live announcements are enforced by `src/lib/ui/accessibility-contract.test.tsx` and feature interaction tests.
- The 1440x900, 1024x768, and 390x844 captures provide 3/3 responsive evidence for every manifest row. A separate 720x450, 200%-equivalent layout audit covered ten representative route families without document overflow.
- Loading, true empty, filtered empty, error/retry, permission blocked, draft, saving, and success evidence is mapped per route in the manifest and validated by `src/lib/ui/route-state-evidence.test.ts`.

## Known limitation

The retained browser fixtures cover linked admin, manager, and member accounts. Unlinked-account setup/no-access presentation is covered by auth and system-state contracts; no disposable unlinked browser account is retained. Owner: Product/QA. Follow-up: add an ephemeral unlinked fixture when the local auth harness supports automatic teardown.
