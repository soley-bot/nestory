# Release Consolidation Verification - 2026-07-24

This artifact records Prompt 6 verification on
`codex/release-consolidation`, based on
`4fdbbc16cd49c246fe33c8bc816e90fda9c3f63d`. It is local fixture evidence,
not production certification.

## People report consolidation

The selected architecture is a separate central trusted-report kind,
`people-readiness`, at `/reports/people-readiness`. Person rows are not mixed
into property/unit Record Readiness. The report reuses the People summary and
readiness boundary, pages through all matching People records, obtains Staff
access state from the organization-scoped Workspace Access loader, and uses the
generic Reports CSV/PDF endpoints.

| View | Included records | Readiness and context | Exact actions and sources |
| --- | --- | --- | --- |
| Relationship | All People in active, archived, or all-record scope | Contact, active role, evidence, linked lease/ownership/vendor context | Person detail plus exact linked lease, property, and vendor-profile sources |
| Tenant | Active Tenant-role People in the selected record scope | Contact and active-lease readiness | Person detail, exact lease sources, and the existing People next action |
| Owner | Active Owner-role People in the selected record scope | Contact and ownership/property readiness | Person detail, exact property sources, and the existing People next action |
| Vendor | Active Vendor-role People in the selected record scope | Contact and vendor-profile readiness | Person detail, vendor-profile source, and the existing People next action |
| Staff | Active Staff-role People in the selected record scope | No access, pending, failed, expired, or active access with level/scope | Exact Person detail and Workspace Access grant/review/retry/manage action |

All five views use the columns Readiness, Roles, Contact, Linked context,
Evidence, and Next action. They retain visible-row, missing-contact, no-role,
and evidence-gap metrics; direct record navigation; traceable source IDs and
links; clear empty states; Admin-only page/export authorization; formula-safe
CSV; PDF; and deterministic
`people-<view>-current-<archive-state>.<csv|pdf>` filenames. The screen preview
uses the shared 75-row report preview limit while CSV/PDF exports load all
matching pages. This deliberately removes the former 100-row export cap.

The old bookmark is retained only as a tested redirect that maps legacy report
and archive query intent into the bounded central filters. The dedicated
People-report APIs and duplicate loader/page UI are removed.

## Local verification results

- Focused consolidation suite: 8 files, 42 tests passed.
- Full Vitest suite: 150 files, 1,154 tests passed.
- ESLint: passed with no warnings.
- TypeScript: `npx tsc --noEmit` passed.
- Next.js production build: passed against the local Supabase fixture.
- UI copy policy: passed with zero prohibited narration occurrences.
- Route inventory: 53/53 page routes covered.
- Local database reset: all migrations and seed completed.
- Database lint: no schema errors.
- Generated database types: normalized content matches `HEAD`; no generated
  type drift.
- Full pgTAP: 16 files, 471 assertions passed.
- Read-only browser matrix: 159 Admin route/viewport captures and 159
  Manager/Member/anonymous access checks matched the manifest at desktop,
  compact desktop, and phone sizes.
- Central Staff Access browser check: 5 organization-scoped rows rendered with
  exact Person and Workspace Access links. Generic CSV and PDF returned 200,
  valid content, and deterministic active-scope filenames. The compatibility
  bookmark reached the bounded central destination.

## Cross-domain result

| Workflow | Result |
| --- | --- |
| Staff and Workspace Access | Access state, role/scope boundaries, and SQL acceptance contracts pass automated tests. The real new-invite password lifecycle is blocked as described below and was not claimed as passed. |
| Role-specific People | Role filtering, People detail, handoff links, multi-role summaries, active selection rules, and archived history are covered by application tests and the route matrix. No separate mutable end-to-end script exists for every creation path. |
| Lease, rent, receipt, and allocation | Application tests and settlement/deposit pgTAP contracts pass, including exact IDs, allocation, reversal, cash reporting, and payer integrity. No new browser mutation was introduced by this branch. |
| Vendor bill and payment | Expense/payment application tests and paid-basis pgTAP contracts pass, including active Vendor selection and settlement activity. No new browser mutation was introduced by this branch. |
| Petty cash | Auditability, post/void, ledger linkage, and rollover database contracts pass. Physical cash counting and variance resolution are not implemented; rollover derives from calculated closing cash. |
| Maintenance | Role workflow, member execution, review/reopen, actual-cost, and Admin direct-ledger contracts pass. Prefilled vendor-bill/petty-cash handoff, reciprocal links, duplicate prevention, and void recovery are not implemented. |
| Activity and Timeline | Exact organization-scoped source IDs and curated record links remain covered by application/database tests and the route matrix. |
| Reports | Catalog destinations, People Readiness, Record Readiness, Owner Statement, generic CSV/PDF, print controls, source links, filters, malformed scope, empty, and blocked states pass application and browser checks. |

## Blocked gates and limitations

1. **Invitation credential lifecycle - external release blocker.** A
   brand-new invite can accept through a magic-link session without being
   offered password creation and then cannot password-sign-in after logout.
   This branch intentionally contains no auth, invitation, password, login,
   recovery, or credential-proof implementation changes.
2. **Full axe gate - blocked outside branch scope.** The full run completed but
   reported nine color-contrast findings: the same auth hero-text finding on
   forgot-password, update-password, and accept-invite at each of three
   viewports. The changed People report and compatibility redirect had no
   serious/critical axe finding.
3. **Mutable property smoke - stale harness.** The script waits for a
   `Preview <property>` card button, while the implemented card action is
   `Open <property>`. It stopped before its rename mutation.
4. **Mutable maintenance-mobile smoke - stale harness.** The script waits for
   a dialog whose accessible name ends in `Preview`; that preview contract is
   no longer present. It stopped before the intended workflow assertions.
5. **Maintenance-to-Finance and physical petty-cash reconciliation** remain
   unsupported as detailed in the cross-domain table. They were not fabricated
   as passing workflows.

## Draft and merge gate

The Prompt 6 pull request must remain draft and is not merge-ready. Before it
can be promoted:

1. Merge the focused invitation credential-lifecycle fix into `main`.
2. Rebase this branch or merge the updated `main` into it.
3. Rerun invitation acceptance -> password creation -> logout -> password
   sign-in successfully.
4. Rerun the affected full application and database suites.
5. Resolve or explicitly re-scope the failed auth axe gate and stale mutable
   property/maintenance smoke harnesses.
6. Verify the branch preview deployment. This occurs after the branch is
   pushed and is reported in the draft pull request and final handoff.

No database migration was added by this consolidation. Organization scope,
RLS, checked RPCs, accounting posting, locks, reversals, and generated database
types are unchanged.
