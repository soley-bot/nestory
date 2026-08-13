# UI Redesign Verification Evidence

Generated from `config/ui-route-coverage.json` on 2026-08-13T07:40:13.408Z.
Browser artifacts: `artifacts/ui-redesign/ui-redesign-2026-08-13T07-33-13.985Z-axe-p6476`.

## Verdict

- 188 Super Admin route/viewport captures completed across desktop (1440x900), laptop (1280x800), compact-desktop (1024x768) and phone (390x844).
- 4 supplemental Maintenance board viewport captures completed in the same read-only run.
- 235 Finance, Operations, and anonymous access checks matched the manifest.
- Serious/critical axe findings, application errors, document overflow, unreachable actions, blocked mutations, and query-contract failures: 0.
- Copy and information discipline remain contextual design evidence; this runtime result certifies layout, access, interaction, and accessibility behavior.
- Local fixture evidence only; this is not hosted production certification.

## Route matrix

| Manifest route | Smoke path | Super Admin final path | Finance Manager | Finance Member | Operations Manager | Operations Member | Anonymous | States | Viewports / a11y | Query | Limitation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
<!-- route-evidence:/workspace -->
| /workspace | /workspace | /overview | redirected (expected redirected) | redirected (expected redirected) | redirected (expected redirected) | redirected (expected redirected) | login-required (expected login-required) | redirected, permission-blocked | 4/4 pass | not-applicable | None |
<!-- route-evidence:/properties -->
| /properties | /properties?query=Central | /properties?query=Central | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/properties/setup -->
| /properties/setup | /properties/setup?step=1 | /properties/setup?step=1 | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/units -->
| /units | /units?query=09 | /units?query=09 | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/people -->
| /people | /people?query=Dara | /people?query=Dara | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, error, permission-blocked | 4/4 pass | preserved | None |
<!-- route-evidence:/owners -->
| /owners | /owners?query=Sokha | /owners?query=Sokha | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/staff -->
| /staff | /staff?query=Mara | /staff?query=Mara | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/tenants -->
| /tenants | /tenants?query=Dara | /tenants?query=Dara | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/vendors -->
| /vendors | /vendors?query=Vendor | /vendors?query=Vendor | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/leases -->
| /leases | /leases?query=Dara | /leases?query=Dara | accessible (expected accessible) | accessible (expected accessible) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/rent-income -->
| /rent-income | /rent-income?query=Central | /rent-income?query=Central | accessible (expected accessible) | accessible (expected accessible) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/bills-expenses -->
| /bills-expenses | /bills-expenses?query=Repair | /bills-expenses?query=Repair | accessible (expected accessible) | accessible (expected accessible) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/ledger -->
| /ledger | /ledger?query=Central | /ledger?query=Central | accessible (expected accessible) | accessible (expected accessible) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/petty-cash -->
| /petty-cash | /petty-cash | /petty-cash | accessible (expected accessible) | accessible (expected accessible) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/maintenance -->
| /maintenance | /maintenance?view=list&query=Kitchen | /maintenance?view=list&query=Kitchen | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | accessible (expected accessible) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/tasks -->
| /tasks | /tasks?query=Kitchen | /tasks?query=Kitchen | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | accessible (expected accessible) | accessible (expected accessible) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/recurring-tasks -->
| /recurring-tasks | /recurring-tasks | /recurring-tasks | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | accessible (expected accessible) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/inspections -->
| /inspections | /inspections | /inspections | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | accessible (expected accessible) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/work-orders -->
| /work-orders | /work-orders | /work-orders | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | accessible (expected accessible) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/timeline -->
| /timeline | /timeline?query=Kitchen | /timeline?query=Kitchen | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/financial-timeline -->
| /financial-timeline | /financial-timeline?query=Central | /financial-timeline?query=Central | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/maintenance-timeline -->
| /maintenance-timeline | /maintenance-timeline?query=Kitchen | /maintenance-timeline?query=Kitchen | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/property-timeline -->
| /property-timeline | /property-timeline?propertyId=10000000-0000-0000-0000-000000000001 | /property-timeline?propertyId=10000000-0000-0000-0000-000000000001 | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/documents -->
| /documents | /documents?query=lease | /documents?query=lease | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/reports -->
| /reports | /reports | /reports | accessible (expected accessible) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | populated, permission-blocked | 4/4 pass | not-applicable | None |
<!-- route-evidence:/reports/[reportKind] -->
| /reports/[reportKind] | /reports/unit-profit-loss?month=2026-07 | /reports/unit-profit-loss?month=2026-07 | accessible (expected accessible) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked | 4/4 pass | preserved | None |
<!-- route-evidence:/settings -->
| /settings | /settings | /settings | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/settings/rent-policy -->
| /settings/rent-policy | /settings/rent-policy | /settings/rent-policy | accessible (expected accessible) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | populated, empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/users-roles -->
| /users-roles | /users-roles | /users-roles | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/account -->
| /account | /account | /account | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | login-required (expected login-required) | loading, populated, error, permission-blocked | 4/4 pass | not-applicable | None |
<!-- route-evidence:/import -->
| /import | /import | /import | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/overview -->
| /overview | /overview | /overview | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked | 4/4 pass | not-applicable | None |
<!-- route-evidence:/overview/[view] -->
| /overview/[view] | /overview/attention?month=2026-07 | /overview/attention?month=2026-07 | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, error, permission-blocked | 4/4 pass | preserved | None |
<!-- route-evidence:/properties/[propertyId] -->
| /properties/[propertyId] | /properties/10000000-0000-0000-0000-000000000001 | /properties/10000000-0000-0000-0000-000000000001 | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/units/[unitId] -->
| /units/[unitId] | /units/20000000-0000-0000-0000-000000000001 | /units/20000000-0000-0000-0000-000000000001 | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/people/[personId] -->
| /people/[personId] | /people/80000000-0000-4000-8000-000000000001 | /people/80000000-0000-4000-8000-000000000001 | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/ -->
| / | / | /overview | redirected (expected redirected) | redirected (expected redirected) | redirected (expected redirected) | redirected (expected redirected) | accessible (expected accessible) | populated | 4/4 pass | not-applicable | None |
<!-- route-evidence:/request -->
| /request | /request?intent=demo | /request?intent=demo | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | draft, saving, error, success | 4/4 pass | preserved | Submissions are stored for follow-up; outbound email notification is not configured. |
<!-- route-evidence:/login -->
| /login | /login | /overview | redirected (expected redirected) | redirected (expected redirected) | redirected (expected redirected) | redirected (expected redirected) | accessible (expected accessible) | draft, saving, error, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/forgot-password -->
| /forgot-password | /forgot-password | /forgot-password | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | draft, saving, success, error | 4/4 pass | not-applicable | None |
<!-- route-evidence:/update-password -->
| /update-password | /update-password | /update-password | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | draft, saving, success, error | 4/4 pass | not-applicable | A valid Supabase recovery session is required for a successful password update. |
<!-- route-evidence:/auth/complete -->
| /auth/complete | /auth/complete?next=%2Faccept-invite%3Finvitation%3D11111111-1111-4111-8111-111111111111 | /auth/complete?next=%2Faccept-invite%3Finvitation%3D11111111-1111-4111-8111-111111111111 | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | loading, error | 4/4 pass | preserved | A fresh Supabase implicit-flow email fragment is required for successful completion. |
<!-- route-evidence:/accept-invite -->
| /accept-invite | /accept-invite?invitation=11111111-1111-4111-8111-111111111111 | /accept-invite?invitation=11111111-1111-4111-8111-111111111111 | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | draft, saving, success, error, permission-blocked | 4/4 pass | preserved | A valid matching invitation and Supabase-authenticated email session are required for acceptance. |
<!-- route-evidence:/no-access -->
| /no-access | /no-access | /no-access | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | login-required (expected login-required) | permission-blocked | 4/4 pass | not-applicable | Unlinked-account browser presentation is covered by unit and state contracts; the retained local fixtures represent linked roles. |
<!-- route-evidence:/finance -->
| /finance | /finance | /finance | accessible (expected accessible) | accessible (expected accessible) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/balances -->
| /balances | /balances | /balances | accessible (expected accessible) | accessible (expected accessible) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/properties/[propertyId]/account -->
| /properties/[propertyId]/account | /properties/10000000-0000-0000-0000-000000000001/account | /properties/10000000-0000-0000-0000-000000000001/account | accessible (expected accessible) | accessible (expected accessible) | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |

