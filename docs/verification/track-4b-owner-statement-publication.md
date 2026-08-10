# Track 4B official Owner Statement verification

## Verification boundary

- Branch: `codex/ips-operational-readiness`.
- Approved Track 4A base: `384cd946c8d014b6930d35a7950d9cf5ec9902ca`.
- Date: 2026-08-10.
- Scope: local worktree and local Supabase only.
- Status: implementation evidence complete; independent review pending.

No hosted mutation, deploy, email, cron, backup/recovery, real IPS/DoorLoop
evidence, push, merge, or Track 5 work is claimed.

## Verified operator outcome

A local Super Admin published an immutable numbered statement from a current
closed revision, downloaded retained PDF/XLSX with DB-matching hashes and byte
lengths, reopened/reclosed, then published N+1 superseding N. N's snapshot,
canonical hash, paths, artifact bytes, and artifact hashes remained unchanged.
Finance Manager read/downloaded both publications with no mutation controls;
Operations Manager could neither discover nor enter the workflow.

## Security and integrity

- Publication/artifact authority is RLS + FORCE RLS, tenant-scoped, immutable,
  checked, actor-idempotent, and serialized with close authority.
- Incomplete artifact registration is visible typed remediation; reopen and
  supersession remain blocked until one verified PDF and XLSX exist.
- Canonical payloads consume only immutable publication/close revision/line/
  source rows. Exact decimal strings never pass through authoritative JS number
  coercion.
- Downloads retrieve private retained objects and independently verify SHA-256
  and byte length before response.
- Exact replay returns the same authority; overwrite, actor/payload conflict,
  cross-tenant, unaffiliated, Operations, anonymous, and service-role paths fail
  closed.

## Artifact evidence

- PDF: deterministic two-page A4 statement and source appendix, unencrypted and
  JavaScript-free, stable page numbering, all content legible in Poppler renders.
- XLSX: deterministic Statement, Source Trace, and Checks sheets; typed monetary
  cells; freeze panes; explicit USD units; zero formula-error matches.
- Bundled `@oai/artifact-tool` inspected key ranges and rendered every sheet.
  Its first pass found clipped labels; the retained literal width RED and final
  render prove the material content is now visible.
- Fixture: 9 frozen lines, 9 source links, four components, PDF/XLSX retained,
  and zero unexplained difference. See
  `docs/verification/owner-statement-redacted-reconciliation.md`.

## Verification evidence

| Gate | Result |
| --- | --- |
| Owner Statement pgTAP | 30 assertions |
| Affected statement + maintenance pgTAP | 96/96 |
| Publication concurrency | 4/4 |
| Existing concurrency matrix | readiness 13/13; opening 4/4; lifecycle 6/6; close 15/15 |
| Complete application | 198 files; 1,477 pass; one intentional skip |
| Focused final application | 9 files, 45/45 |
| Demo tooling / routes / roles | 47/47; 47/47; 5/5 |
| Fixture contract / browser contract | 1/1; 1/1 |
| Fixture publication smoke | 9 lines, 9 sources, 4 components, 2 artifacts, 0.00 difference |
| TypeScript / ESLint / build / diff | pass / pass / pass / pass |
| DB lint / error-level advisors | zero errors (five legacy warnings) / zero findings |
| Browser acceptance | four complete role phases; fixture restored |
| Workbook/PDF inspection | 3 sheets and 2 pages rendered; no material clipping or formula errors |

The expensive accessibility crawl completed in 392.9 seconds. It retained the
same 98 unrelated cross-module findings; `/balances` is clean at four viewports
with zero axe, page, navigation, or overflow findings. The summary is under the
ignored local artifact path
`artifacts/ui-redesign/ui-redesign-2026-08-10T15-53-38.676Z-axe-p29320/summary.json`.

## Review handoff

Independent review must validate publication/close lock integration, tenant and
role isolation, immutable supersession, partial-publication recovery, artifact
byte retention, frozen-only canonical authority, and the retained test oracles.
No milestone approval is claimed here.
