# October reset with local recovery custody

The owner has no AWS account and asked to simplify the one-off October reset.
AWS provisioning is no longer the selected next step. S3 Object Lock and the
external-store adapter were an implementation choice, not a requirement imposed
by the owner. Keep the existing AWS preparation inactive.

The proposed smaller route uses the existing GitHub/Supabase setup and a private,
encrypted recovery archive on the owner's C: drive. It does not create a new cloud
account, enroll the shared Docker host as a runner, or require encrypting D:.
The owner subsequently authorized the encrypted C: backup/restore test and the
Pilot October reset through this route. That authorization does not establish
that the complete execution adapter or customer recovery proof has passed.

## Smallest operator flow

1. Verify a private destination and sufficient space on C:. Save the encrypted
   Pilot recovery archive and a separately recoverable key, including any file
   bytes needed to restore financial attachments. Prove the archive can restore
   the selected organization without changing the other organizations.
2. Persist the exact reviewed operation and an exclusive pre-dispatch intent on
   the local coordinator before allowing the protected GitHub action to write.
   Bind the exact source, archive hashes, genuine actor authorization and current
   database state. Keep the existing production writer lock and migration rules.
3. Execute the reviewed Pilot-only financial reset, then reconcile its database
   receipt and preserve the result locally. If the reply is lost, inspect the
   original operation before any further action. Never automatically repeat the
   destructive request. A receipt downloaded after commit is not a substitute
   for the durable intent and verified archive created before dispatch.

Preserve properties, units, people, lease contracts and contract history. Produce
no replacement invoices. Keep automatic invoice rebuilding disabled. The current
empty-books contract remains frozen/billing-paused; reopening for manual billing
is a separate reviewed step, not an automatic consequence of reset success.

## What is verified and what remains

The owner's elevated check on October 27 confirmed C: is fully encrypted with
protection on. A dedicated `C:\Users\USer\Nestory-Recovery\pilot-october-2026`
directory now has a protected ACL restricted to the current owner, SYSTEM and
Administrators, with reparse-point checks and exclusive write/readback helpers.
The previously inspected
shared artifact directory and Docker disk are not approved customer staging
destinations. No customer copy should be made there based on disk encryption
alone.

A local OpenPGP key is stored there under DPAPI CurrentUser protection. A fresh
process recovered that key and restored a saved encrypted synthetic PostgreSQL
dump into a fresh, isolated RAM database after the source process and container
were destroyed. Canonical row hashes matched and tampered ciphertext was
rejected. This proves local recovery under the existing Windows account, not
off-host key recovery or recovery of the actual Pilot data and attachments.

The actual Pilot database capture is now saved as ciphertext under that private
directory. All chunks agreed on one unchanged source digest. A separate process
decrypted the saved archive and verified its business row images, including the
explicitly excluded credential-table metadata. Counts and source identifiers
remain in private custody. This is archive integrity evidence; actual database
restore was subsequently verified in a fresh, owned RAM database. The full
captured catalog, every captured business row hash and all foreign keys matched,
and parent-side verification confirmed removal of the temporary container.
This proves recovery of the saved snapshot. A refreshed business capture has also
passed saved-ciphertext and fresh-process decryption checks. Its referenced file
bytes are now retained in private encrypted archives; a fresh process restored
every saved file and verified its byte hash. Live source witnesses before and
after the downloads matched that refreshed database capture. The complete
financial reset/inverse rehearsal remains a separate execution prerequisite.

The matching schema definitions are also retained as a separate encrypted
archive on C: and have passed fresh-process decryption and catalog/ledger hash
checks. They describe the captured source; they do not certify current business
data or authorize schema changes. The isolated restore must reproduce the full
captured catalog before importing any selected-organization records. This is a
scoped business recovery test, not a physical cluster or Auth credential backup.

The owner also approved the Docker/WSL restart. The original 43 containers were
restarted, `/proc/swaps` reported zero active swap entries, and the approved
`.wslconfig` directs WSL crash dumps to a separately protected directory under
the private recovery root. This is a runtime prerequisite; verify it again before
decrypting customer material. The RAM container adapter additionally checks its
exact image, no-network/no-volume configuration, read-only root, disabled logs,
memory/swap limits and owned container identity.

The Windows coordinator now durably records an immutable intent and a single
dispatch claim, refuses ambiguous retries after restart, and pins its store
identity independently in the private parent directory. Its real Windows tests
include corruption, lost responses and untrusted ACL rejection. The actual
journal contains initialization metadata only. The private hosted handoff and
complete customer recovery path still need integration before activation.
Do not claim the local archive is automatically accessible to a GitHub runner,
replace durable storage with RUNNER_TEMP, or remove the unconditional dispatch
hold to make this route appear available. Customer material is not to be placed
in the public repository or its ordinary workflow artifacts.

No AWS resources are required or provisioned. The private local directories and
approved WSL configuration are the only machine settings changed so far; no
production reset has been executed.
