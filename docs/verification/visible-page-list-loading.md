# Visible-page list loading

Scope: ten-row defaults for Properties, Units and Maintenance. No schema, authorization, finance model, cache, or client request-state changes.

The initial inspected checkout was clean at `139d0ae2b286d3fccbf28fa93c46d48ffc8cd7ab`. Its inherited integration history is excluded. The final file-limited patch was applied with `git apply` to an isolated clean checkout of production main `32d26e3ee66a3de5309d95b737c8b0b05b18c7f3`, branch `perf/visible-list-loading-main`, under the authorized task directory. The coordinator checkout was not edited. Only the files listed by the final commit belong to this delivery.

## Synthetic read measurements

`src/features/units/data/units.loading.test.ts` invokes the real unit and property screen loaders with an in-memory Supabase query recorder and 120 synthetic records. The former default is replayed with explicit `pageSize=50`, using the unchanged loader contract. The after case uses the new implicit default.

| Measurement | Former unit default | New unit default |
| --- | ---: | ---: |
| Database range | 0–49 | 0–9 |
| Base rows returned/hydrated | 50 | 10 |
| Recorded table requests | 6 | 6 |
| IDs per unit relationship request | 50 | 10 |
| Relationship requests with unit IDs | 4 | 4 |
| Exact total count | 120 | 120 |

The four recorded unit relationships are current leases, timeline events, ledger entries and document images. Photo-thumbnail loading is mocked to an empty map; no storage signing is needed with this fixture. Those mocks are excluded from the six-request measurement. The property loader likewise returns/hydrates 50 versus 10 base rows using ranges 0–49 versus 0–9, retaining total count 120. Relationship payload contents are empty in this fixture; this is a measurement of bounded base reads and hydration scope, not realistic production bytes or latency.

Maintenance's implicit size changes from 25 to 10; explicit sizes 10/25/50/100 remain supported. The calendar route retains its existing 100-row preset. Existing summary and queue-count reads are unchanged and are not claimed to be bounded by page size.

## Validation

Focused Vitest run: 136 tests passed across 11 files, one worker:

```powershell
$env:TEMP=(Join-Path (Get-Location) '.test-tmp')
$env:TMP=$env:TEMP
node node_modules/vitest/vitest.mjs run src/features/units/data/units.loading.test.ts src/features/units/unit.filters.test.ts src/features/properties/property.filters.test.ts src/features/maintenance/maintenance.filters.test.ts src/features/units/components/unit-screen.test.ts src/features/properties/components/property-screen.test.tsx src/features/maintenance/components/maintenance-screen.test.ts src/features/maintenance/data/maintenance.loader.test.ts 'src/app/(dashboard)/maintenance/page.test.tsx' 'src/app/(dashboard)/properties/page.test.tsx' 'src/app/(dashboard)/units/page.test.tsx' --maxWorkers=1
```

New loader tests cover defaults/explicit sizes, bounded initial ranges, exact filtered counts and page boundaries, tenant organization predicates, empty results with no relationship reads, errors followed by successful retry, and an older pending request completing after a newer filtered request. Existing UI tests cover filter reversal and empty-result actions. The test exercises loader response isolation; it does not claim browser-level cancellation.

Types: `node node_modules/typescript/bin/tsc --noEmit --incremental --tsBuildInfoFile .test-tmp/typecheck.tsbuildinfo`.

Lint: `node node_modules/eslint/bin/eslint.js` with the changed TypeScript files listed explicitly. `git diff --check` also passes. Existing dependencies are reused by a junction; nothing was downloaded. No build, Docker, hosted database, publication or deployment was used.

## Remaining work

The existing complex property/unit filter paths still materialize complete summary sets before filtering, and maintenance totals still read the matching summary set. This patch bounds initial rows only on the already server-paged paths and reduces maintenance page evidence hydration. Moving derived filters/counts to database queries needs a separately scoped contract/schema decision, especially for lease-derived occupancy and finance-derived sorting. It is not solved here. No unsupported production latency claim is made.

No layout or copy change was made; screenshots were not captured. The visible change is the default list length and the existing page-size selector gaining a 10 option for properties and units.
