# UI Redesign Verification Evidence

Generated from `config/ui-route-coverage.json` on 2026-08-04T12:01:59.260Z.
Browser artifacts: `artifacts/ui-redesign/ui-redesign-2026-08-04T11-51-21.272Z-axe-p24240`.

## Verdict

- 216 admin route/viewport captures completed across desktop (1440x900), laptop (1280x800), compact-desktop (1024x768) and phone (390x844).
- 4 supplemental Maintenance board viewport captures completed in the same read-only run.
- 162 manager, member, and anonymous access checks matched the manifest.
- Serious/critical axe findings, application errors, document overflow, unreachable actions, blocked mutations, and query-contract failures: 0.
- Local fixture evidence only; this is not hosted production certification.

## Route matrix

| Manifest route | Smoke path | Admin final path | Manager | Member | Anonymous | States | Viewports / a11y | Query / redirect | Limitation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
<!-- route-evidence:/workspace -->
| /workspace | /workspace | /workspace | accessible (expected accessible) | accessible (expected accessible) | login-required (expected login-required) | populated, permission-blocked | 4/4 pass | not-applicable | None |
<!-- route-evidence:/properties -->
| /properties | /properties?query=Central | /properties?query=Central | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/properties/setup -->
| /properties/setup | /properties/setup?step=1 | /properties/setup?step=1 | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | Implementation-backed route evidence only; the focused task did not rerun the browser route sweep. |
<!-- route-evidence:/units -->
| /units | /units?query=09 | /units?query=09 | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/people -->
| /people | /people?query=Dara | /people?query=Dara | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, error, permission-blocked | 4/4 pass | preserved | None |
<!-- route-evidence:/owners -->
| /owners | /owners?query=Sokha | /owners?query=Sokha | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/staff -->
| /staff | /staff?query=Mara | /staff?query=Mara | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/tenants -->
| /tenants | /tenants?query=Dara | /tenants?query=Dara | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/vendors -->
| /vendors | /vendors?query=Vendor | /vendors?query=Vendor | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/leases -->
| /leases | /leases?query=Dara | /leases?query=Dara | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/rent-income -->
| /rent-income | /rent-income?query=Central | /rent-income?query=Central | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/bills-expenses -->
| /bills-expenses | /bills-expenses?query=Repair | /bills-expenses?query=Repair | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/ledger -->
| /ledger | /ledger?query=Central | /ledger?query=Central | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/petty-cash -->
| /petty-cash | /petty-cash | /petty-cash | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/maintenance -->
| /maintenance | /maintenance?view=list&query=Kitchen | /maintenance?view=list&query=Kitchen | accessible (expected accessible) | accessible (expected accessible) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/tasks -->
| /tasks | /tasks?query=Kitchen | /tasks?query=Kitchen | accessible (expected accessible) | accessible (expected accessible) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/recurring-tasks -->
| /recurring-tasks | /recurring-tasks | /recurring-tasks | accessible (expected accessible) | accessible (expected accessible) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/inspections -->
| /inspections | /inspections | /inspections | accessible (expected accessible) | accessible (expected accessible) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/work-orders -->
| /work-orders | /work-orders | /work-orders | accessible (expected accessible) | accessible (expected accessible) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/timeline -->
| /timeline | /timeline?query=Kitchen | /timeline?query=Kitchen | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/financial-timeline -->
| /financial-timeline | /financial-timeline?query=Central | /financial-timeline?query=Central | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/maintenance-timeline -->
| /maintenance-timeline | /maintenance-timeline?query=Kitchen | /maintenance-timeline?query=Kitchen | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/property-timeline -->
| /property-timeline | /property-timeline?propertyId=10000000-0000-0000-0000-000000000001 | /property-timeline?propertyId=10000000-0000-0000-0000-000000000001 | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/documents -->
| /documents | /documents?query=lease | /documents?query=lease | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/reports -->
| /reports | /reports | /reports/owner-activity?month=2026-08 | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked | 4/4 pass | redirect-normalized | None |
<!-- route-evidence:/reports/[reportKind] -->
| /reports/[reportKind] | /reports/unit-profit-loss?month=2026-07 | /reports/unit-profit-loss?month=2026-07 | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked | 4/4 pass | preserved | None |
<!-- route-evidence:/people-reports -->
| /people-reports | /people-reports?report=staff-access&archiveState=archived | /people | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | redirect only | 4/4 pass | redirect-normalized | None |
<!-- route-evidence:/settings -->
| /settings | /settings | /settings | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/settings/rent-policy -->
| /settings/rent-policy | /settings/rent-policy | /settings/rent-policy | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | populated, empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/users-roles -->
| /users-roles | /users-roles | /users-roles | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, error, permission-blocked, draft, saving, success | 4/4 pass | preserved | None |
<!-- route-evidence:/account -->
| /account | /account | /account | accessible (expected accessible) | accessible (expected accessible) | login-required (expected login-required) | loading, populated, error, permission-blocked | 4/4 pass | not-applicable | None |
<!-- route-evidence:/import -->
| /import | /import | /import | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/overview -->
| /overview | /overview | /overview | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked | 4/4 pass | not-applicable | None |
<!-- route-evidence:/overview/[view] -->
| /overview/[view] | /overview/attention?month=2026-07 | /overview/attention?month=2026-07 | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, error, permission-blocked | 4/4 pass | preserved | None |
<!-- route-evidence:/properties/[propertyId] -->
| /properties/[propertyId] | /properties/10000000-0000-0000-0000-000000000001 | /properties/10000000-0000-0000-0000-000000000001 | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/units/[unitId] -->
| /units/[unitId] | /units/20000000-0000-0000-0000-000000000001 | /units/20000000-0000-0000-0000-000000000001 | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/people/[personId] -->
| /people/[personId] | /people/80100000-0000-0000-0000-000000000001 | /people/80100000-0000-0000-0000-000000000001 | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, filtered-empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/ -->
| / | / | /workspace | redirected (expected redirected) | redirected (expected redirected) | accessible (expected accessible) | populated | 4/4 pass | not-applicable | None |
<!-- route-evidence:/request -->
| /request | /request?intent=demo | /request?intent=demo | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | draft, saving, error, success | 4/4 pass | preserved | Submissions are stored for follow-up; outbound email notification is not configured. |
<!-- route-evidence:/login -->
| /login | /login | /workspace | redirected (expected redirected) | redirected (expected redirected) | accessible (expected accessible) | draft, saving, error, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/forgot-password -->
| /forgot-password | /forgot-password | /forgot-password | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | draft, saving, success, error | 4/4 pass | not-applicable | None |
<!-- route-evidence:/update-password -->
| /update-password | /update-password | /update-password | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | draft, saving, success, error | 4/4 pass | not-applicable | A valid Supabase recovery session is required for a successful password update. |
<!-- route-evidence:/auth/complete -->
| /auth/complete | /auth/complete?next=%2Faccept-invite%3Finvitation%3D11111111-1111-4111-8111-111111111111 | /auth/complete?next=%2Faccept-invite%3Finvitation%3D11111111-1111-4111-8111-111111111111 | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | loading, error | 4/4 pass | preserved | A fresh Supabase implicit-flow email fragment is required for successful completion. |
<!-- route-evidence:/accept-invite -->
| /accept-invite | /accept-invite?invitation=11111111-1111-4111-8111-111111111111 | /accept-invite?invitation=11111111-1111-4111-8111-111111111111 | accessible (expected accessible) | accessible (expected accessible) | accessible (expected accessible) | draft, saving, success, error, permission-blocked | 4/4 pass | preserved | A valid matching invitation and Supabase-authenticated email session are required for acceptance. |
<!-- route-evidence:/signup -->
| /signup | /signup | /workspace | redirected (expected redirected) | redirected (expected redirected) | login-required (expected login-required) | redirect only | 4/4 pass | not-applicable | Anonymous requests land on login; already-authenticated sessions continue through the auth proxy to workspace. |
<!-- route-evidence:/setup -->
| /setup | /setup | /no-access | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | redirect only | 4/4 pass | not-applicable | The retired route redirects authenticated users to the no-access recovery page; anonymous users are intercepted by the auth proxy. |
<!-- route-evidence:/no-access -->
| /no-access | /no-access | /no-access | accessible (expected accessible) | accessible (expected accessible) | login-required (expected login-required) | permission-blocked | 4/4 pass | not-applicable | Unlinked-account browser presentation is covered by unit and state contracts; the retained local fixtures represent linked roles. |
<!-- route-evidence:/property-dashboard -->
| /property-dashboard | /property-dashboard?query=HOME&tag=late&tag=open | /overview?lens=records&query=HOME&tag=late&tag=open | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | redirect only | 4/4 pass | redirect-preserved | None |
<!-- route-evidence:/finance -->
| /finance | /finance | /finance | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/maintenance-dashboard -->
| /maintenance-dashboard | /maintenance-dashboard?query=HOME&tag=late&tag=open | /overview?lens=maintenance&query=HOME&tag=late&tag=open | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | redirect only | 4/4 pass | redirect-preserved | None |
<!-- route-evidence:/schedule -->
| /schedule | /schedule?query=HOME&tag=late&tag=open | /maintenance?view=calendar&query=HOME&tag=late&tag=open | redirected (expected redirected) | redirected (expected redirected) | login-required (expected login-required) | redirect only | 4/4 pass | redirect-preserved | None |
<!-- route-evidence:/team -->
| /team | /team?query=HOME&tag=late&tag=open | /staff?query=HOME&tag=late&tag=open | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | redirect only | 4/4 pass | redirect-preserved | None |
<!-- route-evidence:/balances -->
| /balances | /balances | /balances | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |
<!-- route-evidence:/properties/[propertyId]/account -->
| /properties/[propertyId]/account | /properties/10000000-0000-0000-0000-000000000001/account | /properties/10000000-0000-0000-0000-000000000001/account | permission-blocked (expected permission-blocked) | permission-blocked (expected permission-blocked) | login-required (expected login-required) | loading, populated, empty, error, permission-blocked, draft, saving, success | 4/4 pass | not-applicable | None |

