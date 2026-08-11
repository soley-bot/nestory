# Track 9 progress

- Outcome: Super Admin stages, corrects, reconciles, freezes, and replays one
  redacted IPS cutover manifest with exact import counts and tenant/owner
  opening authority.
- Status: implementation, focused gates, two rehearsals, browser acceptance,
  the single full matrix, and one review correction batch are complete.
  Focused re-review is pending.
- Local authority: synthetic `2026-09-01`, `REDACTED-IPS-DATA-OWNER`; no hosted
  or real IPS authority was chosen.
- RED: missing four authority tables/five RPCs, verifier, app modules, fixture,
  and race harness; later REDs covered manifest completeness, duplicate source
  keys, exact counts, persisted mismatch details, browser server-action runtime,
  and idempotency-key UX.
- Initial GREEN: pgTAP 45/45, cutover concurrency 3/3, focused import/cutover
  app 24/24, final action-key/UI subset 13/13, manifest 2/2, two identical
  rehearsals, and one complete role/browser flow.
- Full matrix: DB 1752/1752; app 1493 pass + 1 skip; tools 53/53; reset,
  fixture, lint/advisors, concurrency, smokes, TypeScript, ESLint, build,
  routes/copy/roles, and changed-route accessibility green.
- Residual: unchanged 98-item accessibility backlog and an unrelated long
  discoverability smoke flake; `/import` is clean at four viewports.
- Review: 0 Critical / 4 Important. RED reproduced global reverse month locks,
  unsupported/lost currency, multi-entity verifier rejection, and invalid
  signed-exception time. GREEN: pgTAP 55/55, cutover 5/5, rent 4/4, verifier
  5/5, app 13/13, clean reset/types/lint/advisors/build, and two identical
  currency-bound rehearsals.
- Gate: do not start the next milestone or hosted activation. One focused
  independent Track 9 re-review is next.
