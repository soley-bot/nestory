# Unit creation after a lost response

The nine-argument `create_unit` overload adds `p_idempotency_key` to the existing
physical-unit request. Generate a key before the first attempt and keep that key,
the full payload, organization, parent and authenticated actor together until the
outcome is confirmed. A different key represents a different creation request.

The RPC records its receipt in the same transaction as the unit and its creation
audit. A retry by the same currently authorized actor, with the same normalized
payload and active parent branch, returns the original UUID without another
unit or creation audit. A first transaction that rolls back leaves no receipt;
a subsequent identical request may then create the unit. Concurrent identical
requests serialize and converge on the same result.

Every call checks current membership, property permission and active branch
authority before looking up a receipt. A receipt is not permission to replay
after access is revoked. Changed actor, parent, branch or payload rejects the
replay. An archived, missing or changed result also rejects; the function never
creates a replacement under the same key.

The receipt is private. It is not a Data API table and does not grant service-role
asset authority. The original six- and eight-argument overloads remain available
for compatibility, but their calls do not gain keyed recovery automatically.

## Request and recovery

Use the normal authenticated application client. Keep every field, including
explicit nulls and the original key:

```ts
await supabase.rpc("create_unit", {
  p_organization_id: organizationId,
  p_property_id: propertyId,
  p_unit_number: unitNumber,
  p_floor: floor,
  p_size_sqm: sizeSqm,
  p_bedroom_count: bedroomCount,
  p_bathroom_count: bathroomCount,
  p_status: storedStatus,
  p_idempotency_key: savedCreationKey,
});
```

On an uncertain HTTP outcome, preserve the request. A caller may submit that
identical keyed request again, then reread the returned UUID and verify its
organization, parent, physical values and creation audit. Do not infer success
from a similar label or a zero-row read. Do not use PostgreSQL transaction IDs,
`xmin`, a new key, or a different actor to bypass an unresolved result.

A copy operator must durably journal the key and request before dispatch so a
process restart can use the same identity. A closed form or lost local journal
does not authorize reconstructing a request under a new key. Review the current
inventory and original evidence if the saved request cannot be recovered.

Unit creation recovery covers the unit and its creation audit. Attach documents
after the unit is confirmed; attachment side effects are not part of this
idempotency contract.

## Verification and release

`supabase/tests/unit_creation_idempotency_test.sql` checks the database contract
with rollback-only fixtures. `scripts/unit-create-http-recovery.node-test.mjs`
uses an isolated PostgREST process and synthetic authenticated fixtures to check
actual HTTP overload resolution, commit followed by response loss, identical
replay and conflicting or unauthorized requests. The latter runs in the
canonical Database CI job. A fake HTTP handler backed by SQL is not equivalent
evidence.

Ship the migration through the protected main workflow before application
promotion. Do not apply the new migration through a production connector or a
developer checkout. Do not execute a live asset copy until the exact candidate's
HTTP recovery test and protected release checks have passed.
