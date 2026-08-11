# Track 9 IPS migration and cutover implementation report

## Final verdict

All local acceptance criteria and the four Important first-review findings are
implemented, verified, and independently approved at `fba0b2c`. No critical
accounting, authorization, tenant-isolation, evidence-integrity, idempotency,
concurrency, or irreversible-data defect remains in Track 9 scope.

## Review correction disposition

- I1 global selected-month lock order: addressed by one private global
  month-set helper plus both-start-order real-session races.
- I2 unsupported/lost currency: addressed by USD-only typed staging,
  authoritative lease/invoice currency checks, currency-bound reconciliation,
  and per-currency UI totals.
- I3 multi-entity verifier rejection: addressed by per-property/currency owner
  groups and per-tenant month uniqueness.
- I4 signed-exception time: addressed by canonical UTC parsing at the checked
  boundary, mirrored verifier validation, and visible frozen approval time.

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
