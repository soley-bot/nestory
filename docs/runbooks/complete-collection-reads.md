# Complete collection reads

Property and unit derived filters, portfolio search, and financial summaries must
not treat a PostgREST row cap as the end of a collection. The shared
`src/lib/db/complete-read.ts` reader requests bounded pages with an exact count
and stable ordering. It advances by the rows actually returned, so a server cap
below the requested page size does not omit later records.

Every query retains its organization and parent scope and uses the caller's
normal Supabase client. The reader rejects query failures, missing or changing
counts, repeated identities, and an early empty page. Readers with an order
comparator also reject non-increasing order. A failed
source must not become a partial financial total or a successful empty result.

## Limits

- Complete collection reads support up to 100,000 rows per source and load.
  Portfolio relationship batches pass the remaining row budget; report batches
  enforce the cumulative source ceiling after each bounded batch. Requests
  beyond that limit fail with a narrower-selection message.
- Derived property and unit filters still materialize the matching collection.
  Pagination bounds individual requests; it does not make total work constant.
- The report document snapshot RPC retains its existing 5,000-document limit.
  It fails closed above that limit. This change does not replace the snapshot
  RPC or widen its database limit.
- Existing report scope limits and the 366-day financial report window remain.
  Three years of test invoices are evaluated as three annual windows.
- Transaction reports retain their 100-property scope cap. Property-cash
  iteration retains its 10,000-event tracking limit. The shared row budget does
  not widen these independent limits.
- Multiple HTTP requests do not form a database snapshot. Count, identity, and
  ordering checks detect observable drift, but cannot detect every concurrent
  change that preserves those values.

These are correctness and resource limits, not measured production capacity or
concurrent-user guarantees. Larger bounded server-side aggregation and measured
latency under representative load remain separate work.

## Focused verification

Run the deterministic API-cap fixtures with:

```sh
npx vitest run src/lib/db/complete-read.test.ts \
  src/features/properties/data/properties.scalability.test.ts \
  src/features/units/data/units.scalability.test.ts \
  tests/scalability-read-loaders.test.ts --maxWorkers=1
```

Fixtures include portfolios above 1,000 records, dense properties, exact
financial totals above 5,000 rows, 18,000 and 36,000 invoice histories, lower API
caps, and unrelated organization data. They use synthetic data and query
doubles; they do not write to a database or send notifications.

The Database CI job separately checks real PostgREST pagination and tenant
isolation using owned synthetic records on its disposable local Supabase
instance. That integration test is opt-in and refuses to run outside the
guarded GitHub CI environment. Never point these fixtures at a hosted project.
