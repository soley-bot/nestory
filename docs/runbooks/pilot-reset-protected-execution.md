# Pilot reset protected execution preparation

This is local engineering, not approval to dispatch a customer reset. The genuine-session actor bridge, immutable same-transaction prepare/seal receipts, reservation checks and separate recovery-artifact reader are implemented after explicit approval. Renewal endorsements and a separate historical read-only reconciliation entrypoint are also implemented. These components do not establish that the complete protected path is ready.

For the current GitHub inventory command and concrete host/archive prerequisites,
see [execution readiness](pilot-reset-execution-readiness.md). That inventory never
authorizes a reset or verifies private provisioning from GitHub metadata alone.

Every mutating call to the transport and runner still fails with `hosted_transport_integration_incomplete` before opening private providers. Nothing in a packet, environment variable or workflow input can override this unconditional gate. The transport records `complete_hosted_path_review_and_database_proof_pending`; the operator packet retains its older `*_unimplemented` blocker labels after a proposed label change was denied. Those labels conservatively hold unresolved end-to-end gates; they are not an inventory of absent source files. Do not merge, deploy, enroll or dispatch this branch as a customer reset on the strength of local implementation or tests.

## Implemented boundaries

`scripts/pilot-finance-reset-hosted-runner.mjs` composes fixed providers for an independently provisioned Linux runner with Node 24. The manual workflow `.github/workflows/pilot-financial-reset.yml` uses the existing `production-database` environment and `production-supabase` writer group with cancellation disabled. Ordinary release CI and its preservation checks are unchanged. The workflow route requires a clean tracked checkout of the current reviewed main, the exact active workflow definition SHA, verified GitHub run/job identity, and independently read environment branch protection.

Inputs are only a closed action, original operation UUID, packet/descriptor/authority digests, an existing DB-issued authorization UUID, and an original action to reconcile. No bearer token, actor UUID, SQL, executable, URL or import path is accepted. The authorization UUID is a locator, not authority. The implemented bridge checks its exact database binding; the private action transaction consumes it once in the same backend and top-level transaction and revalidates the genuine session, expiry, current membership, permissions and step-up. It never writes fabricated JWT claims. Expired, revoked or mismatched authorization stops the operation; there is no automatic refresh or retry.

The fixed configuration is `/etc/nestory-reset/runner.json`, pinned by a protected-environment digest. It selects exactly one reviewed operation and the fixed Pilot project/organization. It cannot select arbitrary implementations. Every ancestor of protected paths must be a non-link directory owned by root or the dedicated account and not writable by group/others. Private leaves must belong to the account with no group/other access. The separately mounted `/var/lib/nestory-reset` root, filesystem type and mount-source hash are checked. The real preinstalled psql executable and database CA bytes are pinned; TLS uses `verify-full` and a pre-existing protected passfile.

The exclusive directory store journals intent, payload and immutable completion, validates byte readback and re-syncs recovered state. AES-256-GCM binds each envelope to operation, project, organization, reviewed main, source snapshot, source code and role. Completed receipts are required in the same authenticated read that yields plaintext. Plaintext is used in memory; encrypted artifacts and hash-only journal metadata persist. The existing encryption key is supplied only at execution and is not generated, printed or saved by the runner.

Configuration also pins independently reviewed access, retention, key-recovery and cross-run recovery evidence. Hash agreement establishes which reviewed documents are in use; it is not an automated proof of their real-world conclusions. Those external properties need actual verification before a configuration can be approved. A filesystem fsync test cannot establish private access, off-host recovery or retention.

`scripts/pilot-finance-reset-hosted-reconcile.mjs` provides a separate historical read-only route. It requires the clean retained original checkout, exact packet/descriptors/original authority, current original provisioning and a separately enrolled, unexpired read authority. Expired action authority can be inspected as historical evidence under that read authority; it cannot authorize a mutation. This route opens existing stores read-only, cannot initialize them or consume an actor, and cannot dispatch, retry or reopen writes. Changed installed schema or migration ledger still requires compatibility review.

The supplemental recovery reader authenticates a separate encrypted review and completion receipt bound to the original operation, immutable checked-report checkpoint and exact inverse mapping. Normal recovery execution still requires the exact original provisioning and unexpired original action authority, plus current separate recovery authority and its reviewed consent, containment, restore and Storage proofs. Broadening the historical-read expiry exemption to inverse execution was rejected by automatic approval review and was not applied.

