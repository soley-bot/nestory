# Unreleased Finance compatibility amendment

On 2026-09-08 the coordinating supervisor explicitly authorized amendment of
integration migrations 139 and 151 after confirming neither identity had
reached main, a hosted project, or another shared environment. Their previous
applications were confined to disposable local rehearsals. This is an explicit
exception for unreleased source; it does not authorize editing released
migrations or repairing hosted migration history.

The integration checkout started at
`2cfebd6fbcbb99e61531fb0a3efb3d39ecc22de0`. That original commit and the source
worktrees are preserved. Only the integration copies listed below were amended.
Migration 135 and every other shared migration remain outside this exception.

| Original integration file | SHA-256 before amendment |
| --- | --- |
| `supabase/migrations/20260904092136_correct_chart_workflow_boundaries.sql` (139) | `E9C1619C966637EBB8F8CFF35453CB69C6807F440BCA85D9E63177F5E610811F` |
| `supabase/migrations/20260908015834_preserve_legacy_deposit_recording_compatibility.sql` (151) | `63D2A33528E5A2FFCDF2191DCA2ED02323B88304B32347A499854E0C8A483926` |

The original 139 Git blob at the preserved base is
`6c8f63fba4286e0796141d20c31cad69dd2a4546`. The SHA-256 values above describe
the original working files, including their line endings; they are not claims
of byte identity with amended SQL or hosted ledger entries.

## Why the amendment is necessary

Each migration commits independently. Original 139 revoked the released
application's deposit signature while its checked compatibility replacement
arrived only in 151. A deployment stopping between those migrations therefore
broke deposit recording in the still-running released application.

Amended 139 installs and grants the checked legacy adapter in the same
transaction as that revocation. It immediately uses the final account-before-role
locking design from 153, verifies that the selected default remains bound after
locking it, and preserves the original checked month, balance, event and Ledger
writer as an inaccessible private core.

Amended 151 accepts only two known predecessor shapes: the pinned original
148 public writer, or the complete safe adapter already installed by amended
139. Before accepting the latter it checks the exact known function bodies
(normalizing only CRLF to LF for source comparison), language, argument names,
return/security attributes, empty search path, postgres ownership, and effective
execution ACLs. Missing or altered functions fail closed. Both branches verify
the private core's pinned definition hash. It never reinstalls the former
role-before-account adapter.

The pinned `pg_get_functiondef` SHA-256 values are:

- Original public checked writer: `0ac627eebbe787cfb2349275e8dd2449ea2d4721468ec3aba72e5f22859a376a`.
- Renamed private checked core: `49124fcc688a38e4febf8999b7289f5e1faf9c33e90cc79ca9b31ca9cec48387`.

## Release evidence still required

The root coordinator owns database execution. Rehearse the amended prefix
through 139 with the released application signature, and then through 151 and
153; verify the legacy and account-aware deposit paths, missing/default-changed
failure cases, step-up enforcement, month locks, reversal lineage, and the
standalone default-retirement concurrency regressions. Verify that arbitrary
adapter-body or ACL alterations are rejected by 151. Record executed evidence
in the release handoff before promotion. No database execution or hosted
migration-history repair is performed by this documentation.
