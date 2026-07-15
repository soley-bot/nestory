# Task 7 report: scoped global workspace search

## RED evidence

- Added the data-boundary and route suites before production code.
- `npm test -- src/features/workspace-search/data/workspace-search.test.ts src/app/api/workspace-search/route.test.ts` failed because both expected modules were absent. An initial trailing-backslash test literal had a parse typo; it was corrected before implementation and RED was rerun, still failing only on the missing feature and route.

## Implementation and decisions

- Added a request-time `GET /api/workspace-search` boundary that returns private, no-store responses and derives user, organization, role, branch, and person only from the signed-in server context. Unauthenticated callers receive JSON 401; signed-in callers without a workspace membership receive JSON 403.
- Admins can search active properties, units, people, leases, tasks/cases, documents, and admin navigation actions. Managers search branch-scoped tasks plus Cases/Tasks actions. Members search only branch-and-assignee-scoped tasks plus the Tasks action; an unlinked member performs no entity query.
- Every entity query has an explicit `organization_id` predicate, an active-record predicate, a per-field bound of 20, and remains subject to the signed-in client's RLS. The implementation performs a fixed set of parallel queries and no N+1 lookups.
- Query text is made well-formed, canonically normalized with NFC, trimmed, whitespace-normalized, capped at 120 complete Unicode code points, and requires at least two code points. `%`, `_`, and backslash are escaped in individual `.ilike()` calls; no user input is interpolated into PostgREST `.or()` grammar.
- Results expose only id, kind, label, optional display metadata, and an existing route href. Ranking is exact/prefix/word/contains, deterministic by kind/label/id, deduplicated, and capped at 20 overall. Role-visible action synonyms are ranked using hidden server-only search text and are not added to the response payload.
- Checked Supabase CLI 2.108.0 version and migration help, then created `20260715155241_workspace_search_indexes.sql` with `npx supabase migration new workspace_search_indexes`. It enables no extension and adds only active-record GIN trigram indexes for task title/description, document file name, and lease tenant name.
- No hosted Supabase command or service-role client was used.

## Files

- `src/features/workspace-search/workspace-search.types.ts`
- `src/features/workspace-search/workspace-search.scopes.ts`
- `src/features/workspace-search/data/workspace-search.ts`
- `src/features/workspace-search/data/workspace-search.test.ts`
- `src/app/api/workspace-search/route.ts`
- `src/app/api/workspace-search/route.test.ts`
- `supabase/migrations/20260715155241_workspace_search_indexes.sql`

## Verification

- Focused RED: FAIL on missing feature and route, as expected.
- Focused final: PASS, 2 files / 10 tests.
- Full test suite: PASS, 84 files / 498 tests.
- `npm run lint`: PASS.
- Final touched lint: PASS.
- `npx tsc --noEmit`: PASS.
- `npm run db:lint`: PASS, no schema errors.
- Confirmed local stack with `npx supabase status`; `npx supabase migration up` applied the generated migration locally.
- Queried `pg_indexes`: all four expected partial GIN trigram indexes exist with `archived_at IS NULL` predicates.
- Read-only `EXPLAIN` checks used the real organization + active + ILIKE query shapes. The tiny local fixture estimates one organization row and therefore prefers its existing organization indexes; the new trigram definitions and predicates still match the ILIKE search paths for larger cardinalities.
- `npm run build`: PASS on Next.js 16.2.9; `/api/workspace-search` is emitted as a dynamic route.
- `git diff --cached --check`: PASS before commit.

## Commit and concerns

- Commit: `a839ce3 feat(search): add scoped global workspace search`
- The build retains the existing warning about multiple lockfiles/workspace-root inference in the isolated worktree; it did not affect the build.
- No browser UI was added in this task; Task 8 will consume this API in the command palette.

## Independent review follow-up

- RED: added four focused regressions. They proved that one emoji incorrectly triggered database queries, no bounded query recorded deterministic ordering, a description-only task match was discarded, and reversing a 25-row source changed the 20-row candidate subset.
- Description is now selected only inside the server data boundary and carried in a private `WorkspaceSearchCandidate.searchText`. Ranking returns only the nested `WorkspaceSearchResult`, and an exact-shape assertion proves neither `description` nor `searchText` reaches the response.
- Every bounded entity query now orders by the searched field ascending and then `id` ascending before `.limit(20)`. The recorder applies filters, projection, ordering, and limits; repeated retrieval from reversed 25-row inputs returns the same first 20 IDs.
- Query normalization now uses `toWellFormed()`, NFC, and `Array.from()` code-point counting/truncation. One astral code point remains below the minimum, decomposed text normalizes canonically, and truncation cannot split a surrogate pair.
- Executed entity loaders now come from `getWorkspaceSearchScopes(role)` through an exhaustive scope switch, removing the duplicated role branch.
- Review-fix focused suite: PASS, 2 files / 13 tests.
- Review-fix full suite: PASS, 84 files / 502 tests.
- Review-fix touched and full lint, TypeScript, database lint, and production build: PASS.
- Review-fix commit: `c5806f5 fix(search): stabilize scoped workspace results`.
