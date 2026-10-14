# Deposit statement reader access fix

Prepared on `codex/deposit-reader-access`, based on main
`555e64905631b7fadaa6bb954c0590165b2dffb2`.

The preserved resolver proposal had no ordinary-session reader binding. Its
separate monthly deposit snapshot deliberately denied all callers and required
both lease and finance permissions. Granting that broad snapshot to finance-only
statement users would expose more than the statement display needs.

This change adds `get_deposit_statement_source`, a narrow display projection,
and binds the statement resolver to it using the existing request client. The
private implementation checks current `finance.view` and property authority,
verifies the canonical owner source and independently computed fingerprint, and
checks the deposit, lease, invoice, unit, owner bridge and full-reversal lineage.
It returns identifiers and operation only. The public wrapper is invoker; the
checked private implementation follows the repository's existing private-reader
pattern. Anonymous and service-role execution remains denied. No direct table
access or deposit command grants are added.

The CLI-created forward migration can install on current main before the
unpublished deposit tables. A call while those tables are absent fails explicitly
with SQLSTATE `55000`. This does not enable deposit posting or publish the
preserved feature. Its original 83-file package is unchanged.

## Local verification

- 55 focused adapter, binding, resolver and existing statement tests passed.
- 18 PostgreSQL checks passed in an owned disposable database, with real canonical
  permission helpers, the preserved deposit SQL and command-created application
  and full reversal. Ordinary authenticated finance reads succeeded. Missing
  permission, foreign branch/company, wrong owner, changed fingerprint, revoked
  permission, damaged lease/invoice/bridge, anonymous and service roles failed.
- 3 PDF/XLSX renderer cases passed: application, full reversal and the captured
  ordinary-role SQL packet. Frozen amounts and model data were preserved.
- Full TypeScript, scoped ESLint, migration discipline and diff checks passed.

The SQL harness copies schema only from the verified local Docker container
`supabase_db_nestory`, generates fresh synthetic runtime capability values and
creates synthetic records in its own database. It drops only that database on
exit. It does not copy customer data, expose credentials, change the source
database, grant the deposit write commands, or touch the historical keeper.

Reproduce the SQL checks in PowerShell using the preserved fixture directories:

```powershell
$env:DEPOSIT_REVIEW_PACKAGE='C:\Users\USer\Documents\Codex\2026-10-04\task-3\cash-review'
$env:DEPOSIT_VALIDATION_FIXTURE='C:\Users\USer\Documents\Codex\2026-10-04\task-5\deposit-validation\round16-modal-readiness'
node scripts/test-deposit-statement-reader-local.mjs
$env:DEPOSIT_STATEMENT_PACKET=(Resolve-Path artifacts/deposit-reader-access/ordinary-role-packet.json).Path
node node_modules/vitest/vitest.mjs run src/features/reports/data/deposit-statement-export.test.ts --maxWorkers=1 --no-file-parallelism
```

This is database-role and renderer evidence, not hosted browser/publication
acceptance. No production migration, merge or deployment was performed. The full
deposit feature still needs its separate schema/command integration and protected
release. Production changes must use exact merged main and the protected
`production-database` workflow; do not apply this migration through a connector.
