# October reset with local recovery custody

The owner has no AWS account and asked to simplify the one-off October reset.
AWS provisioning is no longer the selected next step. S3 Object Lock and the
external-store adapter were an implementation choice, not a requirement imposed
by the owner. Keep the existing AWS preparation inactive.

The proposed smaller route uses the existing GitHub/Supabase setup and a private,
encrypted recovery archive on the owner's C: drive. It does not create a new cloud
account, enroll the shared Docker host as a runner, or require encrypting D:.
This is an implementation direction, not a working adapter or reset approval.

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
protection on. It did not establish folder privacy, available recovery capacity,
independent key custody or a tested customer restore. The previously inspected
shared artifact directory and Docker disk are not approved customer staging
destinations. No customer copy should be made there based on disk encryption
alone.

The current hosted transport requires a branded durable provider and does not
implement this manual coordinator. Engineering must add and review the local
intent/receipt handoff and uncertain-outcome reconciliation before activation.
Do not claim the local archive is automatically accessible to a GitHub runner,
replace durable storage with RUNNER_TEMP, or remove the unconditional dispatch
hold to make this route appear available. Customer material is not to be placed
in the public repository or its ordinary workflow artifacts.

No AWS resources, credentials, ACLs, customer data or production state were
changed by selecting this simpler direction.
