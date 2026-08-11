# Track 9 - IPS migration and cutover verification

## Status

Implementation and the independent-review correction batch are complete
locally. Focused independent re-review is pending.
No hosted environment, real IPS data, deployment, backup, or activation was
mutated or claimed.

## Operator outcome

A Super Admin can stage a redacted manifest, see exact blockers, stage a
corrected manifest, reconcile import counts plus tenant/owner opening money,
freeze one immutable result, and replay it without duplicate invoices or
evidence. Finance and Operations cannot reach the authority route.

## Authority and controls

- CLI-generated migrations:
  - `20260811043206_ips_cutover_batches.sql`;
  - `20260811045049_harden_ips_cutover_reconciliation.sql`.
- Four immutable RLS plus FORCE RLS tables with authenticated policy-scoped
  read only and no application DML.
- Public checked RPCs are authenticated-entry only; database helpers have no
  anon/authenticated/service-role execution.
- Complete manifest shape requires four import kinds, one or more tenant
  balances, all four owner components per property/currency, unique source
  keys, canonical money, and complete signed exceptions.
- Commit uses the existing atomic import, approved owner-opening, and manual
  rent-generation authorities. It does not create a parallel ledger.
- Mismatch generation rolls back atomically, records exact differences, and
  leaves the batch blocked.

## Rehearsal evidence

| Evidence | Rehearsal 1 | Rehearsal 2 |
| --- | ---: | ---: |
| Duration | 40296 ms | 40778 ms |
| Manifest SHA-256 | `8de15aefa1becebc11d82e77db7510f2b2f1a87c62fa01cf244f14f17efa8af4` | same |
| Reconciliation SHA-256 | `a7ff1050ba8d23954c73068c5131336175f713d909c6b5c294a39d666e72309e` | same |
| Selected invoice count | 2 | 2 |
| Unselected June count | 0 | 0 |
| Tenant balance | 875.00 | 875.00 |
| Differences | `[]` | `[]` |

Every import count and all four owner totals were identical. Raw retained
records are under `artifacts/ips-cutover-rehearsal/`.

The manifest hash stayed unchanged in the correction rehearsal. The
reconciliation hash changed once because expected and actual money now freeze
`{ amount, currency }` rather than an amount with implicit currency.

## Independent-review correction

The first review blocked Track 9 with four Important findings and no Critical
finding. One coordinated correction batch now:

- materializes every selected tenant month and acquires the global financial
  month set in ascending order before lease locks;
- rejects non-USD authority with `cutover_currency_unsupported`, verifies the
  active lease currency, constrains invoice reconciliation by currency, and
  freezes amount plus currency in reconciliation evidence;
- validates four owner components per property/currency and month uniqueness
  per tenant source while allowing normal multi-tenant/month overlap;
- requires a canonical real UTC approval timestamp and displays the frozen
  approval time with every signed exception.

Retained RED/GREEN evidence: database 46/51 to 55/55; reverse-order cutover
races 3/5 with two real `40P01` failures to 5/5; verifier 1/5 to 5/5; focused
loader/panel 3/5 to 5/5. The affected rent lock-order suite remains 4/4. Clean
reset, generated types, focused application 13/13, TypeScript, ESLint, DB
lint/advisors, production build, and diff checks are green. Browser and the
full matrix were not rerun.

## Browser acceptance

One exact-worktree authenticated flow passed:

1. Super Admin staged a manifest with one invalid import claim and saw
   `cutover_import_run_not_reconciled`.
2. Super Admin staged the corrected manifest and saw counts, July/August,
   `875.00` tenant money, and `2290.50` owner opening money.
3. Commit produced one reconciliation; exact UI replay produced no duplicate
   reconciliation, transition, or invoice.
4. Database effects were two selected invoices, zero June invoices, exact
   `875.00`, and zero pending cutover requests.
5. Finance Manager and Operations Manager were denied the route and mutation
   controls.
6. The guarded baseline was restored in `finally`.

The run exposed and corrected one genuine Next 16 action-boundary issue:
action-state types exported from a `"use server"` module were registered as
runtime actions. Types now live in `action-states.ts`; the implementation-time
focused app batch was 24/24, the final action-key/UI subset is 13/13, and the
corrected browser flow is green.

## Single full matrix

- clean reset and guarded fixture: pass;
- database: 47 files, 1752/1752 pgTAP assertions;
- DB lint: zero errors, five unchanged unused-variable warnings;
- error-level advisors: zero findings;
- lease/owner/statement/rent/cutover concurrency commands advanced cleanly;
  the tool wrapper expired in the document phase, so only the interrupted
  document suite (6/6) and two unreached supplemental owner suites (10/10)
  were run afterward;
- fixture smokes: owner opening, lifecycle, close, official Statement, rent
  10/10, and cutover manifest all pass;
- application: 201 files, 1493 pass plus one intentional skip;
- demo tooling: 53/53;
- TypeScript, ESLint, generated types, production build, diff check, route
  coverage 47/47, copy, static discoverability 38/38, and five role journeys:
  pass;
- accessibility: the full crawl retained the existing 98 cross-module backlog
  findings. Changed `/import` is clean at desktop, laptop, compact desktop, and
  phone: zero axe, console/page/navigation, or overflow findings with reachable
  primary actions.

## Backlog and limits

- The long authenticated discoverability smoke is flaky outside this scope: a
  default-port run timed out at Rent Policy and the exact-server rerun timed out
  later at a property-account link. Static discoverability is 38/38 and all
  five role journeys pass. Track 9 did not change either route.
- The 98 accessibility findings predate Track 9 and do not occur on `/import`.
- Hosted Supabase/Vercel parity, real IPS authority, backup/restore, email,
  cron, deploy, activation, push, and merge remain unverified and unauthorized.
