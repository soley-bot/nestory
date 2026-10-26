# Private financial reset operation preparation

The `operator-*` modules prepare a review packet and reconcile supplied observations.
They have no database, HTTP, credential, workflow-dispatch or SQL execution path.
Every packet has `executionSupported: false`; every reducer result has
`mutationAllowed: false`.

The separate `hosted-approval` library implements bounded genuine-session
approval, renewal endorsements and immutable evidence ordering. The fixed database
reader, durable journal, encrypted artifact readers, actor bridge, same-transaction
prepare/seal receipts and protected runner are also implemented. The approval
client itself does not execute a reset; the transport's unconditional
`hosted_transport_integration_incomplete` gate still blocks every mutation.

The packet retains the blocker labels
`genuine_session_actor_bridge_unimplemented`,
`prepare_and_seal_same_transaction_receipts_unimplemented` and
`separately_approved_recovery_artifact_reader_unimplemented`. A proposed label
change was denied, so these remain conservative unresolved end-to-end gates.
They do not describe absent code. Written components and local test results do
not establish customer recovery, a provisioned protected executor/provider or
current live authority.

## Prepared interface

`scripts/pilot-finance-reset-operator-prepare.mjs` reads an existing private review
and fixed artifact files, hashes their exact bytes, and exclusively creates one
packet outside the checkout:

```text
node scripts/pilot-finance-reset-operator-prepare.mjs --review <private-directory>/review.json --private-artifacts <private-directory> --output <private-directory>/prepared.json
```

The checkout must be clean and committed. The supplied `mainSha` must equal its
HEAD. Preparation checks no remote branch or deployed service, so this equality
does **not** prove that HEAD is the approved merged main or currently deployed.
All tracked scripts, migrations and workflows are hashed with the documented
`utf8-lf-v1` source encoding (UTF-8, CRLF normalized to LF); source changes require
a new packet and review. Artifact hashes remain byte-exact. Symlinks, redirected
directories, missing files, output replacement and artifact files inside the
checkout are refused. Standard output contains only digests, counts and blocker
codes; errors do not disclose artifact contents or private paths.

The review format is `nestory-protected-reset-review-v1`. Its exact fields are:

| Field | Binding |
| --- | --- |
| `operation` | `operationId`, `projectRef`, `organizationId`, `mainSha`, `sourceGeneration`, `targetGeneration`, `cutoff`, `issueDate`, `timezone`; the selected original-date format also requires `executionBusinessDate` and `invoiceDatePolicy` |
| `schemaSha256`, `ledgerSha256`, `sourceSnapshotSha256` | Reviewed schema/functions/triggers, exact deployed migration ledger and full source snapshot digests |
| `archiveRows`, `actionCount` | Positive exact expected counts |
| `databaseBinding` | `manifestSha256`, `planSha256`, `archiveSha256`, `actionSha256`, `zeroReviewSha256`, `continuationSemanticSha256`, `reportReviewSha256` |
| `artifacts` | Every role listed below, each an expected lowercase SHA256 or explicit `null` |

`operationId` and `organizationId` are UUIDs; `mainSha` is a full commit SHA.
`targetGeneration` is exactly `sourceGeneration + 1`. This October preparation
contract accepts cutoff `2026-10-01`. The owner selected
`invoiceDatePolicy: original-reviewed-october`, `issueDate: 2026-10-01` and October
7 due dates in the continuation review. Its separate `executionBusinessDate`
must be an October 2026 date on or after the issue date and must match the
organization's real business date at execution. Actual audit time remains current.
Legacy execution-date packets keep their existing shape, but are not the selected
scoped execution route. Changing the timezone or clock to make an expired review
pass is not supported.

Artifact roles are `manifest`, `actions`, `archive`, `zeroPlan`,
`continuationPlan`, `reportPlan`, `recoveryPlan`, `restoreProof`, `storageProof`,
`actorApprovals`, `containmentProof`, `rehearsalProof` and `liveConsent`. Supplied
files have fixed names `<role>.artifact`; each is limited to 256 MiB. Manifest,
actions and archive are mandatory even for a draft packet. Missing other roles
produce explicit evidence blockers. The archive file must already be encrypted;
the module never encrypts it or establishes that an artifact is authentic,
encrypted, complete, approved or recoverable merely because its digest matches.
Do not provide real customer artifacts until encrypted retention is independently
verified. Keep private review/packet data out of Git, public logs, caches and
ordinary CI artifacts.

