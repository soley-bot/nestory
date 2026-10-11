# Deposit release acceptance, 2026-10-11

PR [230](https://github.com/soley-bot/nestory/pull/230) activates ordinary-session
deposit custody confirmation, partial rent application, full reversal and the
bounded deposit settlement report. The specific access changes were approved on
October 9; see [the access assessment](deposit-release-access-assessment.md).
Company, branch, lease and operation permissions remain enforced. No publication
permission is required for the deposit report when both finance and lease read
permissions are present.

Work is isolated in `.worktrees/deposit-release-20261009`. The original checkout's
unpublished lease work remains preserved. The verified session uses
`gpt-6-astra` with `max` reasoning. The 193 migrations already on main remain
unchanged; twelve forward migrations install the preserved companions, approved
reader/grants, audit classification, existing step-up triggers and a future-date
custody guard and checked journal recovery. Custody confirmation cannot attest a
future business date.

## Completed local acceptance

All financial examples use fictional data in the owned local Supabase project
`nestory-deposit-acceptance-20261009`, not customer data. Real Supabase Auth,
ordinary SSR sessions, PostgreSQL RPCs and the built application were exercised.

| Boundary | Observed result |
| --- | --- |
| Receipt, IPS custody and partial application | Browser receipt and custody followed by USD 100 application; held balance and rent due each decreased by USD 100. |
| Full reversal after process restart | A durable attempted reversal survived application/browser restart. Retry preserved its token, payload hash and idempotency key and restored USD 100 exactly once. Original application and reversal remain in history. |
| Owner-held custody and application | Browser confirmed USD 500 held by the owner and applied USD 100. USD 400 remains held and USD 400 due. IPS-held owner cash changes by zero. |
| Conservation | Three application/allocation/bridge rows (IPS application, reversal, owner application), USD 600 IPS-held and USD 400 owner-held, zero tenant cash payments and zero owner collection confirmations. |
| Access | 27 real Auth/API assertions; 13 production-mode HTTP assertions cover finance-only, leases-only, other branch, outsider and anonymous denials, private exports and stale fingerprint rejection. |
| Deposit report downloads | Authenticated browser downloaded PDF and Excel from the production build. Native file links avoid router requests; both bind the displayed source fingerprint. Changed activity returns refresh-required HTTP 409. |
| Official owner statement | Two distinct fictional reviewers approved known zero opening components. The month was calculated and locked, closed and published through the browser. Downloaded PDF and Excel match retained SHA-256/size and contain application, full-reversal and deposit reclassification detail. |
| Origin | Replaying an actual authenticated action with an untrusted Origin was rejected before execution by the Next.js action guard. |
| SQL invariants | Disposable candidate harness: 81 passed, completed and cleaned up; includes future custody rejection without idempotency residue, both custodians, scoped access, permission revocation, definitive rollback/rejection, unknown/committed original recovery and long invoice history. |
| Repository verification | Broad unit/UI/contracts passed; affected pgTAP date-correction and step-up suites passed; 67 final focused review regressions passed; production build and TypeScript passed. |

Final review corrections preserve complete custody history for source validation
and official statements while limiting the specialized report's page/PDF/Excel
rows to rent allocations and their owner bridges. A receipt-only period has no
settlements. Reversal preview copy uses the checked original application's
custodian, including after switching from an unrelated apply-mode selection.

Journal recovery stores a terminal rejection only after the checked command's
subtransaction rolls back and no original idempotency evidence exists. The
original token, key and payload remain immutable. Serialization, unknown
outcomes, revoked permissions and committed original evidence retain attempted
recovery. Currently authorized users may replace unused or terminal predecessors
under current authority; attempted predecessors keep strict original authority.

Historical paid/void invoices are validated without occupying the bounded
operation packet. Current payable invoices and every invoice referenced by deposit
application history remain explicit choices, including fully settled invoices
needed for reversal. Historical parent corruption still fails closed.

The review's proposed active owner with a null start is prohibited by the
validated `property_owners_unarchived_start_required_check` in released migration
`20260809122054`. Clean local replay rejects that fixture and a read-only hosted
catalog query confirmed the same validated constraint. The ownership readiness
rule remains unchanged.

Detailed synthetic evidence is in ignored `artifacts/deposit-release/acceptance`,
`artifacts/deposit-candidate` and `output/playwright` in the isolated checkout.
Auth state and fixture credentials remain private ignored files. Do not copy
them into reports. Development-tool CSP errors are retained in historical logs;
the final production-mode report and native downloads are checked separately.

## Final release gate and recovery

Require green `Application` and `Database` CI and independent review of the exact
final candidate. Earlier successful run
[38131870094](https://github.com/soley-bot/nestory/actions/runs/38131870094) applies
to `696fe742`; later export fixes require their own final run.

Merge normally with the matched candidate SHA. Release hosted migrations only
through the protected exact-main workflow, requiring hosted preflight/postflight,
unchanged Pilot aggregate counts, linked lint and no pending migration in the
final dry-run. Record the merged SHA, run, 205-migration ledger, Vercel deployment
SHA/aliases, HTTPS and runtime checks in the release evidence. Customer financial
mutations are not part of production smoke.

Before release, production remains READY at main
`555e64905631b7fadaa6bb954c0590165b2dffb2`, deployment
`dpl_4wrFdsguMVoHuh5rqM2YATWx86rD`. This retained deployment is the application
rollback target. An application rollback removes the new write UI; database
history remains forward only. Halt on a hosted guard failure and use
[the recovery runbook](production-database-release.md), without local hosted
pushes, migration repair or destructive rollback.
