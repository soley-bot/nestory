# Hosted demo cutover preparation

This repository does not execute a hosted demo-data cutover. The checked-in
tool validates a separately collected, read-only inventory and emits a
planning-only manifest. It has no database client, no hosted credentials, and
no execution mode.

On 2026-07-29, a separate approved hosted cutover completed. This checked-in
tool remains planning-only and does not execute hosted changes.

## Required observed identity

- Project ref: `pfvmztxktkwyewvxfgot`
- Project slug: `nestory`
- Target organization ID:
  `1221152a-3a7d-48f6-a109-45f2b2173813`
- Required migration head:
  `20260728120841_authoritative_lease_terms_and_rent_policy`

Any mismatch is a hard stop. Every organization returned by the inventory must
be listed. Organizations other than the exact target ID are always recorded as
preserved and are never part of the action scope.

## Inventory contract

Create an untracked JSON file outside the repository with:

```json
{
  "projectRef": "pfvmztxktkwyewvxfgot",
  "projectSlug": "nestory",
  "migrationHead": "20260728120841_authoritative_lease_terms_and_rent_policy",
  "organizations": [
    {
      "id": "1221152a-3a7d-48f6-a109-45f2b2173813",
      "name": "Observed target name",
      "slug": "observed-target-slug",
      "tableCounts": {
        "properties": 0,
        "units": 0,
        "people": 0,
        "leases": 0,
        "financeIncomeItems": 0,
        "financeExpenseItems": 0,
        "financeReceipts": 0,
        "financePayments": 0,
        "tasks": 0,
        "documents": 0,
        "assetPhotos": 0,
        "organizationMembers": 0,
        "organizationInvitations": 0
      },
      "invitationsByStatus": {
        "pending": 0,
        "accepted": 0,
        "revoked": 0
      },
      "adminUserIds": ["observed-auth-user-id"]
    }
  ]
}
```

Do not put names, emails, phone numbers, auth identities, snapshot contents,
credentials, or generated manifests into Git.

Generate a manifest:

```powershell
npm run demo:cutover:plan -- `
  --inventory C:\secure\hosted-demo-inventory.json `
  --reference-date 2030-01-15 `
  --output C:\secure\hosted-demo-cutover-manifest.json
```

The output path must not already exist. `--execute` is explicitly rejected.

## Historical approval gate

The implementation branch stopped before hosted execution. The separately
approved 2026-07-29 cutover proceeded only after:

1. a restorable target-scoped snapshot exists and restoration was rehearsed;
2. a second operator verifies the inventory fingerprint and manifest;
3. non-target organization IDs are compared before and after;
4. target admin and invitation handling is approved status by status;
5. rollback criteria and the maintenance window are written down.

Any future hosted cutover must repeat this approval with a current snapshot,
inventory fingerprint, rollback criteria, and maintenance window. The
checked-in tool remains planning-only.