PostgreSQL canonical JSONB row/action digests in `databaseBinding` and hashes of
encrypted artifact files are different values. Both are bound, with separate
field names. Never hash JavaScript-reserialized financial row values as a
substitute for the original PostgreSQL canonical text. Do not confuse a matching
file digest with a valid database checkpoint or a human approval.

`reconcileOperatorState(packet, observation)` is a pure reducer. It checks the
original UUID and source binding, frozen generation/cutoff, containment, the
serialized writer, verified recovery evidence and distinct authenticated actor
approvals before describing a next requirement. A supplied boolean is a fixture
input to this reducer, not proof of authentication or isolation. The separate
protected adapters obtain observations from fixed database, filesystem and
workflow interfaces; their real deployment, permissions and evidence still require
independent verification.

The intended order is freeze/reserve, contained recovery checkpoint, prepare,
seal, verify real approvals, checked transaction, and retain the verified frozen
checkpoint. `actions_complete` alone is insufficient: the completed result must
include an immutable `checked-reports` digest and exact current snapshot. A
zero-only result cannot substitute. An executing or incomplete result means
inspect the original operation, never automatically retry or replace its UUID.
Later normal entries invalidate the exact post-reset snapshot and require a
separate reconciliation decision. The reducer provides no reopening action.

## Bounded genuine-session approval protocol

`scripts/pilot-finance-reset-hosted-approval.mjs` exports
`createHostedApprovalClient({ observeDatabase, journal, fetchImpl?, clock? })`.
`approve({ packet, kind, accessToken, publishableKey })` collects one `maker` or
`reviewer` approval. There is no environment lookup or token generation; the
caller must supply that person's existing genuine session. `reconcile({ packet,
kind })` never makes an HTTP request and cannot resubmit an approval.
`renew({ packet, kind, accessToken, publishableKey })` appends a current-session
endorsement for the same original approval and named actor.
`reconcileRenewal({ packet, kind, renewalAttempt })` only reconciles the exact
existing renewal intent and immutable endorsement ordinal; it cannot send another
RPC.

The only network destinations are the exact reviewed project's
`https://<projectRef>.supabase.co/auth/v1/user` and
`https://<projectRef>.supabase.co/rest/v1/rpc/approve_financial_reset_zero_plan`.
The latter receives only the original operation UUID and exact zero-plan review
digest. URLs, RPC names and query strings cannot be supplied by the caller.
Redirects are refused. The same bearer is sent to both endpoints, and only a
publishable or project-matched legacy anonymous API key is accepted. The client
does not log or persist either credential, profiles, response bodies or driver
error details. A surrounding adapter must also disable credential-bearing request
logging and tracing.