A safe recovery refresh remains a proposal: retain the original operation, packet and immutable checkpoint; review the exact current row mapping, sources, schema/ledger, containment and customer recovery evidence; and bind fresh valid actor and execution authority to that review with verified provisioning. It must preserve the original evidence and reject expired or mismatched execution evidence. The current code cannot automatically refresh or enroll this authority, and the proposal does not authorize an inverse.

## Existing execution options, without requiring a purchase

Read-only GitHub inspection on October 23 found the existing `production-database` environment restricts deployment to protected branches and has no reviewer rule. There were zero repository-managed self-hosted runners. No settings or credentials were changed. The later approved bucket/policy metadata read succeeded on October 23 at 23:06 UTC: it found five private application buckets, but no verified recovery archive provider.

The selected one-off option is the [prepared GitHub-hosted Linux route](pilot-reset-github-hosted-execution.md) with an external encrypted archive and durable atomic journal. Its fixed [AWS S3 adapter](pilot-reset-aws-recovery-store.md) implements conditional creation, exact version/checksum reads, retention and live access checks. Synthetic tests do not establish an actual provisioned store, key recovery or customer restore proof; those remain activation prerequisites. `RUNNER_TEMP`, workspace files, Actions cache and ordinary Actions artifacts do not replace this contract. The existing filesystem adapter continues to refuse ephemeral storage, and both execution routes retain the unconditional write hold.

The implemented POSIX-runner route is an alternative only if a suitable already-authorized persistent host/mount exists. Its label is routing, not proof that such a host exists. Soley's existing Docker engine may be reusable for a one-off operator container after an equivalent protected dispatch/writer lock and private persistent storage are established. Local Docker by itself does not participate in the GitHub writer lock, so it is not yet an equivalent route. No new runner, volume, account, key, grant, bucket policy or paid resource has been created or selected.

The real executor and private storage destination still need verification and selection within the authorized scope. Do not ask the owner to design infrastructure or send secrets in chat. Provisioning, uploading customer archives and enrolling a reset remain separate actions.

## Business and recovery limits

The current requested treatment is the version-4 `empty-books-no-invoices` mode:
clear reviewed prior and October financial activity and recorded deposit cash,
preserve properties, units, people, every lease and its complete terms/billing-rule
history, and generate no invoices or renewals. Contractual deposit requirements
remain separate from cash and require exact reviewed status dispositions. The
October 1 boundary and actual execution business date are bound separately; this
mode does not issue invoices. The earlier original-invoice-date rebuild mode is
a different review and must not be substituted for empty books.

V4 requires known-zero, no-op continuation and checked reports in one transaction.
It remains frozen, with billing paused and billing/owner-close readiness explicitly
false. A later restart needs separate supported review. The historical native
clone runner rejects v4 before clone creation because it lacks consumed-session
integration; pure SQL construction is not proof that this runner can execute it.

Neither reset nor restore reopens normal writes automatically. A checked final report checkpoint, complete archive, actual customer file-byte recovery, foreign-organization preservation and prevention of later-entry loss must be proven for the exact operation. An inverse needs a separately approved post-reset checkpoint and exact generated row mapping; original reset consent is not inverse consent. Retained audit/provenance/generation/sequence state means restoration is not a byte-identical rewind of the entire database.

The real customer database and referenced file bytes have not been exported or
restored by this implementation. Existing synthetic evidence does not certify
customer recovery. Encryption of a Windows workstation does not by itself prove
the Linux runner's mount, archive retention, key recovery or writer ownership.
Staff notice text remains a draft; recipients and channel remain pending. No
notice has been sent.

## Verification

Run the registered `npm run test:pilot-finance-reset` gate and applicable SQL suites in owned disposable fixtures only. Windows tests exercise actual exclusive file writes, AES envelopes, restart readback, missing/corrupt receipts, sanitized errors, closed workflow arguments and mutation refusal. Strict POSIX directory-fsync behavior is explicitly skipped on Windows; do not report it as passed unless separately executed and evidenced on Linux. Mock process tests prove protocol construction and refusal, not real TLS, authentication, hosted privileges or successful COMMIT recovery.

The v4 candidate's fresh synthetic database check compiled all repository
migrations and passed its focused empty-books and legacy reset suites. Source
hashes and TAP logs identify the exact tested files. Record the current command,
revision, assertions, skips and remaining limits for each new integration run;
older test totals are not evidence for changed code. No customer restore, real
file-byte recovery, protected executor/provider verification or live action
authority is established by synthetic counts.

Do not remove the two retained synthetic Storage objects to make cleanup appear successful: the existing evidence-storage guard rejected that cleanup. Preserve their journals and owned volumes until a supported, separately reviewed cleanup is available. Do not inspect the other user's denied worktree path or alter that session.