## Cross-route workflow evidence

- Command search, focus trap, keyboard traversal, and property/unit/person result safety: `src/components/layout/workspace-command-palette.test.tsx`.
- Property filter, selected record, inspector, detail, and retained query behavior: `src/features/properties/components/property-screen.test.tsx` and the route matrix query checks.
- People lenses, person detail, and related leases: `src/features/people/components/people-screen.test.tsx` and `src/features/people/components/person-detail-screen.test.tsx`.
- Rent, expense, ledger totals and drilldowns: finance workspace component tests plus the populated browser captures.
- Maintenance list, board, calendar, checklist, and capability-correct actions: `src/features/maintenance/components/maintenance-workspace-ui.test.tsx` and Operations role audits.
- Timeline scope routes and linked records: timeline route tests and the four timeline captures.
- Three required report tabs with PDF and Excel export: report screen tests and `/reports/unit-profit-loss` capture.
- Settings draft, discard, save, and error: settings workspace tests and shared workflow feedback contracts.
- Import preview create/update/skip consequences: import screen tests; browser capture remains read-only.

## Information-discipline evidence

- The product-owner contract no longer imposes a paragraph-free rule or a mandatory route-by-route copy-disposition gate on Finance and owner-balance surfaces.
- The completed supplemental review in `config/enterprise-frontend-content-review.json` still covers all 47 manifest routes and preserves concise safety, permission, consequence, recovery, and accessibility guidance.
- Automated copy lint remains a regression guard; contextual product review, workflow acceptance, and financial auditability determine whether explanatory or technical detail is appropriate.

## Keyboard, zoom, and state evidence

- Native tab order, current navigation, command palette focus trap, drawer Escape/return, field error association, and live announcements are enforced by `src/lib/ui/accessibility-contract.test.tsx` and feature interaction tests.
- The saved manifest captures cover desktop (1440x900), laptop (1280x800), compact-desktop (1024x768) and phone (390x844); pass counts in the route matrix are derived from this runtime viewport list.
- 6/6 pass: keyboard traversal at a 720x450 CSS viewport equivalent to 1440x900 at 200%. 1 route(s) also applied and measured actual 200% root-font large text. This is an equivalent layout and large-text audit, not actual browser zoom. Actual 200% browser zoom remains manual and unverified.
- Loading, true empty, filtered empty, error/retry, permission blocked, draft, saving, and success evidence is mapped per route in the manifest and validated by `src/lib/ui/route-state-evidence.test.ts`.

## Known limitation

The retained browser fixtures cover all five linked workspace roles. Unlinked-account no-access presentation is covered by auth and system-state contracts; no disposable unlinked browser account is retained. Owner: Product/QA. Follow-up: add an ephemeral unlinked fixture when the local auth harness supports automatic teardown.
