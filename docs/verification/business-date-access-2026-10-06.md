# Business-date access correction

Base: `164b2cf93a4974bed2ae2fe5b030263dc0efc953` (current main verified on 2026-10-06). This local candidate packages the independently reviewed and disposable-database-validated proposal. It has not been published or deployed.

The existing business-date RPC used legacy membership checks and denied valid current custom memberships, causing lease/finance loaders and property billing options to fail. The replacement accepts authenticated callers with an existing `leases.view`, `finance.view` or `properties.view` permission, through the canonical `app_private.has_org_permission` helper. It changes no role permission, membership or property assignment. The helper retains same-company active-role/branch checks and its existing legacy finance fallback. Legacy Operations callers without any supported view permission lose incidental date-only access; the current app already rejects legacy ordinary memberships.

The RPC returns one company date and takes no property identifier. Property data and financial operations retain their separate scoped checks. The date calculation, statement timestamp, signature, function owner/ACL, stability, security-definer setting and empty search path are preserved. The migration contains no financial row rewrite, timezone update, grant, revoke, policy change or backfill.

Migration `20261006031038_authorize_business_date_by_view_permission.sql` was created with installed Supabase CLI 2.108.0 using a workspace-local CLI home and disabled telemetry. Its executable SQL is identical to the validated proposal; only the introductory comment changes. `business_date_access_test.sql` contains the same executable 45-assertion rollback-only synthetic test, now in normal discovery, with its introductory comments updated. Five source contracts are included in `npm run test:contracts`.

## Existing runtime proof

An isolated PostgreSQL 17.6 run replayed all 192 base migrations, reproduced the original custom-role `42501` denial, then passed 45 proposal assertions plus 495 existing regression assertions. It verified function owner/ACL/security metadata before and after. Coverage includes role/organization/property boundaries, revoked permissions, legal role and branch guards, legacy compatibility and explicit company/UTC month boundaries. This was not the full database suite or a browser journey.

The disposable container had no network, ports or existing volumes; memory/time were bounded. Cleanup and unchanged existing container/volume inventories were verified. No shared database, hosted project or customer records were touched. Initial bare-image privilege failures were corrected by matching the installed CLI's default-privilege initialization before migrations; no proposal or regression assertions were weakened.

Evidence run ID: `2d17da64-1f28-4c73-8ba7-35ad5e0e34e1`. Original proposal SHA256: `a133844f436177d631c1712ca38dd12bd186ec221ab53c1da347316c38bfc8ae`. SQL test SHA256: `d12cf0e0fb59adcd0cd132637e2fc7d7ab1e183d2cd5ffa3514bc5bb7a5e6df1`.

## Release and recovery limits

The source fix, source-map-js lockfile patch and PR226 harness corrections are separate commits. The lock patch moves only source-map-js from 1.2.1 to 1.2.2; all four existing consumers accept it. No deposit or broad dependency batch is included.

Release requires review of the exact combined head, clean CI (including full disposable migration/database checks), successful synthetic browser evidence, protected merge and the serialized `production-database` workflow from merged main. That workflow must pass hosted migration preflight/postflight, pilot preservation checks, linked lint and final dry-run. Verify both production aliases against the exact deployed main SHA before calling it live.

An application rollback does not undo the SQL replacement or migration ledger. If correction is necessary, use a reviewed forward migration through the same protected workflow; restoring the legacy predicate would reintroduce the observed custom-role denial. Do not delete/modify a released migration or repair/reset hosted history. No financial data restore is needed for this predicate-only migration, because it rewrites no records.
