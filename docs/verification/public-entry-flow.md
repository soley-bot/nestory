# Public landing and request flow

Refreshed on 2026-10-02 in an isolated local checkout. These are local previews, not production screenshots or release confirmation. Before images retain the original main `eddf073c` baseline; after images were recaptured with the refreshed branch. The separate full-page redesign remains a concept awaiting direction approval.

## Changes

- Workspace and Operations scroll immediately and receive keyboard focus after the menu closes. Reopening, unmounting, or changing history cancels stale navigation. Repeated links avoid duplicate history entries. Cross-page links and direct hashes receive focus too.
- Escape and Close restore focus to the menu button. Back to the hero restores focus without overriding native scroll restoration. The menu scrolls on short screens so its final link remains reachable.
- The landing page and request introduction use shorter copy and clear actions. The dashboard is labeled as sample data. The phone request form starts within the first screen.
- Public forms retain text and the selected unit range after rejected or interrupted requests. Invalid fields or the request error receive focus. Pending submissions are locked. Same-route demo and information links select the correct intent.
- Confirmation does not claim a follow-up was queued. Demo scheduling and account setup are separate. Existing validation, rate limiting, honeypot behavior, and the database command are unchanged.

## Verification

The October 1 audit reproduced the original failure on main `9e17336a`: Workspace changed the hash while leaving the viewport at `scrollY=0` and focus on Open menu. PR190 moved both viewport and focus to the section on desktop and phone.

The October 2 refresh found a history race in animated section scrolling. Pressing Back 100, 200, or 400 ms after the hash changed could leave the viewport hundreds of pixels down the page. Section links now scroll with explicit `behavior: "instant"`, and the history handler no longer cancels native restoration. At the same three timings, Chromium returned to `scrollY=0` with focus on Open menu. The two section regression tests failed before this change and passed afterward.

Validation commands:

- `npx vitest run src/features/marketing src/app/request/page.test.tsx src/components/ui/select-control.test.tsx`: 7 files, 46 tests.
- `npx tsc --noEmit` and `npm run lint`.
- `npm run security:secrets`, `npm run test:ui-copy`, and `git diff --check`. The earlier repository copy failures have been fixed on main.

Chromium checks covered 1440x1000, 390x844, and 667x320:

- Section viewport and focus, keyboard activation, Escape and Close, repeated hash, native Back/Forward, Back and reopening during dismissal, reduced motion, short-screen menu scrolling, cross-page section links, and direct hashes.
- Both request intents: native required validation, pending fieldset/select locking, duplicate-submit suppression, retained text and unit range after connection failure, focused errors, interrupted retry, no false confirmation, and same-route intent changes. Server validation and accepted/error responses also have mocked action/RPC tests.

All browser form POSTs were intercepted before reaching the server. Inputs used `landing-fixture@example.invalid`; no leads or customer records were written. Independent internal source review found no actionable issues, including after the history fix. The public preview inherits main's narrow-screen dashboard controls and shared select fixes; this PR does not modify authenticated shared components, auth/RLS, migrations, or security settings.

## Before and after

Before images use the original local main baseline. After images were recaptured on October 2 with the immediate-scroll fix. Captures wait for reveal animations and omit the local Next.js development overlay. The phone sample dashboard now includes main's stacked property/month controls. These captures do not establish production console or font behavior.

| View | Before: local main | After: refreshed local branch |
| --- | --- | --- |
| Landing, desktop | ![Before landing desktop](../../artifacts/public-entry-flow/before-landing-desktop.png) | ![After landing desktop](../../artifacts/public-entry-flow/after-landing-desktop.png) |
| Landing, phone | ![Before landing phone](../../artifacts/public-entry-flow/before-landing-phone.png) | ![After landing phone](../../artifacts/public-entry-flow/after-landing-phone.png) |
| Request, desktop | ![Before request desktop](../../artifacts/public-entry-flow/before-request-desktop.png) | ![After request desktop](../../artifacts/public-entry-flow/after-request-desktop.png) |
| Request, phone | ![Before request phone](../../artifacts/public-entry-flow/before-request-phone.png) | ![After request phone](../../artifacts/public-entry-flow/after-request-phone.png) |

[Workspace after navigation](../../artifacts/public-entry-flow/after-workspace-navigation.png) | [Phone sample dashboard](../../artifacts/public-entry-flow/after-workspace-phone.png) | [Short-screen menu at its final link](../../artifacts/public-entry-flow/after-menu-short-screen.png)
