# Deposit custody renewal acceptance, 2026-10-14

This continues [the October 11 acceptance record](deposit-release-acceptance-20261011.md)
for [PR230](https://github.com/soley-bot/nestory/pull/230). The interrupted local
review, build and locked-month migration did not complete; their saved evidence
and actual catalog state were reconciled before retrying. Main and production
were still at `555e64905631b7fadaa6bb954c0590165b2dffb2`.

Later receipts, refunds, retentions and their reversals now invalidate deposit
custody evidence, including backdated or offsetting events that leave the same
nominal held balance. Private, immutable attestations record the exact covered
event hash, held amount and net rent application position. Ordinary rent
applications and full reversals preserve current custody. Each new application
is privately linked to its attestation; reversal retains the original link.

Renewal uses the existing checked confirmation RPC and approved permission
checks. It preserves the original custodian, owner and liability account, requires
a fresh displayed candidate fingerprint and cannot regress the verification
date. The original UUID and fingerprint remain bound through retry. Historical
successful replay cannot refresh evidence or be presented as current after later
activity. There is no inferred attestation or customer-data backfill.

The original custody row and financial history remain immutable. Both new tables
are private, have RLS without caller policies, and retain existing step-up and
immutable audit enforcement. No execution grant, staff permission or public read
scope was added. Historical statement fingerprints/projections remain unchanged.

Verified before final release:

- 123 disposable PostgreSQL checks passed and the database was cleaned up.
  Coverage includes actual lock contention between receipt, renewal and journal
  application, parallel same-key renewal, stale original retry, role/company/branch
  denial, step-up, audit immutability, reversal lineage and zero new cash payments.
- 50 focused application tests, TypeScript and the production build passed.
- Migration discipline passed: 193 immutable base migrations and 14 forward
  migrations; the expected final hosted ledger is 207.
- 28 real Auth/API checks passed again after the local forward migrations.
- Applying the two interrupted/new local migrations preserved existing financial
  records and published statement SHA-256/size evidence exactly.

Fresh browser acceptance uses fictional property 33 and lease 18000 in an open
September month. The earlier published October property/statement remains intact.
Later receipts still require the existing owner-event allocation before rent
application; custody renewal does not bypass owner-register reconciliation.
Detailed results are retained in ignored `artifacts/deposit-release/acceptance`,
`artifacts/deposit-candidate` and `output/playwright`. Fixture credentials and
browser authentication state remain private ignored files.

Require fresh independent review and all exact-head PR checks before normal
matched-SHA merge. Hosted release still runs only from that merged main SHA in
the protected, serialized production workflow, with preflight/postflight, Pilot
preservation, linked lint and final no-pending dry-run. Verify the deployed SHA,
production aliases, HTTPS and authenticated access without customer financial
mutations. Retain deployment `dpl_4wrFdsguMVoHuh5rqM2YATWx86rD` as the application
rollback target; database history remains forward only.
