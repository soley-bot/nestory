# Hosted reset transport contract

This is an implementation contract, not approval to dispatch a reset. The protected runner supplies the fixed project, TLS CA, passfile, persistence, containment and consent authority. Synthetic process tests do not prove these runtime properties.

The genuine-session bridge and SQL consumer, immutable same-transaction prepare/seal receipts, reservation checks and supplemental recovery reader are implemented after explicit approval. Prepare/seal reconciliation checks those receipts against the original immutable intent and observed consumed authorization. These written components do not establish complete protected integration.

Every mutating `dispatch` still fails immediately with `hosted_transport_integration_incomplete`, before artifact, runtime, journal or process access. `HOSTED_TRANSPORT_IMPLEMENTATION_GAPS` contains `complete_hosted_path_review_and_database_proof_pending`; `assertHostedTransportDispatchImplemented()` is unconditional and exposes the same guard for the CLI before private configuration/key reads. The operator's older blocker labels and false capability flags remain conservative unresolved end-to-end gates after a proposed label change was denied; they do not mean the components are absent. No input enables dispatch.

`createHostedResetTransport({packet, connection, artifacts, journal, runtime, actor, spawnProcess?})` constructs the real fixed psql transport. `spawnProcess` is for process-contract tests only; the protected runner does not expose it. No environment discovery occurs inside the transport. `connection` has the same exact fields as the hosted approval reader: `expectedProjectRef`, `host` (`db.<projectRef>.supabase.co`), `port` (5432), `database` (`postgres`), `user`, absolute `psqlPath`, `sslRootCertPath`, `passwordFilePath`.

Methods are `inspect()`, `dispatch({action, authorization})`, and `reconcile({action})`. Actions are `freeze`, `checkpoint`, `prepare`, `seal`, `execute`, `prepare-recovery`, and `execute-recovery`. There is no reopen, custom SQL, URL, relation, actor or automatic retry input. Every action has one stable journal slot under the original operation UUID; a changed packet or new authorization cannot create another attempt. A prior intent requires read-only reconciliation.

Ports:

- `artifacts.read(role)` authenticates the fixed encrypted role and returns UTF-8 JSON bytes. `artifacts.inspectRecoveryCheckpoint()` returns an opaque receipt from the independently configured recovery authority. When separately enrolled, `artifacts.readRecoveryReview()` authenticates the supplemental review and its immutable completion receipt.
- `journal.read(key)` returns string or null; `journal.putIfAbsent(key,string)` returns `created` or `exists`. The protected durable provider owns fsync, privacy and retention; the transport performs exact readback.
- `runtime.assertCurrent({packet,action,checkpoint,binding})` independently verifies exact merged main, protected environment/concurrency writer ownership, containment, durable retention/restore/Storage authority and explicit current consent. It throws on failure and returns exactly `{authoritySha256}` after verification; packet booleans are never substituted for observation. `checkpoint` is the opaque reader receipt. This is a trusted preprovisioned integration port, not a workflow input.
- `actor.consume(authorization,{packet,action,binding})` returns the opaque bridge's fixed `{authorizationId,binding,action}` descriptor after exact binding verification. The SQL consumer binds the DB-sealed authorization once to the mutation backend/top-level transaction and rechecks the real session, credential expiry, current membership, permissions and step-up. The workflow loads the existing authorization UUID through the fixed reader; it never constructs actor claims. The scoped private continuation/report graph also requires a claim-free operator session and the exact consumed operation/phase/lease/property scope.

Reviewed plaintext artifact shapes:

- `manifest`: `{manifest_sha256, source_snapshot_sha256, schema_sha256, ledger_sha256}`.
- `actions`: `{operation, actions}`. `operation` is the exact existing private `prepare_financial_reset_operation` binding: operation/org/kind/restore UUIDs, source/target generation, manifest/plan/schema/archive/action digests, archive/action counts, audit timestamp and audit actor. `audit_actor` must be null; genuine action authority comes from the actor consumer. `actions` are the existing native typed row descriptors (`action_id`, `ordinal`, `relation_name`, `primary_key`, `kind`, before/after row text and hashes, changed/insert columns). Row text is data; no artifact contains executable SQL.
- `archive`: array of exact `{relation_name, primary_key, row_text, row_sha256}` rows.
- `zeroPlan`: the exact private known-zero review JSON.
- `continuationPlan`: exact reviewed semantic JSON, including actor and all nested deferred source hashes; omit only the top-level `source_sha256` derived after zero in the action transaction.
- `reportPlan`: `{report_review_sha256}`.
- `recoveryPlan`: before reset, a reviewed recovery policy/proof artifact. For an explicit inverse, the implemented supplemental reader exposes `readRecoveryReview()` returning a separately consented immutable `{review, artifactSha256}`. `review` is `{operation, actions, phaseBinding, phaseBindingSha256, executionBusinessDate}` bound to the original checked report checkpoint. `phaseBindingSha256` is the PostgreSQL canonical hash of `phaseBinding`. The reader authenticates the encrypted envelope, completion receipt, exact expected binding and current protected authority. The recovery action never mutates or replaces the original packet/artifacts; the runtime must authorize this exact new review digest and operation UUID. Exact generated row IDs cannot be assumed before the original checked transaction commits. The unconditional dispatch gate still blocks recovery execution.

All packet source files are verified on disk. Inspection independently reads
complete installed schema descriptors (including function bodies, ACLs and
triggers) and migration statement descriptors; it does not trust the operation
row's caller-supplied schema digest. The fixed mutation SQL rechecks the exact
observed descriptors under the single writer lock. Its reset graph consumes the
actor authorization, starts/actions/completes the private engine, applies zero,
prepares/applies continuation and finalizes checked reports in one READ COMMITTED
backend/top-level transaction. Version 3 can rebuild reviewed original-date
invoices. Version 4 instead preserves every contract, generates no invoices and
remains frozen with billing paused. Both separately bind the actual execution
business date. Recovery SQL similarly completes the checked inverse and immutable
phase-recovery checkpoint. This describes the implemented graph, not permission
or ability to pass the dispatch gate. Final results require fresh read-only
inspection of the immutable checkpoint, operation, consumed authorization and
frozen control state. Unknown outcomes retain intent/evidence and permit
inspection only.

The separate `pilot-finance-reset-hosted-reconcile.mjs` entrypoint uses the clean retained original checkout and existing stores opened read-only. It requires exact original packet, descriptors and authority binding, current original provisioning, and separate current read authority. It can inspect expired original action/recovery authority as historical evidence; it cannot consume an actor, initialize a store, dispatch an inverse, retry or reopen writes. Schema/ledger drift still fails closed. Ordinary workflow recovery continues to require unexpired original action authority and original provisioning, plus its separate current recovery authority. The proposed extension of the historical expiry exemption to inverse execution was rejected and is not applied.

A recovery refresh would need a separately reviewed mechanism preserving the original operation/packet/immutable report checkpoint and binding the exact current inverse mapping to fresh valid authority, provisioning, current source/schema/ledger review, containment and customer restore/Storage evidence. This is a proposal, not an existing API. The current code neither automatically refreshes this evidence nor accepts expired or mismatched execution authority.

The durable journal contains only identifiers and digests, including a canonical binding digest; it never stores the continuation lease roster or archived row images. `inspect()` returns private plan data for the trusted runner to assess. CLI output must project a fixed status/count/digest allowlist and must never serialize the complete observation.

For the v4 empty-books mode, read-only observation includes the current full
contract hash, target tenant/owner invoice counts, continuation result and equality
of its before/after images. Successful execution reconciliation additionally
requires the exact preserved-unbilled result roster, zero generated rent/fees,
unchanged contracts, zero invoices, the three named phase fences, and explicit
paused/incomplete/not-close-ready results. A complete-looking operation status
alone does not establish this outcome. Inspection digests preserve fractional
database numbers such as ownership percentages; packet/source digests retain
their existing canonical contract.

Workflow source coverage includes the actor's transitive SQL dependencies as well
as runtime scripts. Missing source files fail preflight before actor lookup. This
coverage check cannot establish deployed migration parity or grant authority.

Keep exact revision, source hashes and runtime evidence for the current tests.
Synthetic SQL or genuine local Auth tests do not prove a provisioned protected
executor, customer database/file recovery, off-host key recovery, or live action
authority. The unconditional hosted dispatch gate remains in place.
