# Hosted Demo Data Cutover Plan

**Status:** Authorized and in progress
**Branch:** `codex/rebuild-fresh-demo-data`
**Target project:** `pfvmztxktkwyewvxfgot` (`nestory`)
**Target organization:** `1221152a-3a7d-48f6-a109-45f2b2173813`
**Required migration head:** `20260728120841_authoritative_lease_terms_and_rent_policy`

## Outcome

Replace the stale seeded business records in the exact Nestory organization
with the deterministic Cambodia-oriented portfolio already verified locally.
Keep the existing hosted auth users and organization memberships usable,
preserve every non-target organization byte-for-byte, and verify that
properties, leases, maintenance, finance, ledger, and reports all render from
coherent current data.

## Safety decisions

- Never run `supabase/seed.sql` against a hosted project.
- Never delete `auth.users`, `auth.identities`, the target organization, or any
  row owned by another organization.
- Preserve target organization memberships. Temporarily detach stale
  `person_id` and `branch_id` links before deleting business data, then attach
  the hosted manager to the fresh manager person and branch.
- Remove target invitations only when the live inventory confirms there are no
  pending invitations. Accepted and revoked seed-era invitations are stale
  audit fixtures for this cutover; auth users and memberships remain.
- A hashed public-schema/data dump and a target-only extract must exist outside
  Git before deletion. Rehearse restoring the target-only extract locally.
- The delete and insert run in one hosted transaction and must fail closed on
  project identity, organization identity, migration head, membership count,
  pending invitations, and non-target organization inventory.
- Use the current date as the seed reference date so dashboard and report
  windows remain operational immediately after cutover.

## Tasks

1. Record live project, migration, organization, membership, invitation, and
   per-table inventory.
2. Create a full public schema/data dump, derive a target-only dump, hash both,
   and rehearse the target restore against a migration-clean local database.
3. Reset local Supabase with the deterministic seed and verify the committed
   manifest plus report-producing source counts.
4. Export the fresh local target organization, remap the organization and
   hosted auth identities, and exclude auth, memberships, invitations, and the
   organization row from the insertion payload.
5. Generate a guarded hosted transaction that:
   - checks the exact project database and migration head;
   - verifies the target slug, preserved members, and zero pending invites;
   - detaches preserved membership links;
   - deletes only rows with the exact target `organization_id`;
   - inserts the transformed fresh payload;
   - reattaches the hosted manager;
   - validates core counts and finance/report invariants before commit.
6. Apply migrations with the linked CLI. A no-op is expected when the remote
   migration head already matches.
7. Execute the guarded transaction once.
8. Re-query all organization counts, compare the two non-target inventories,
   confirm target access, run Supabase security/performance advisors, and smoke
   the hosted application and report routes.
9. Merge the already-approved seed PR and verify production deployment parity
   if the hosted application is not already serving the same schema-compatible
   code.

## Stop conditions

- Project ref, project name, target organization ID/slug, or migration head
  differs from the observed contract.
- Any pending target invitation exists.
- The target does not have exactly the observed admin and manager memberships.
- The target-only backup cannot be restored locally.
- Any non-target organization inventory changes.
- The fresh payload contains auth rows, organization rows, memberships,
  invitations, document metadata without storage objects, or unmapped local
  auth UUIDs.
- Core report sources are empty or accounting/ledger invariants fail.

## Verification evidence

Record outside Git:

- full and target-only dump paths, sizes, and SHA-256 hashes;
- pre/post per-table inventory for every organization;
- local deterministic seed manifest;
- hosted transaction result and final migration head;
- target membership/auth preservation result;
- report source counts and trusted-report smoke results;
- production SHA and route smoke result.
