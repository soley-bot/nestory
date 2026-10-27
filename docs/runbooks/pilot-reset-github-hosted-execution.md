# GitHub-hosted reset execution preparation

This route is prepared code, **not an activated customer reset**. The unconditional `hosted_transport_integration_incomplete` hold remains in the transport, runner and workflow before any mutating action opens private inputs or obtains AWS credentials. No configuration or workflow input bypasses it. No cloud resources, credentials, grants, keys or customer archives were provisioned by this change.

The October empty-books contract remains unchanged: preserve all leases and contract history, erase the reviewed financial scope, establish known-zero openings and reports, issue no invoices, and keep billing paused and the organization frozen. Billing and close readiness remain false.

## Execution boundary

`.github/workflows/pilot-financial-reset-github-hosted.yml` runs Node 24 on `ubuntu-24.04`. It retains the exact current `main` and workflow SHA, `production-database` environment, and same-repository `production-supabase` concurrency group with cancellation disabled. Inputs remain fixed action/operation/digest/authorization locators; no SQL, tokens, endpoints or module paths are accepted. Third-party actions are pinned by full commit SHA and dependencies use the committed lockfile without lifecycle scripts.

Each fresh job is verified using the live GitHub run, attempt, job ID, runner name/ID, image label, head SHA and environment policy. A permanent runner ID is unnecessary. GitHub documents that hosted jobs use fresh runner instances and exposes `RUNNER_ENVIRONMENT` to distinguish them. [Runner selection](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job), [runtime variables](https://docs.github.com/en/actions/reference/workflows-and-actions/variables).

AWS OIDC credentials authorize storage access only. Financial authority still requires the existing reviewed operation, maker/reviewer approvals and genuine DB-issued session authorization, consumed once in the actual transaction. Expiry, revocation, source drift and a queued authorization that has expired all fail closed. There is no automatic renewal, retry or TTL extension.

## Protected configuration

The fixed bootstrap writes these files once under a newly created, runner-owned `0700` `/etc/nestory-reset` directory. Files use exclusive no-follow creation and `0600` permissions. They are transient inputs; their presence or fsync is never recovery-storage evidence.

| Workflow value | Purpose |
| --- | --- |
| Variable `PILOT_RESET_GITHUB_HOSTED_ENABLED` | Must equal `reviewed-operation-only`; does not override the implementation hold. |
| Variable `PILOT_RESET_GITHUB_HOSTED_CONFIG_SHA256` | Independently approved digest of the exact configuration bytes. |
| Secret `PILOT_RESET_GITHUB_HOSTED_CONFIG_JSON` | Writes `github-hosted.json`; fixed repository/project/organization, image label, provider configuration digest, distinct store IDs, existing key ID, pinned client/CA hashes, provisioning digest and one enrolled operation. |
| Secret `PILOT_RESET_EXTERNAL_STORES_JSON` | Writes `external-store.json`; exact format `nestory-github-hosted-reset-stores-v1`, with `journal` and `artifacts` provider configurations. |
| Secrets `PILOT_RESET_DATABASE_CA_PEM`, `PILOT_RESET_DATABASE_PASSWORD` | Writes the pinned `database-ca.pem` and exact-host escaped `database.pgpass`. Passwords never enter JSON configuration or logs. |
| Secret `PILOT_RESET_ENCRYPTION_KEY` | Existing AES key supplied only to the runtime process, never generated or written by bootstrap. |
| Variables `PILOT_RESET_AWS_ROLE_ARN`, `PILOT_RESET_AWS_REGION`, `PILOT_RESET_AWS_ACCOUNT_ID` | Select the independently provisioned storage identity for the fixed OIDC action. Temporary credentials are checked against the pinned provider role/account. |

`github-hosted.json` uses format `nestory-github-hosted-reset-v1`. It intentionally rejects persistent roots, mount claims, permanent runner IDs, arbitrary provider URLs, credentials and unknown fields. Its `operation` pins operation ID, packet/descriptors/authority digests, main SHA and allowed actions. Optional `recovery` pins a distinct inverse operation and exact expected-state, descriptor and authority digests.

The external-store adapter owns its closed AWS configuration schema. Each store binds its ID, account, region, bucket, prefix, runtime role, full policy digest, retention deadline and minimum retention. The runtime requires journal mode `append-only` and artifact mode `read-only`; the artifact role cannot publish recovery material. `assertCurrent()` rechecks live provider protections before use. Private access, retention and key-recovery documents remain independent required evidence; a provider brand or matching hash cannot supply consent.

## Durable preparation and recovery

The reviewed preparation material must be published through a separately reviewed producer before this consumer can run. It is not uploaded by the workflow. The append-only journal namespace must already contain:

- `operation/<operation-id>/packet` and `operation/<operation-id>/descriptors`.
- `operation/<operation-id>/authority/<authority-sha256>`.
- `provisioning/<provisioning-sha256>` and `proof/<proof-sha256>` documents.
- For recovery, `operation/<operation-id>/recovery/<restore-id>/{expected,descriptor,authority}/<corresponding-sha256>` and its separately reviewed proofs.

The artifact store must contain the existing AES-GCM envelopes, immutable intents and completed readback receipts at the existing artifact slots. The adapter hashes logical slots into the configured remote prefix. Artifacts remain bound to operation, project, organization, main SHA, source snapshot, source hashes and role. `RUNNER_TEMP`, workspace files, Actions cache and Actions artifact uploads are not used as durable storage.

Forward `freeze`, `checkpoint`, `prepare`, `seal` and `execute` retain the existing transport. `prepare-recovery` and `execute-recovery` require a separately bound inverse plan, checkpoint, source state, fresh consent and unexpired recovery authority. Inspection/reconciliation expose only read paths, with journal writes and actor consumption explicitly refused.

This route requires the enrolled source to remain current `main`, including during recovery. It does not implement retained historical-source reconciliation or an expiry exemption. Activation therefore needs a reviewed operation window that holds exact main, plus a separately reviewed recovery plan for failures outside that window. The existing historical POSIX path does not establish availability on an ephemeral hosted VM.

Before any customer freeze, complete actual cloud publication/readback, independent restore/key recovery, retention/access review, capacity and complete hosted-path proof. Synthetic tests cover the policy, dispatch hold, bootstrap, source closure and workflow controls; mocked storage tests do not establish an actual AWS resource or customer recovery capability.
