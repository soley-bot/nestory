# Track 2.4 owner-opening fixture and authenticated acceptance

## Verdict

The independent review of commit `8614c7e3cd2aff3c2c8d47c97c27159dd76b48e6` found two Major and one Minor correction. The coordinated local correction batch is verified and ready for independent re-review. Hosted and production readiness remain unverified.

## Deterministic fixture

The local-only baseline refuses a non-local JWT secret and retains the existing transaction boundary. Foundational people, property, membership, and the explicit effective-dated `100.000%` property-owner assignment are authored directly. Every opening request, review, rejection, resubmission, correction, reversal, and replacement is created through the checked public RPCs under the real fixed-role actors.

Central Residence reconciles to:

| Component | Current authority | Required lineage |
| --- | ---: | --- |
| IPS-held owner cash | `1250.00` | approved initial |
| Owner due to IPS | `0.00` | approved initial, rejected correction, linked approved resubmission, literal zero reversal and replacement |
| IPS due to owner | `240.50` | rejected initial and linked approved resubmission |
| Security deposit custody | `800.00` | approved initial plus a correction awaiting independent review |

All three authored fixture ownership assignments now pin `started_on` to `2024-01-01`. Central Residence's full canonical roster input is checked as property-owner ID, owner-person ID, exact `100.000` share, start date, and null end date; its SHA-256 is `79fda8768211db83193d4eb3f8549f959b8331a729eaf83aa681add682d94262`. The normalized semantic report uses `CURRENT_MONTH` and deterministic natural request/entry keys while retaining that roster identity, and the runtime report retains generated UUIDs and exact stored hashes. Every runtime request and transition hash is recomputed from the canonical public-RPC payload, then matched exactly across the request, idempotency, and activity rows. The corrected semantic SHA-256 is `1f28cceda852baeebe7878edf71ec09375ebb7d2958e572cc047f73b955fc4b0`. The rollover contract rebuilds representative full in-memory reports for consecutive months and recomputes the canonical roster input, so an ownership start-date/hash drift fails while the legitimate month rollover remains stable. Any request, entry, or authority date outside the actual current business month also fails validation.

## Integrity contract

- Eight requests, six entries, and exactly four known authorities.
- Five approved requests, two rejected lineage predecessors, and one submitted correction.
- Fifteen completed idempotency records and fifteen checked-RPC activity records with exact actors, actions, natural request identities, canonical payload hashes, and matching activity hashes.
- Every reviewed request has a distinct reviewer; exact replay returns the original result and same-key changed payload is rejected.
- Every request and entry is compared to the one exact property-owner ID, `100.000%` share, roster hash, natural key, and current-month date; the roster hash is independently recomputed from the full pinned canonical input, and every request also carries its exact lowercase evidence and canonical payload hashes.
- Evidence is reference-only: zero owner-opening document rows and zero physical owner-opening Storage objects.
- Finance RLS/role rules hold; Operations roles cannot read or mutate owner-opening authority, and a submit-capable reviewer cannot self-review.
- Deliberate request, entry, component, ownership, valid-but-wrong UUID/roster/payload/activity hash, date, evidence, document, predecessor, correction-target, zero-leg, transition-provenance, and duplicate-key mutations are detected.

## Authenticated end-to-end acceptance

Before its first reset, the browser harness resolves one running database container, verifies it against `supabase/config.toml`, and fails closed when an explicit `SUPABASE_DB_CONTAINER` is unavailable or belongs to another local project. That verified target is passed to both baseline resets and reused directly for every authoritative assertion and final cleanup. Each actor starts at `/workspace`, clicks `Open workspace`, and uses the visible Finance → Owner balances link; no direct destination navigation is used.

On Riverside Shophouse, the real sequence passes:

1. Finance Member submits an authoritative `0.00` opening with reference-only evidence.
2. Independent Super Admin approves it.
3. Finance Manager requests a real `0.00` correction against the current entry.
4. Super Admin rejects the correction with a reason.
5. Finance Manager uses the linked resubmit action; amount, reason, and source are recovered and the exact fingerprint is supplied.
6. Super Admin approves; the database contains the opening, zero reversal, and zero replacement and exposes known `0.00` authority.

After each UI action, the page-level live status is visible and owns focus, and an authoritative database assertion proves the expected phase. Operations Manager and Operations Member expose no Owner balances link. Final cleanup restores the manifest fixture and verifies no owner-opening document or Storage artifact remains.