## Cross-route workflow evidence

- Command search, focus trap, keyboard traversal, and property/unit/person result safety: `src/components/layout/workspace-command-palette.test.tsx`.
- Property filter, selected record, inspector, detail, and retained query behavior: `src/features/properties/components/property-screen.test.tsx` and the route matrix query checks.
- People lens aliases, person detail, and related leases: `src/features/people/components/people-screen.test.tsx` and `src/features/people/components/person-detail-screen.test.tsx`.
- Rent, expense, ledger totals and drilldowns: finance workspace component tests plus the populated browser captures.
- Maintenance list, board, calendar, checklist, and capability-correct actions: `src/features/maintenance/components/maintenance-workspace-ui.test.tsx` and manager/member role audits.
- Timeline scope routes and linked records: timeline route tests and the four timeline captures.
- Three required report tabs with PDF and Excel export: report screen tests and `/reports/unit-profit-loss` capture.
- Settings draft, discard, save, and error: settings workspace tests and shared workflow feedback contracts.
- Import preview create/update/skip consequences: import screen tests; browser capture remains read-only.

## Keyboard, zoom, and state evidence

- Native tab order, current navigation, command palette focus trap, drawer Escape/return, field error association, and live announcements are enforced by `src/lib/ui/accessibility-contract.test.tsx` and feature interaction tests.
- The saved manifest captures cover desktop (1440x900), laptop (1280x800), compact-desktop (1024x768) and phone (390x844); pass counts in the route matrix are derived from this runtime viewport list.
- 5/5 pass: keyboard traversal at a 720x450 CSS viewport equivalent to 1440x900 at 200%.
- 5/5 pass in a Chromium DPR 2 rendering session: 720x450 CSS viewport, 1440x900 screenshots, visible operational surfaces, and no document overflow. Artifacts: `artifacts/ui-redesign/zoom-200-20260804`. This validates actual 200%-scale rendering; the browser UI zoom control itself was not used.
- Loading, true empty, filtered empty, error/retry, permission blocked, draft, saving, and success evidence is mapped per route in the manifest and validated by `src/lib/ui/route-state-evidence.test.ts`.

## Final post-sweep checks

- The active local-navigation visibility correction passed the full Maintenance workflow smoke at desktop, laptop, compact-desktop, phone, and legacy phone widths. Artifacts: `artifacts/ui-redesign/maintenance-2026-08-04T12-05-40.070Z-smoke-p4280`.
- The Properties create/edit/photo workflow passed and restored the fixture to `CTR-RES-018 | Central Residence`.
- Reports, Team redirect handling, and property account access each passed four viewport/Axe captures plus manager, member, and anonymous role checks after the final harness correction. Artifacts: `ui-redesign-2026-08-04T12-30-36.892Z-axe-p47968`, `ui-redesign-2026-08-04T12-31-02.922Z-axe-p19392`, and `ui-redesign-2026-08-04T12-31-25.330Z-axe-p43396` under `artifacts/ui-redesign`.

## Known limitation

The retained browser fixtures cover linked admin, manager, and member accounts. Unlinked-account setup/no-access presentation is covered by auth and system-state contracts; no disposable unlinked browser account is retained. Owner: Product/QA. Follow-up: add an ephemeral unlinked fixture when the local auth harness supports automatic teardown.
