# Protected reset execution readiness

The October empty-books implementation is not enabled for production execution.
The owner has declined adding AWS and requested a simpler one-off route. The
[local recovery custody direction](pilot-reset-simple-local-custody.md) supersedes
AWS provisioning as the next step. The prepared AWS-backed workflow remains
inactive; its existence does not make AWS an owner requirement.
Before provisioning or dispatch, collect a bounded GitHub inventory for the exact
candidate commit:

```text
node scripts/pilot-finance-reset-readiness.mjs --pr <number> --expected-head <full-sha>
node --test scripts/pilot-finance-reset-readiness.node-test.mjs
```

The inventory uses fixed GitHub GET endpoints. It reads no secrets, variable
values, private configuration, database rows or customer files. It reports runner
counts, main-only environment policy and ten repository CI jobs for the
specified SHA. Missing access, partial pages, changed heads and incomplete checks
remain unverified. Exit 2 means an inventory was produced with execution still
unauthorized; exit 1 means inventory collection failed. It never exits successfully
as a dispatch preflight. Matching runner labels and successful CI cannot establish
provisioning, private access, persistence, recovery or actor authority.

## Current operational gap

On October 27 the repository API returned zero self-hosted runners and no runs of
the Pilot financial reset workflow. `production-database` restricted deployment to
protected branches and had no required-reviewer rule. The required-reviewer result
is an observation, not a request to weaken or add protection. Recheck the current
main-only policy before any operation.

The original self-hosted route requires a Linux x64 runner labelled
`nestory-reset-protected`, Node 24, fixed `/etc/nestory-reset/runner.json`, and a
separately mounted private `/var/lib/nestory-reset` filesystem. The workflow does
not create these. The earlier AWS-backed GitHub-hosted route uses a fresh Ubuntu
runner and independent AWS S3 recovery storage; it does not depend on this local
host or its shared Docker disk. Changing a runner label, setting an enable
variable or choosing `inspect` does not establish a usable executor. Both routes
retain the unconditional write hold. Local Docker alone does not participate in
the protected GitHub writer lock.

## Concrete next work and ownership

| Needed result | Who supplies or verifies it | Work that can be prepared now |
| --- | --- | --- |
| An existing authorized Linux host with a persistent private filesystem, or approval to provision one | Owner identifies/authorizes the available host; operator verifies OS, mount identity, account ownership and access | Produce a host/mount inspection and provisioning plan. Do not register a runner or create accounts, volumes or grants without authorization. |
| Private encrypted customer archive destination, retention and usable recovery key | Owner approves custody and retention; operator verifies access and independent recovery | Bind the selected provider and evidence to the operation. Do not ask for keys in chat or copy customer records while approval is pending. |
| Exact source-bound customer database and Storage recovery proof | Operator, after the copy/restore scope and target are approved | Rehearse synthetic paths now; prepare the complete reference census and restore verification procedure. A SQL clone or staged blob alone does not prove the restored application references. |
| Protected host configuration, pinned psql/CA, database access and durable journal | Authorized infrastructure operator | Review fixed configuration, executable/CA hashes, filesystem permissions, cross-run readback and recovery evidence. A digest pins reviewed evidence; it does not prove its claims. |
| Exact reviewed operation and current human actor authority | Named maker/reviewer and operator | Prepare source/manifest/action hashes and the recovery plan. Obtain genuine current sessions through the approved flow only when the runtime is ready. |
| Complete protected path and database proof | Engineering and independent review | Finish the contained Auth/PostgREST rehearsal, failure/ambiguous-commit reconciliation and source review. Keep unconditional dispatch refusal until the complete path is reviewed. |

The owner selected simplification using the existing setup. Engineering must
adapt and verify the protected executor's local archive/intent handoff; a new AWS
account is not the owner's next task. Existing reset authorization does not
establish private recovery custody or a usable recovery checkpoint. The earlier
self-hosted/AWS requirements above describe those prepared adapters and should
not be imposed as universal requirements on the new one-off direction.

The separate no-backup route explicitly requires its own reviewed waiver and
offers no backup/restore/export. Its existence does not waive recovery for this
operation. Its durable journal, protected host and genuine actor requirements also
remain. The current empty-books scope leaves the organization frozen and produces
no invoices; old original-date billing examples are not the selected empty-books
operation. See the [transport contract](pilot-reset-hosted-transport-contract.md)
and [protected execution boundaries](pilot-reset-protected-execution.md).