Before that mutation journey, Finance Manager also opens the equal-timestamp Central Residence fixture. The unique submitted deposit correction is displayed as Current with no second correction action, and the approved zero-correction resubmission is displayed ahead of its rejected predecessor. Current workflow authority is therefore derived from submitted/entry/leaf lineage rather than timestamp or random UUID order.

## Verification

- Correction-focused pgTAP: 36/36 assertions passed after a clean reset/load, including the three pinned ownership start dates and the expanded exact-identity/hash mutation oracle.
- Hermetic Node evidence: owner-opening contract 5/5 and loader selector 4/4 passed; the complete `test:demo-tools` command passed 44/44 with `SUPABASE_DB_CONTAINER` deliberately set to an unavailable name and `DOCKER_HOST` pointed at an unreachable endpoint, proving the application CI command has no local-database prerequisite.
- Fixture reconciliation: the clean fixture load and live smoke passed with roster hash `79fda8768211db83193d4eb3f8549f959b8331a729eaf83aa681add682d94262` and semantic hash `1f28cceda852baeebe7878edf71ec09375ebb7d2958e572cc047f73b955fc4b0`.
- Consolidated authenticated browser acceptance: passed on an exact-worktree app against the one verified `supabase_db_nestory` target, including DB phase assertions, focus/status, role denial, and cleanup. A deliberately unavailable explicit target separately failed before reset.
- Pre-correction full-matrix database evidence at reviewed head `8614c7e3`: reset/load, error-level lint and advisors with no findings, all 38 pgTAP files plus the final focused oracle assertion (1,396 assertions in the final combined set), owner workflow concurrency (4/4), and document/Storage lifecycle concurrency (6/6) passed.
- Pre-correction full-matrix application evidence at reviewed head `8614c7e3`: TypeScript, ESLint, Vitest (1,424 passed and one existing intentional skip), demo tooling (42/42), 47/47 page-route coverage, UI copy, production build, 38/38 static authenticated-route discovery, five fixture role journeys, and 66/66 visible-link journeys plus four direct denials passed. The expensive full matrix was not rerun or claimed for this correction batch.
- Exact changed-surface accessibility: the production `/balances` axe run passed four route/viewport pairs and all five role checks. The authenticated owner-opening acceptance separately passed live-status focus after every action and both denied-role navigation checks.

## Existing cross-module accessibility residual

The single full legacy `npm run test:ui-a11y` command remains non-green with 98 findings outside `/balances` and outside the owner-opening flow. This is recorded rather than expanded into unrelated Track 2.4 remediation:

- 92 color-contrast route/viewport findings across 27 routes: `/accept-invite` (3), `/financial-timeline` (4), `/forgot-password` (3), `/inspections` (4), `/ledger` (4), Maintenance board (4), Maintenance list (4), `/maintenance-timeline` (4), `/overview` (1), `/owners` (3), `/people` (3), `/properties` (4), `/property-timeline` (4), `/recurring-tasks` (4), `/rent-income` (1), `/settings` (4), `/settings/rent-policy` (4), `/staff` (3), `/tasks` (4), `/tenants` (3), `/timeline` (4), unit detail (3), `/units` (3), `/update-password` (3), `/users-roles` (4), `/vendors` (3), and `/work-orders` (4). Timeline-family targets are existing badge styles (`.group/badge` or destructive badges), not the new Owner balances activity link.
- Two `scrollable-region-focusable` findings are both the existing `div[data-slot="table-container"]` on `/properties/10000000-0000-0000-0000-000000000001/account`, at compact-desktop and phone viewports.
- Four `/users-roles` page-error findings are the same minified React error `#419`, once at each viewport.

The exact corrected-checkout residual artifact is local and ignored under `artifacts/ui-redesign/ui-redesign-2026-08-10T04-11-21.310Z-axe-p27276/summary.json`. It again contains 92 color-contrast route/viewport findings, the same two property-account scroller findings, and four `/users-roles` page errors, with zero `/balances` axe or page-error findings. It belongs to the later program-wide accessibility/release milestone. No full-gate pass is claimed for it.

## Boundary

No hosted Supabase, Vercel, email, real IPS data, push, merge, deploy, Track 3, projection, owner allocation, Owner Close, or Owner Statement mutation was performed. Unknown and authoritative zero remain distinct.