Unsigned token fields only reject malformed, expired, anonymous, service-role or
wrong-project input. A fresh Auth response must identify the exact named actor
stored in the canonical zero plan. User metadata and fixture booleans are never
authority. The RPC independently enforces the genuine gateway session, actor
assignment, current session/credential validity, permissions, exact review digest
and frozen state. This follows Supabase's
[server-validated user lookup](https://supabase.com/docs/reference/javascript/auth-getuser);
current action authority is separately revalidated by the private actor consumer.

The client checks its three bound source files and exact database plan twice
before dispatch. It stores and reads back an immutable intent before its single
POST. HTTP success is insufficient: it next reads the exact immutable approval
row and only then creates and reads back a receipt. Both records bind the original
packet, operation, role, actor and request digest. The dispatch slot is always
`financial-reset/<operationId>/zero-approval/<kind>`; changing a token or packet
cannot obtain a fresh slot. A timeout, rejection, redirect, source/plan drift, or
uncertain intent/receipt write stops work. Never automatically retry that POST or
substitute a new operation UUID.

Renewal keeps the original approval immutable. It records a separate numbered
intent at `financial-reset/<operationId>/zero-approval/<kind>/renewal/<attempt>`
and binds the new endorsement to the original approval, review digest, expected
ordinal, genuine session and credential expiry. An unresolved earlier attempt
requires reconciliation before another renewal. A historical endorsement receipt
can be proven even after expiry or supersession; `currentlyUsable` and
`currentStatus` separately report whether that endorsement and operation are
currently eligible. Renewal does not refresh execution consent, provisioning,
the packet, or recovery authority.

Only `missing_actorApprovals` may be present while collecting the approval that
will form that artifact. Every other evidence blocker remains fatal. The missing
artifact stays in the packet and continues to block the operator reducer after
one or both approvals. The receipt never edits the packet, authenticates other
artifacts or proves final customer consent. Its result still returns
`resetExecutionSupported: false` and `privateActorBridgeImplemented: false`.
These conservative capability labels are retained alongside the operator blockers;
the separate bridge's source exists, but this result does not authorize or certify
its complete protected execution path.

The two provider contracts are concrete implementation dependencies:

| Port | Required protected behavior |
| --- | --- |
| `observeDatabase(query)` | Independently pin the actual database/project connection; execute only the fixed `approvalObservationQuery` in a repeatable-read, read-only transaction; return its one metadata row. Its parameters are the operation UUID and an optional exact endorsement ordinal for historical receipt lookup; it exposes no archived row images. Do not turn this into a general SQL endpoint. |
| `journal.putIfAbsent(key, canonicalBytes)` / `journal.read(key)` | Provide durable atomic creation and strongly consistent exact byte reads with immutable retention, returning `created` or `exists` and stored bytes or `null`. Scope access to the protected operation, retain records across worker restarts and prohibit overwrite/deletion as a retry mechanism. |

An in-memory port is test evidence only. The fixed psql reader and exclusive
directory journal have implementations; that does not select a real private
destination, access policy, key or privileged credential. The protected runner,
database read authority and private store still need verified provisioning and
retention. The reader must prove its connection identity rather than trust a
supplied `projectRef`; the actual provider must demonstrate atomic creation,
read-after-write and outage recovery. Local process mocks do not establish those
deployment properties.

After an uncertain outcome, retain the original intent and call only the separate
read-only reconciliation path. A missing approval row is not permission to resend.
Within one client instance an attempted slot remains quarantined even if the
intent write's acknowledgment was lost. After a journal outage, worker restart
requires explicit inspection of that same operation and journal; an empty process
cache or unconfirmed missing object is not restart permission. Never configure an
automatic retry/restart policy around `approve`.

Initial approval reconciliation and the observation before any approval/renewal
RPC require the current prepared/sealed, frozen operation on the packet's execution
business date. The exact-ordinal renewal reconciliation can inspect an existing
endorsement historically without claiming it is currently usable. Neither path
refreshes its packet. Reset execution, actor step-up, final action-time consent,
remote-main verification, worker containment, archive retrieval and inverse
recovery remain outside this approval client.

## Protected integration and evidence still required

1. **Private artifact transport.** The authenticated encrypted readers and durable
   directory journal are implemented, including the separately reviewed recovery
   artifact and completion receipt. Their real destination, access, retention,
   key recovery and customer archive/file-byte recovery remain unproven.
2. **Real actor authority.** The named maker and reviewer must approve the exact
   zero plan themselves. The implemented bridge issues short-lived authorization
   from a genuine gateway session and consumes it once in the private action
   transaction. Continuation/report adapters revalidate the exact consumed scope
   and current permissions/step-up with no fabricated JWT claims. Database-owner
   access and synthetic fixture claims cannot substitute for current genuine
   actor authority. The complete protected path still needs integration proof.
3. **Bound action/checkpoint transport.** The fixed transport, reservation and
   same-transaction prepare/seal receipts are written. Real database identity,
   exact reviewed/deployed source, schema/ledger, contained workers, shared writer
   ownership and durable recovery must still be verified together. Unknown
   outcomes retain the original intent and immutable checkpoint for read-only
   reconciliation. No generic SQL endpoint, automatic retry or reopen is supplied.
4. **Operation-specific protected workflow.** The manual
   `.github/workflows/pilot-financial-reset.yml` is implemented with the existing
   `production-database` environment and `production-supabase` writer lane.
   Executor labels do not prove an enrolled, correctly provisioned host exists.
   The normal release lane and preservation checks remain unchanged. The reset
   transport is held by its unconditional dispatch gate, independent of inputs.

The separate `pilot-finance-reset-hosted-reconcile.mjs` entrypoint provides
historical read-only outcome inspection using the clean retained original checkout
and existing stores opened read-only. It requires exact original packet,
descriptor and authority binding, current original provisioning, and a separately
enrolled current read authority. It can inspect expired action/recovery authority
as historical evidence; it cannot consume an actor, initialize stores, dispatch,
retry or reopen. Source/schema/ledger incompatibility fails closed.

Ordinary inverse execution still requires current original provisioning and
unexpired original execution authority as well as a separately consented current
recovery review bound to the immutable checked-report checkpoint and exact row
mapping. Extending the historical-read expiry exemption to inverse execution was
rejected by automatic approval review and was not applied. A safe recovery refresh
would require a separate reviewed mechanism retaining the original operation,
packet and checkpoint while binding fresh valid authority and verified provisioning
to the exact current mapping, sources, schema/ledger, containment and customer
restore/Storage evidence. The current code cannot automatically refresh or enroll
this authority, and cannot accept expired or mismatched execution evidence.

## Live evidence and business gates

Separately from implementation, each proposed operation needs a fresh contained
inventory; complete exact row graph; named actor permissions; real backup
availability/retention and loss window; isolated restoration proof; encryption
and access verification; file-byte recovery; the selected dated scope/lease/deposit
decisions bound to the exact review; and action-time approval. None is established
by a synthetic fixture. The real customer database and 61 referenced files have
not been exported/restored by this implementation.
Database backups do not contain Storage object bytes; preserve and verify those
separately ([Supabase backup documentation](https://supabase.com/docs/guides/platform/backups)).

The checked opening phase is an all-zero, USD contract. The selected treatment
clears recorded held-deposit balances while preserving contractual deposit
requirements; the exact disposition remains part of the review. Migration
`20261023161622` adds exact
dispositions: unarchived held/received/partially-returned headers on active leases
may become pending with receipt/return dates cleared, while pending, returned,
waived and forfeited headers are archived and retained byte-identically. Contract
amount, currency, type, lease identity and notes remain unchanged. Terminal leases
cannot use the active-header clearing path. The source-bound tests and complete
customer inverse rehearsal must pass before use.

Keeping header identity/amount is not the same as keeping receipt, refund, ledger,
custody and owner-component authority. Carrying a recorded balance forward still
requires a separately implemented/rehearsed disposition and reconciled opening
evidence; the all-zero executor cannot do it. Removed accounting history neither
transfers money nor proves physical custody is zero.

The continuation review names every active lease exactly once. The selected scoped
version 3 path preserves original October 1 issue/October 7 due dates, rejects
contract renewal and leaves the five expired leases unchanged and unbilled. A
deferred expired lease requires its exact lease,
selected term/rule and full historical contract digest. Missing, duplicate,
unreviewed or still-current leases fail closed. The report checkpoint retains the
ordinary missing-invoice blocker and reports `billing_complete: false` and
`blocked-deferred-lease` for affected scopes; it does not certify a completed close.

Recorded receipts and balanced deposit event history support an accounting
record, not independent bank or custodian verification. The checked lease-create
receipt path explicitly requires a receipt choice, date and amount separate from
the contractual deposit obligation. Receipt ledger links, absent header dates or
missing reconciliation links alone cannot establish whether historical events
were independently verified, imported or created by an older workflow. Current
deposit-to-rent custody requires its separate confirmation/attestation bound to
the exact event set.

Run the registered local gate with `npm run test:pilot-finance-reset`. Focused
synthetic contracts can also be run with:

```text
node --test scripts/pilot-finance-reset-operator.node-test.mjs
node --test scripts/pilot-finance-reset-hosted-approval.node-test.mjs
```

They exercise a disposable synthetic Git checkout and private synthetic artifacts,
exact source/byte bindings, missing evidence, dirty checkout/path refusals,
exclusive output, false executable flags, stale date/generation, distinct actor
requirements, later-entry drift and ambiguous-commit reconciliation. Passing them
does not validate a hosted transport, real approval, encrypted archive or customer
recovery.

The hosted-client suite uses only synthetic packets, mock Auth/RPC responses and
in-memory provider ports. It checks exact origin/actor/plan binding, malformed and
expired sessions, redirect refusal, source drift, durable ordering, duplicate
invocations, partial approval, missing evidence and lost acknowledgments. A separate
disposable-database check compiles the fixed SELECT in a read-only transaction.
Neither check verifies a genuine hosted session, a live approval, provider
durability or private reset execution.

At the October 24 local checkpoint, the full Node gate reported 497 tests:
494 passed, zero failed and three Windows/sandbox skips. All five safety migrations
compiled in the disposable database; actual local SQL/Auth/receipt checks remain
under the sole runtime validator. These counts do not establish a completed
end-to-end protected run or customer recovery. Synthetic SQL fixtures, genuine
local Auth/receipt checks and a real customer recovery rehearsal are separate
evidence categories and must not be reported interchangeably.
