# Track 9 IPS migration and cutover implementation report

## Verdict before independent review

All local acceptance criteria are implemented and verified. No known critical
accounting, authorization, tenant-isolation, evidence-integrity, idempotency,
concurrency, or irreversible-data defect remains in Track 9 scope. Approval is
not claimed until the independent reviewer completes a fresh diff/evidence
review.

## Acceptance disposition

1. Canonical manifest/hash and complete source authority: addressed.
2. Super Admin, organization, RLS/FORCE, immutable evidence: addressed.
3. Typed source/relationship/money/duplicate blockers: addressed.
4. Ascending month locks, selected-only rent, exact count/money reconciliation:
   addressed.
5. Actor-bound replay/conflict and real-session serialization: addressed.
6. Reasoned pre-activation abandon and irreversible reconciliation: addressed.
7. Import workspace counts, money, exceptions, hashes, blockers, next action:
   addressed.
8. Complete authenticated block/correct/commit/replay/role flow: addressed.
9. Two clean identical disposable-local rehearsals: addressed.
10. One complete matrix and scoped backlog discipline: addressed.

## Notable implementation decisions

- Track 9 orchestrates existing import, opening, and rent writers; it does not
  own parallel business rows.
- Reconciliation mismatches run inside a rollback subtransaction, then persist
  exact differences on the immutable batch as a typed blocker.
- Reconciliation hashes bind manifest hash, expected/actual entity counts,
  expected/actual money, and differences.
- Distinct corrected manifests require distinct stage keys; commit keys derive
  from batch identity and replay exactly.
- Hosted activation is intentionally absent and remains a later approval gate.

## Evidence summary

See `docs/verification/track-9-ips-cutover.md` and
`docs/runbooks/ips-cutover.md` for commands, hashes, durations, browser phases,
full-matrix counts, residual backlog, and hosted limits.
