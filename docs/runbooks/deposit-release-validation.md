# Deposit candidate validation, 2026-10-09

This is a **dormant review candidate, not a cleared release**. Production access
changes remain held. Product actions and export entry points stay disabled and
unmounted. No hosted migration, production grant, merge, deployment or customer
financial mutation has been performed by this validation task.

## Preserved baseline and implementation

Work is isolated on `codex/deposit-release-20261009` from main
`555e64905631b7fadaa6bb954c0590165b2dffb2` (PR229). GitHub main and the successful
[baseline CI run](https://github.com/soley-bot/nestory/actions/runs/37587172543)
were rechecked. Unpublished edits in the original checkout were preserved.

The candidate reuses the checked statement-reader commit and the hash-verified
deposit package. The journal handles durable previews, original retry keys,
partial application and full reversal. Statement enrichment uses the existing
ordinary session and a permission-checked source RPC. PDFs and workbooks label
these movements as deposit reclassification and preserve source details.

Real SQL packet replay exposed a report integration defect: `current_leases`
omits roots without authoritative terms. The report now uses the existing checked
recovery inventory and lease unit relationships, keeping company/property scope
and exact source-census checks. No additional endpoint or permission is required
for that correction. Missing or inconsistent source relationships still fail.

The five financial SQL companions remain outside installed migrations under
`docs/design/deposit-rent-candidate`. The prepared statement-reader migration is
in `supabase/migrations`; its EXECUTE grants are part of the held access review.
The generated TypeScript RPC declaration is present, but fresh generated-type
parity has not yet been established.

## Executed local evidence

Evidence is saved under the ignored `artifacts/deposit-release` and
`artifacts/deposit-candidate` directories in the isolated checkout. These files
contain synthetic data only. Use the completed `run.json` and its harness hash
to distinguish a final successful database run from an interrupted attempt.

| Check | Result |
| --- | --- |
| Real PostgreSQL candidate checks | 53 passed; receipt/retry, partial application, both custodians, full reversal, held/unpaid conservation, no new tenant cash payment, statement lineage, company/branch isolation, report scope and operation-permission revocation after a durable attempt. Own disposable database cleaned up. |
| Focused assembled tests | 179/179 passed in `focused-assembled.json`; includes actual ordinary-role SQL packets through report/statement adapters and real PDF/XLSX renderers. |
| Broad unit tier | 3,019 passed, one sandbox `realpath` denial. The unchanged affected file passed all 50 tests through permitted execution. |
| Broad UI tier | 1,520 passed, one 5-second timeout. The affected five-test modal file passed on a single-worker rerun; the timeout is retained in the original log. |
| Contract suite | Initial sandbox fixture/loopback failures; permitted rerun passed 235/235. |
| Production build | Passed through permitted local execution after SWC was denied path canonicalization inside the sandbox. CI placeholder environment only. |
| TypeScript / ESLint | Final logs: `typecheck.log` and `lint.log`. Lint excludes only generated `artifacts/**`. |
| Migration discipline | 193 immutable base migrations, one forward reader migration and 20 existing reconciliation declarations validated against main. |

The renderer files are `downloads/synthetic-deposit-*.pdf` and `.xlsx`. They prove
real file generation from synthetic SQL responses, **not authenticated browser
downloads**, publication or production behavior. The report remains explicitly
limited to deposit settlement; it does not certify complete owner profit/loss.

One interrupted command session left an idle database created by this task. Its
exact generated name was verified with no active sessions before local cleanup.
The harness now records its database name, source hash, completion and cleanup.
No other stack or historical recovery keeper was modified.

## Reproduce the focused boundary

1. Install the repository's locked dependencies and use the verified local Docker
   engine with the existing `supabase_db_nestory` source schema.
2. Run `node scripts/test-deposit-candidate-local.mjs`.
3. Set `DEPOSIT_CANDIDATE_REPORT_PACKETS` to the resulting
   `artifacts/deposit-candidate/report-packets.json` and
   `DEPOSIT_STATEMENT_PACKET` to `ordinary-role-packet.json` in the same directory.
   Set `DEPOSIT_EXPORT_OUTPUT_DIR` to an owned output directory if files are wanted.
4. Run the deposit report/statement tests and
   `src/features/leases/local-deposit-rent` with Vitest. The SQL-packet integration
   test is intentionally skipped when its explicit capture path is absent.

## Remaining release gates

- Approval of the exact access consequences in
  [deposit-release-access-assessment.md](deposit-release-access-assessment.md).
  Final integration changes must not silently enlarge that scope.
- Reviewed forward promotion of the five SQL companions and complete authenticated
  product/custody/report mounting; the current actions remain dormant.
- Fresh migration-chain reset, database lint, generated-type parity, full pgTAP
  and applicable database/concurrency gates on the final candidate.
- Actual Supabase Auth/SSR, browser receipt/application/reversal and download
  acceptance, persistent restart recovery, and trusted HTTPS/origin checks.
- Exact-candidate required CI, approved merge, protected exact-main production
  database release, hosted before/after verification and production alias/SHA
  checks. No production deployment or alias was re-attested by the local tests.

Historical mocked or prior 24-hour recovery evidence does not replace these
checks. The prior recovery keeper was deliberately left untouched.
