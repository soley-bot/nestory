# IPS cutover runbook

## Purpose and authority boundary

This runbook freezes and reconciles the minimum IPS migration authority before
production activation. It does not activate hosted data, deploy an application,
invite users, or choose the real IPS authority date or data owner.

The local rehearsal authority is deliberately synthetic:

- authority start date: `2026-09-01`;
- data owner: `REDACTED-IPS-DATA-OWNER`;
- manifest: `scripts/fixtures/ips-cutover-manifest.json`;
- organization reference: `REDACTED-IPS-ORG`.

The real authority date, accountable data owner, hosted Supabase target, backup
checkpoint, and activation window require explicit approval in the production
readiness milestone.

## Preconditions

1. The exact branch and migration head are recorded.
2. A restorable hosted backup checkpoint exists and has an owner.
3. The official authority-start date and data owner are approved in writing.
4. Properties, units, people, and leases have one terminal atomic import run
   each, with immutable source-claim hashes and zero failed rows.
5. Every owner opening component is approved through the owner-opening
   authority. Do not insert opening totals directly.
6. Every tenant opening balance identifies one property, one unit, one
   currency, and an explicit list of historical rent months. Do not infer an
   adjacent month.
7. Signed exceptions name the approver, approval timestamp, reason, and unique
   source key. Unplaceable records remain blockers unless explicitly signed.

## Manifest contract

The JSON manifest must contain:

- `schemaVersion`, `authorityStartDate`, `dataOwner`, and redacted scope;
- exactly one reconciled import claim for each of `properties`, `units`,
  `people`, and `leases`;
- one or more tenant opening balances with canonical two-decimal money and
  explicitly selected month starts;
- all four owner components per property/currency:
  `ips_held_owner_cash`, `owner_due_to_ips`, `ips_due_to_owner`, and
  `security_deposit_custody`;
- unique source keys across all sections;
- zero or more complete signed exceptions.

Run the local contract before staging:

```powershell
npm run cutover:test-manifest
```

## Stage and correct

1. Sign in as Super Admin and open `/import`.
2. Enter the approved authority date and redacted/approved data owner.
3. Use a new idempotency key for a materially new or corrected manifest. Reuse
   the same actor/key/payload only to replay an interrupted request.
4. Paste the manifest JSON and select **Stage cutover manifest**.
5. Record the immutable manifest SHA-256 and every blocker.
6. Do not edit a staged batch. Correct the source authority and stage a new
   manifest. A pre-activation staged or blocked batch may be abandoned with a
   reason through `abandon_ips_cutover_batch`.

## Reconcile and freeze

1. Verify the rendered import counts, tenant total, owner total, selected
   months, signed exceptions, and zero blockers.
2. Record a sign-off reason and use the batch-derived commit request key.
3. Select **Commit reconciled cutover**.
4. Independently verify:
   - expected import counts equal actual import counts;
   - expected money equals actual money;
   - differences are `[]`;
   - only selected historical invoices exist;
   - the reconciliation hash reproduces;
   - no cutover idempotency request remains pending.
5. Replay with the same actor/key/payload and confirm the same batch and
   reconciliation identities, with no additional transition or invoice.

A reconciled batch is immutable and cannot be abandoned, edited, or deleted.
It is evidence for a later activation decision, not activation itself.

## Local rehearsal

```powershell
$env:IPS_CUTOVER_REHEARSAL_LABEL='rehearsal-1'
npm run cutover:test-rehearsal
$env:IPS_CUTOVER_REHEARSAL_LABEL='rehearsal-2'
npm run cutover:test-rehearsal
node scripts/compare-ips-cutover-rehearsals.mjs `
  artifacts/ips-cutover-rehearsal/rehearsal-1.json `
  artifacts/ips-cutover-rehearsal/rehearsal-2.json
```

The approved local redacted evidence is:

- manifest SHA-256: `8de15aefa1becebc11d82e77db7510f2b2f1a87c62fa01cf244f14f17efa8af4`;
- reconciliation SHA-256: `a7ff1050ba8d23954c73068c5131336175f713d909c6b5c294a39d666e72309e`;
- durations: `40296 ms` and `40778 ms`;
- selected tenant balance: `875.00 USD`;
- owner components: `1250.00`, `0.00`, `240.50`, and `800.00 USD`;
- selected invoices: July and August 2026; June count is zero.

Every reconciled money value freezes both canonical amount and currency. The
current authority is USD-only; any KHR or other unsupported currency remains a
typed staging blocker rather than expanding the live ledger during cutover.

## Stop and recovery rules

- Stop before commit if any source is missing, ambiguous, nonterminal,
  cross-tenant, unsigned, malformed, or mismatched.
- Stop after a blocked reconciliation. Generated invoice effects are rolled
  back atomically and exact differences remain visible.
- Never delete or rewrite a reconciled batch. Correct source authority in a new
  batch before activation.
- If hosted execution begins later, rollback follows the separately approved
  hosted backup/restore and activation plan. This local runbook does not grant
  that authority.
