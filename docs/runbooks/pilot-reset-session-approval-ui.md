# Pilot session approval page

The direct `/settings/maintenance` route records genuine signed-in approvals for
the reviewed October empty-books operation. It does not freeze finances, execute
the reset, restore records, dispatch GitHub Actions or grant permissions.

The page and every submission require the exact Pilot host, organization and
backend project, current unscoped Super Admin membership, and the existing
`finance.correct_records`, `finance.close_periods` and `leases.change_terms`
permissions. Submission also uses the existing privileged-session verification
guard. Loading the page does not issue an approval or authorization.

An eligible Pilot administrator can open **Review October reset** from the
Organization settings page. The link uses the same host, workspace, membership,
project and permission predicate as the approval route. Other workspaces do not
show it. Route coverage records the component and permission tests separately
from the still-pending deployed browser check.

The two mutation calls are fixed:

- `authorize_financial_reset_hosted_action`: uses the cookie-session Supabase
  client and returns a locator for exactly one reviewed stage. The database
  verifies the actual session and actor, limits validity to at most five minutes
  and rechecks authority when the protected executor consumes the locator.
- `approve_financial_reset_zero_plan`: uses that same cookie-session client for
  the operation and zero-plan digest. The database requires the separately named
  maker or reviewer and the existing per-property permission. Each person uses
  their own signed-in session; this page cannot approve both identities for one
  person.

The service client returned by the verification guard is never used for either
RPC. No access tokens or cookies are extracted or included in the review file.

## Review file

The local operator supplies a JSON document no larger than 256 KiB with exactly
four fields:

| Field | Required value |
| --- | --- |
| `format` | `nestory-pilot-reset-session-review-v1` |
| `action` | An existing hosted stage or `approve-zero-plan` |
| `binding` | Exact `hostedBinding()` version 1 output, with version 4 empty-books continuation |
| `bindingSha256` | `digestJson(binding)` from the existing transport protocol |

The compact sorted-key file binding digest differs from PostgreSQL JSON text
digests. Existing semantic digests are passed unchanged and remain database
verified. Recovery stages require their separately reviewed recovery binding;
ordinary stages reject it. Legacy rebuilding and no-backup modes are refused.

The file contains the reviewed binding and digests, never SQL, row archives,
credentials, tokens, external URLs or module paths. The schema rejects unknown
fields and duplicate lease entries. The operator must generate it from the actual
reviewed packet; manually constructing a file does not prove backup or execution
readiness. Files on the operator's C: drive are not automatically available to the
web app or GitHub runner.

The user selects the file, reviews the stage and displayed identifiers/digests,
and checks the confirmation box. Changing the stage or binding clears consent.
The server independently validates the document, binding digest, organization,
timezone and actor before making one RPC. The file digest is an integrity check,
not an authorization signature or proof of custody.

An issued locator must be consumed while current; there is no automatic renewal
or retry. After a lost or uncertain response, the form disables resubmission.
The operator must inspect the original recorded outcome before proceeding.
Session approval does not remove the protected dispatch hold or replace the
required backup/restore, source, migration, exact-main and writer checks.
