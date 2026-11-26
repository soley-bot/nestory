# Nestory performance review — 26 November 2026

Three application bottlenecks were repaired on `codex/performance-review-20261126`, based on fetched `origin/main` at `2f24d844226399762545765e6b1e188b3886088b`. This records the preparation-stage measurements and checks; no deployment or database migration was performed during that review.

Before release, current main `430fa34cec3f158505925d70d5289f907f118e01` was merged into this branch without conflicts. This preserves PR #299's search/filter polish and PR #300's receipt-optional property expenses. PR #299 already contains the identical Next.js 16.4.6 dependency update, so those package changes are not an additional difference in the performance PR. Subsequent protected-release and production acceptance evidence is recorded separately from this original benchmark record.

Final build verification also exposed advisories against the existing Next.js 16.4.2 pin. Next.js, its ESLint configuration and the scoped ESLint override are updated together to 16.4.6, a patch within the same release line. The explicit-directory ESLint adapter remains in use and its version contract is updated. The official [November security release](https://nextjs.org/blog/november-2026-security-release) identifies patched 16.4 releases; [16.4.6](https://github.com/vercel/next.js/releases/tag/v16.4.6) also contains bug fixes for response compression and development garbage collection. Only 12 Next.js family package versions changed in the lockfile. The dependency audit and final production build pass.

## Measured improvements

| Workload | Before | After | Verification |
| --- | ---: | ---: | --- |
| People attention indicator, 205 active people | 10 requests across 8 tables | 6 requests across 4 tables | Same displayed contact, role and vendor queues |
| Workspace search, 25 properties, 100 units and 100 records in each related category | 32 requests | 28 requests | Identical ranked results and partial/limited flags |
| Monthly rent readiness, 5,000 leases and 20,000 historical terms | 2,887.72 ms median | 98.92 ms median | Identical 5,000 report rows |

These are synthetic local measurements on Node 24.8.0 with in-memory database response fixtures. Request counts represent calls issued by the actual loaders, not hosted database execution times. Rent timing uses five measured runs after one warm-up, alternating before/after order, without access-count instrumentation. It measures processing with empty invoice sources, not end-to-end report navigation. No concurrent build or lint job ran during the measured comparison. The timings are not production latency guarantees.

The comparison harness and JSON results are retained locally under `.codex-artifacts/performance/`. Reproduce from this checkout with `npx vitest run .codex-artifacts/performance/comparison.test.mjs --maxWorkers=1`. The baseline modules were captured before edits from the SHA above. An earlier instrumented timing experiment exceeded its 60-second test limit; its timings are excluded from the table. The final uninstrumented comparison passed all three equivalence checks.

## Changes and preserved behavior

1. **People attention data:** [people-insights.ts](../../src/features/people/data/people-insights.ts) now loads only people, active roles, contacts and vendor profiles. The header never displayed the previously computed lease, ownership or document statistics. Full report builders retain those calculations. Only the three displayed queues are serialized to the client. Counted, stably ordered reads continue across smaller API pages and reject changing counts instead of silently presenting partial totals. Organization, archive and role filters remain in place.
2. **Workspace search:** [workspace-search.ts](../../src/features/workspace-search/data/workspace-search.ts) shares identical in-flight related-record reads within one search request, starts independent direct/context searches together, and reuses the existing property/unit index for result text. Promise caches never cross requests or users. Existing batch boundaries, permissions, assignment/branch restrictions, ranking, partial failures and preview limits remain covered by tests.
3. **Monthly rent readiness:** [monthly-rent-completeness.ts](../../src/features/reports/data/monthly-rent-completeness.ts) indexes term history by lease and ownership by property once, replacing repeated scans of complete collections. Renewals, historical ended leases, zero-rent periods, owner/date scope, duplicate invoices and fail-closed source checks retain their previous rules. Inputs are not mutated. A structural regression test exercises 2,000 leases with 8,000 terms without relying on a flaky elapsed-time threshold.
4. **Maintenance retry reliability:** Wider UI verification exposed a pre-existing submit-lock problem in [maintenance-screen.tsx](../../src/features/maintenance/components/maintenance-screen.tsx). A fast validation response could leave retry blocked when the pending flag did not produce a separate render. The lock now also reacts to completed action state, while retaining the pending-save guard. The existing actual-cost retention/retry regression failed before this fix and passes afterward, together with the pending duplicate-submit test. No server mutation or financial authorization logic changed.

## Remaining performance work

The review sampled the dashboard shell, authorization/read boundaries, overview, portfolio registers and details, People, finance/lease loaders, maintenance, search, photos and report processing. It is not an exhaustive audit of every route or query.

| Priority | Remaining finding | Evidence and next verification |
| --- | --- | --- |
| High at large portfolio sizes | Search still reads the complete visible property/unit/owner vocabulary. The patch removes duplicate work but does not bound vocabulary size. | [portfolio.server.ts](../../src/lib/search/portfolio.server.ts). A server-side matching design needs parity tests for owner names, punctuation aliases, multiword queries, unit-specific results and RLS. |
| High for long financial histories | Property and unit detail summaries still download complete scoped ledger histories. | `readPropertyDetail` in [properties.ts](../../src/features/properties/data/properties.ts) and `readUnitDetail` in [units.ts](../../src/features/units/data/units.ts). Profile these with representative histories before replacing totals with a canonical authorized aggregate. Preserve generation/revision checks and ledger predicates. |
| Medium for photo-heavy portfolios | Thumbnail readers fetch every photo in selected scopes before choosing the first per property/unit. | `getCompleteThumbnailRows` in [photos.ts](../../src/features/photos/data/photos.ts). Measure photo row volume and validate a first-per-scope query preserving cover and date ordering. |
| Needs production evidence | Browser LCP/INP, authenticated navigation p50/p95, concurrent traffic, and bundle transfer costs were not measured. | The existing workspace timing logger covers overview, leases and finance. The last 30 minutes of production logs contained no matching timing samples during this review. |

## Read-only database findings

The connected `nestory` project was verified healthy. Performance advisors on 26 November reported 393 unindexed foreign keys, 190 unused indexes, 11 multiple-permissive-policy findings, one duplicate index and one authentication connection-allocation advisory. These are advisory observations, not measured slow-query findings or instructions to add/drop every listed index.

The duplicate is on `public.leases`: `leases_org_primary_tenant_person_id_idx` and `leases_primary_tenant_person_fk_idx`. Both definitions also remain in the source baseline. Any removal needs a forward migration, catalog equivalence/dependency checks, local database validation and the protected production release workflow. No index or policy changes were made.

Reference: [foreign-key indexes](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index), [permissive policies](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies), [duplicate indexes](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index), [production connection guidance](https://supabase.com/docs/guides/deployment/going-into-prod). A compact advisor snapshot is retained with the local benchmark evidence.

## Validation and preservation

- Focused behavior suite: **135 tests passed across 14 files**, including People UI/streaming, search permissions/ranking/failure behavior, complete reads, rent history and scalability.
- Full unit tier after the framework patch: **3,939 passed, 6 skipped** across 356 passing files and one skipped file.
- Full UI tier: 1,850 passed and 20 failed across seven files while running alongside the Windows contract checks. A single-worker rerun of those seven files passed **408 of 409** tests without further performance changes. The remaining maintenance retry failure led to the lock fix above; its complete file then passed **92 of 92** tests. Every initially failing UI case now passes. The full 157-file UI command was not rerun after this targeted repair. JSON retry reports are retained with the local evidence.
- Before/after comparison: **3 passed** with identical displayed outputs.
- TypeScript: standalone check and final production-build check passed. The explicit Supabase result typing was corrected and the affected People suite rerun: 27 passed.
- Repository lint: zero errors; 13 pre-existing unused-variable warnings in unchanged backup scripts. Generated local benchmark files were excluded from lint. The files adjusted afterward for query typing and maintenance retry behavior also pass focused lint.
- Production build: passed on Next.js 16.4.6, including type checking and all route generation. The existing Sentry configuration import emits a nonblocking deprecation warning.
- Built-app runtime smoke: login returned HTTP 200 with a rendered form; unauthenticated `/overview` returned HTTP 307 to `/login`. The bounded localhost server shut down after verification. This verifies startup and the authentication boundary, not authenticated production navigation performance.
- Dependency policy: zero production vulnerabilities; zero high/critical vulnerabilities across the complete tree. Ten lower-severity development-tree findings remain within the existing policy. A clean `npm ci` also passes.
- Native pre-hydration auth-form compatibility: passed against the patched Next.js renderer.
- Repository contracts: the primary phase passed, then the backup phase reported 666 passed, two skipped and one public-certificate hash failure. Windows `core.autocrlf=true` had converted that unchanged certificate to CRLF. Its normalized hash exactly matches the pinned Git bytes. An explicit LF rule in `.gitattributes` preserves those bytes; all **112 tests** in the affected contract file now pass, including native Windows journal checks. The certificate content and pinned hash are unchanged.
- Repository secret scan and `git diff --check`: passed.
- No hosted writes, customer-data changes, migration edits, push, merge or deployment.
- The unpublished `.gitignore`, `AGENTS.md`, `.codex/config.toml` and model-adoption runbook in `D:\nestory` were backed up and fingerprinted before work. Their hashes and the original dirty Git status were rechecked unchanged. All implementation is in the isolated checkout.
- Active session metadata reports `gpt-6-astra` with `max` effort. This client exposes no active-session model switch; no model comparison or automatic switch is claimed.

The initial jsdom invocation through the C: checkout junction failed to resolve its test file. Using the checkout's physical D: path resolved it; the complete focused suite above passed there. Production build validation uses local placeholder Supabase settings and does not authenticate to the hosted database.

The incremental npm upgrade initially rewrote the existing local `fast-glob` adapter link to a nonexistent directory inside the Next.js plugin. The lockfile retains its original repository-relative `tools/next-eslint-glob` target. A clean install, `npm ls` dependency-edge validation and the adapter's Next.js compatibility contracts confirm the corrected resolution.
