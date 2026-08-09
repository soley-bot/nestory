# IPS operational readiness progress

## Track 2.0 — ownership readiness prerequisite

- Status: approved by independent manual review on 2026-08-09.
- Outcome: commit `e64756e9251824b723716bb070623993eb896e05` establishes half-open ownership intervals, explicit dated shares, exact 100% roster validation, deterministic roster hashes, overlap protection, guarded importer preservation, Finance-readable remediation rows, and a read-only legacy preflight. It does not yet create opening-balance authority or alter financial projections.
- Evidence: focused ownership/import pgTAP passed 83/83; full pgTAP passed 1,103/1,103; readiness, parity, concurrency, and hosted-gate tooling passed 13/13; Vitest passed 1,312 tests with one intentional skip; demo tooling passed 29/29; database lint, TypeScript, ESLint, route coverage, UI copy, build, and migration portability passed.
- Browser evidence: not required for this explicit database prerequisite. The owner replacement/remediation action and form contracts passed focused tests; the complete authenticated Opening Owner Balance browser workflow is required before Track 2 is complete.
- Remaining limitations: approved ownership snapshots are not yet opening balances and do not affect Ledger, owner balances, withdrawals, reports, allocation, roll-forward, Owner Close, or Owner Statement. Hosted ownership preflight and remediation remain unexecuted pending explicit hosted approval.
- Next implementation task: Opening Owner Balance schema and checked workflow, beginning with request/entry authority and direct-write security.

## Release prerequisite — authenticated route discoverability

- Status: approved by independent manual review on 2026-08-09.
- Outcome: runtime/test commit `006e1641d9d4b447e0baf32844122422c474d133` inventories all 38 authenticated dashboard routes plus `/workspace`, fixes role/guard/navigation parity and finance dead ends, and adds shell/context-relative browser coverage. Evidence-only commit `ee38d94a299e300cc69a2c03f316a05bfc5e8bdc` contains the generated matrix and reports.
- Browser evidence: exact runtime commit `006e1641d9d4b447e0baf32844122422c474d133` passed five role session starts from `/workspace`, 66/66 visible-link journeys, 71/71 forbidden-global-link absence checks, four separate direct denials, and legacy role smoke 5/5. Independent final-HEAD production build and browser rerun also passed.
- Regression evidence: Vitest passed 1,316 tests with one existing skip; tooling passed 36/36; UI route coverage passed 47/47; the authenticated route verifier passed 38/38; focused reviewer checks passed Node 9/9 and Vitest 83/83; TypeScript, ESLint, dependency resolution, diff checks, and listener cleanup passed.
- Remaining limitations: capability-to-role sets are duplicated in the verifier and require future drift monitoring. Browser denial probes are representative, while all route-role denials are documented and statically checked. Hosted Supabase, Vercel, email, cron, real IPS data, and production recovery remain unverified and unchanged.
- Next implementation task: every Opening Owner Balance page and action must be reachable from the approved Finance/Settings navigation contract and completed through visible links; direct destination URLs will not count as acceptance evidence.
