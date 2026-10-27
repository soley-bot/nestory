# Empty-books Auth and database integration proof

`scripts/pilot-finance-reset-empty-books.integration.mjs` exercises actual local
Auth signup/password sessions and signed PostgREST requests. It uses the same
mutation SQL, observation SQL and execution readback verifier as the protected
transport. It never calls or unlocks hosted dispatch. Its synthetic provider
digest is a test marker, not proof of private storage, consent or recovery custody.

The disposable fixture contains one archived month-lock source, one owner/property
zero-opening scope and a foreign-organization sentinel. Its lease roster is empty.
The separate pgTAP suite covers the eight-lease preservation cases; do not describe
this minimal HTTP proof as a full customer-data or nonempty-contract rehearsal.

## Runtime boundary

The harness accepts only a descriptor file for a separately prepared disposable
runtime. Exact database, Auth, PostgREST and Node helper container IDs, a run UUID,
the exact isolated network ID and internal service names are required. It checks
the local Docker endpoint, ownership labels, exclusive internal network membership,
absence of published ports and reused mounts, service aliases, and the Auth/REST
database/role targets before commands. Credentials are never accepted in the
descriptor. Session tokens remain in memory and subprocess stdin. CLI errors are
sanitized rather than printing rejected inputs or database observations.

```text
node --test scripts/pilot-finance-reset-empty-books.integration.node-test.mjs
node scripts/pilot-finance-reset-empty-books.integration.mjs <owned-descriptor.json>
```

The first command is in the regular contract/reset gates and tests refusal and
redaction. The second requires fresh, independently verified local services and
all repository migrations. It creates synthetic accounts and fixture rows, so do
not repeat it on a completed runtime or substitute a customer database. The fixture
also requires its exact disposable database name and actual Auth users/sessions.

The current preparation is recorded in ignored local artifacts, including pinned
image hashes, exact bootstrap commands, role setup and migration-ledger evidence.
It is not a shipped portable provisioner or CI integration job. Its ledger records
the actual normalized migration batches and does not claim the CLI's individual
statement splitting. Those preparation limits remain explicit.

## Verified sequence and evidence

The local October 27 run completed freeze, checkpoint, prepare, seal, execute,
prepare-recovery and execute-recovery through genuine database-issued
authorizations. The same consumed authorization could not be replayed. Execution
without the independent reviewer rolled back and preserved the source. After
independent maker/reviewer endorsements, the reset committed and the production
readback verifier accepted the actual database observation. A separately bound
inverse restored the synthetic archive and removed phase-generated rows. Controls
remained frozen and the foreign census remained equal at every stage.

The create-only proof records checkpoint, schema, ledger, source, harness and
fixture digests plus receipt summaries. Its separate provenance manifest pins
the tested working-tree sources and explicitly identifies the prior commit as
the candidate parent. It does not claim that an uncommitted test run was exact
merged-main execution. Preserve both proof and provenance together.

The native v4 clone adapter remains unavailable. This proof supplies neither
protected-runner/provider provisioning nor customer database/file-byte recovery,
durable off-host key recovery, production TLS verification or release approval.
See [execution readiness](pilot-reset-execution-readiness.md) and the
[transport contract](pilot-reset-hosted-transport-contract.md).
