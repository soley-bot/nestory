# Public landing and request flow

Verified on 2026-10-01 in an isolated local checkout. These are local previews, not production screenshots or a release confirmation. Before images use main `eddf073c`; after images use this branch, rebased onto main `1254e43b` (PR183).

## Changes

- Workspace and Operations scroll and receive keyboard focus after the menu finishes closing. Reopening, unmounting, or changing history cancels stale navigation. Repeat links avoid duplicate history entries. Cross-page section links and direct hashes receive focus too.
- Escape and Close preserve ordinary dialog focus restoration. Back to the hero returns focus to the menu button without overriding the browser's restored scroll position. The menu scrolls on short screens without overlapping the header.
- The landing page and request introduction use shorter, concrete copy. The dashboard preview is labeled as sample data. The phone request form starts within the first screen, instead of below a long introduction.
- Public forms retain entered details and the selected unit range after a rejected or interrupted submission. Invalid fields or the request error receive focus. Pending submissions are locked. Navigating between demo and information URLs selects the correct intent.
- The confirmation no longer claims a follow-up has been queued. Demo scheduling and account setup are explicitly separate. The existing validation, rate limiter, honeypot behavior, and database command are unchanged.

## Evidence

The earlier live audit reported a changed hash with the viewport left at the hero. That exact scroll failure did not reproduce in local development: the baseline scrolled to Workspace (`scrollY=1016`, section top `-16px`) but left focus on the hidden Open menu button. After the fix, focus is on the selected section. The existing reveal animation accounts for the 16px section offset.

Local verification passed:

- `npx vitest run src/features/marketing src/app/request/page.test.tsx`: 6 files, 36 tests.
- `npx tsc --noEmit` and `npm run lint`.
- Repository secret scan and `git diff --check`.
- Chromium at 1440×1000, 390×844, and 667×320: section viewport/focus, keyboard activation, Escape, repeated hash, Back/Forward, history while the menu is open, reduced motion, short-screen scrolling, and section links from the request page.
- Both request intents: native required validation, server field validation, retained text and unit range, storage failure without false confirmation, and intent changes through same-route navigation.

Submission checks used `landing-fixture@example.invalid` and an unconfigured local server. Accepted/pending confirmation states and database responses were tested with mocked actions/RPC fixtures. No real leads or customer records were submitted. Authenticated shared components, database/security configuration, and migrations were not modified.

The repo-wide `test:ui-copy` check has two pre-existing failures, verified again on main `bd49dc1b` and left unchanged for the direction worker:

- `src/features/leases/actions.ts:1341` matches "Owner payment": `A related expense or owner payment has already used this rent. Review those linked transactions before saving. Nothing was changed.`
- `src/features/reports/data/report-export-parity.test.ts:71` matches "Opening authority" in the test title: `shows unavailable opening authority rather than a fabricated zero or final balance`.

Local development also reported blocked Next devtools styles and used fallback fonts because Google Fonts was unavailable; these captures do not establish production console or font behavior.

## Follow-up internal review

The branch was refreshed onto main `37571680`, including PR185 and PR187. Review reproduced a connection failure that threw out of the action and unmounted the form, losing entered details. The public form now catches that failure and displays "Request not confirmed", preserving the details for a retry without claiming whether the server saved the request. A regression test first failed on the original behavior and now passes, including a successful mocked retry. The pending test now also attempts a repeated submission and checks that only one action is called.

Chromium checks for both request intents interrupted POST requests before they reached the server, confirmed retained text and unit range plus error focus, then retried against the unconfigured local server. No customer records were written. The neutral confirmation also omits the contact promise because the existing rate limiter uses that same response for limited requests. Rate limiting, honeypot behavior, validation, and database commands remain unchanged. The original before/after images remain representative of the initial landing and request screens; this review changes request error handling and confirmation text.

## Before and after

| View | Before: local main | After: local branch |
| --- | --- | --- |
| Landing, desktop | ![Before landing desktop](../../artifacts/public-entry-flow/before-landing-desktop.png) | ![After landing desktop](../../artifacts/public-entry-flow/after-landing-desktop.png) |
| Landing, phone | ![Before landing phone](../../artifacts/public-entry-flow/before-landing-phone.png) | ![After landing phone](../../artifacts/public-entry-flow/after-landing-phone.png) |
| Request, desktop | ![Before request desktop](../../artifacts/public-entry-flow/before-request-desktop.png) | ![After request desktop](../../artifacts/public-entry-flow/after-request-desktop.png) |
| Request, phone | ![Before request phone](../../artifacts/public-entry-flow/before-request-phone.png) | ![After request phone](../../artifacts/public-entry-flow/after-request-phone.png) |

[Workspace after navigation](../../artifacts/public-entry-flow/after-workspace-navigation.png) · [Short-screen menu scrolled to its final link](../../artifacts/public-entry-flow/after-menu-short-screen.png)
