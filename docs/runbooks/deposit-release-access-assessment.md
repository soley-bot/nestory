# Deposit release access assessment — 2026-10-09

The user approved the specific production access changes in this assessment on
2026-10-09 at 23:39 UTC. Production release still requires a cleared candidate and
the protected release workflow. Testing uses only isolated synthetic data.

## Candidate and current state

- Verified GitHub main: `555e64905631b7fadaa6bb954c0590165b2dffb2` (PR229).
- Local candidate: `D:\nestory\.worktrees\deposit-release-20261009`, branch
  `codex/deposit-release-20261009`. The original D:\nestory lease edits remain intact.
- Reused checked-reader commit: `ed403f71e44a6858b449ea0ea44d32457bb88cf3`.
- Verified all 83 entries in the preserved deposit package before copying its
  selected additive files. Five financial SQL bodies are retained byte-for-byte
  under `docs/design/deposit-rent-candidate`, with a SHA-256 manifest. Their old
  filenames are historical proposal identities, **not installed migrations**.
- The release candidate mounts ordinary-session lease actions, explicit custody
  confirmation, and a bounded deposit settlement report with PDF/Excel downloads.
- Current main has none of these new deposit-application/journal definitions.
  A fresh hosted catalog check confirmed their absence (see the baseline below).
  Hash-based hosted preflight remains required before any production write.

## Proposed access changes

All new grants below target the PostgreSQL `authenticated` role. That role is
shared by signed-in users; each checked function still enforces current company,
property, membership and operation permissions. No new staff role or permission
key is proposed, but exposing a new checked financial capability is still a
material access change.

| Exact object | Current candidate access | Proposed access and consequence |
| --- | --- | --- |
| `public.get_local_deposit_rent_candidates(uuid,uuid)` | EXECUTE revoked | Read eligible deposits, invoices, amounts, custody and application state for a specified lease; requires `leases.view` plus `finance.view` and current property scope. |
| `public.get_deposit_rent_journal(uuid,uuid)` | EXECUTE revoked | Read the caller's durable financial preview/attempt/result, including selected amount, date and reason; same dual read scope. |
| `public.prepare_deposit_rent_journal(uuid,uuid,jsonb,text)` | EXECUTE revoked | Persist or replace an unused financial preview. Also requires `leases.change_terms` and `finance.record_payments` for apply or `finance.correct_records` for reversal. |
| `public.begin_deposit_rent_journal_attempt(uuid,uuid,uuid,uuid,text,integer)` | EXECUTE revoked | Commit the original attempt/key so retries cannot replace an uncertain operation; repeats current scope/operation checks. |
| `public.execute_deposit_rent_journal(uuid,uuid,uuid,uuid,text)` | EXECUTE revoked | Atomically apply held deposit to rent or fully reverse it, with invoice, deposit, owner ledger and journal changes. This adds a security-critical financial mutation capability even though it uses existing permission keys. No new bank payment is created. |
| `public.deposit_rent_allocations` | **The preserved base SQL already includes** `GRANT SELECT TO authenticated` and a new SELECT RLS policy | Exposes property-authorized application/invoice/line IDs, signed amounts, reversal IDs, actor and timestamps to users allowed `finance.view`. Required by the amended invoker invoice-balance views. No direct custody/application-header grant or free-text evidence is included. This is a new sensitive-data read surface; the five-wrapper proposal alone does not describe the full access delta. |
| `public.get_deposit_statement_source(uuid,uuid,uuid,uuid,text)` and `app_private.deposit_statement_source(uuid,uuid,uuid,uuid,text)` | Prepared reader migration grants EXECUTE to authenticated | Narrow statement enrichment: current `finance.view`/property checks, exact owner/application identity, independently recomputed fingerprint and validated lineage. Returns identifiers, operation and original application link; no amount/reason/evidence text. Public wrapper is invoker and needs the checked private function's EXECUTE grant. This extends finance-only access to these previously unavailable identifiers and must be included in approval. |

`PUBLIC`, `anon` and `service_role` execution remains revoked. Direct
`apply_deposit_to_rent` and `reverse_deposit_rent_application` execution remains
revoked; the checked journal executes them atomically under the original user.
Private journal tables and helper execution are not exposed.

## Additional capabilities required for a complete user flow

The five wrappers assume custody was explicitly confirmed. New production
confirmation rows must not be inferred or backfilled from customers' names,
current ownership or invoice collection routes. A complete entry workflow needs
an approved checked confirmation action and execution of
`public.confirm_deposit_rent_custody(uuid,uuid,uuid,text,uuid,date,numeric,text,text)`.
It currently remains revoked and checks property `finance.view`,
`leases.change_terms` and `finance.correct_records`; it records the selected
liability account, custodian/owner, effective date, held amount and evidence.
Its activation is a further financial authority change, not ordinary UI wiring.

The dedicated report/download path additionally needs
`public.get_local_lease_deposit_report_snapshot(uuid,uuid[],date,date,uuid)`.
It remains revoked, requires both lease/finance read authority on every requested
property, and returns bounded deposit/event/allocation/bridge records plus ID
census. This exposes sensitive financial history through a new checked endpoint.
The broader finance-only `get_deposit_rent_report_sources` stays revoked.

## What can proceed without production approval

Local code, synthetic database-role tests, renderers, permission denial tests,
lint/type/unit checks and a draft PR. Tests grant the proposed wrappers only in a
fresh, process-owned disposable database on the verified Soley Docker engine.
They do not change the shared source database or any hosted access policy.

Ordinary UI mounting is separate from these grants. Once the exact access changes
are approved and accepted, use only reviewed forward migrations released by the
protected exact-main CI workflow, with hosted before/after checks, linked lint,
final dry-run, deployment SHA and alias verification. No local production push.

Before enabling users, the assembled implementation still needs actual Auth/SSR
and browser download acceptance, fresh migration/type parity, persistent restart
recovery, target HTTPS/origin verification and the final applicable CI checks.
Database-role and renderer tests alone do not certify those boundaries.

Source: preserved SQL and the repository release runbook. Supabase documents the
distinction between function execution grants and row authorization in its
[database function guide](https://supabase.com/docs/guides/database/functions)
and [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security).
## Approval and hosted baseline

The user approved the specific access changes above on 2026-10-09 at 23:39 UTC. This approval permits the exact grants and policy described here after applicable validation; it does not waive release checks or authorize customer-data testing.

Read-only hosted catalog inspection on 2026-10-09 found all nine proposed function names absent, and no `deposit_rent_applications` or `deposit_rent_allocations` tables. The healthy `nestory` project remains at 193 migrations, head `20261006031038`. The protected release workflow must still perform its complete hash-based hosted preflight before writing.
