# Redacted Owner Statement fixture reconciliation

## Evidence boundary

This is a local, redacted manual oracle for the guarded fixture. It is not a
real IPS or DoorLoop statement and makes no hosted or production-data claim.
Generated publication IDs, statement numbers, timestamps, and artifact hashes
are runtime identities; the checked semantic amounts and line ordering below
are literal.

## Four-component roll-forward

| Component | Opening | Movement | Closing |
| --- | ---: | ---: | ---: |
| IPS-held owner cash | 1,000.00 | -25.00 | 975.00 |
| Owner due to IPS | 0.00 | 0.00 | 0.00 |
| IPS due to owner | 0.00 | 0.00 | 0.00 |
| Security-deposit custody | 0.00 | 0.00 | 0.00 |

For every row, `opening + movement = closing`. Unexplained difference is
`0.00`.

## Frozen statement lines

| # | Kind | Component | Amount | Source links |
| ---: | --- | --- | ---: | ---: |
| 1 | opening | IPS-held owner cash | 1,000.00 | 1 |
| 2 | opening | Owner due to IPS | 0.00 | 1 |
| 3 | opening | IPS due to owner | 0.00 | 1 |
| 4 | opening | Security-deposit custody | 0.00 | 1 |
| 5 | movement | IPS-held owner cash | -25.00 | 1 |
| 6 | closing | IPS-held owner cash | 975.00 | 1 |
| 7 | closing | Owner due to IPS | 0.00 | 1 |
| 8 | closing | IPS due to owner | 0.00 | 1 |
| 9 | closing | Security-deposit custody | 0.00 | 1 |

There are exactly 9 ordered lines and 9 immutable source links. The movement
line points to the checked close correction; opening and closing lines point to
their frozen opening/period authority. The read-only smoke downloads both
private artifacts and independently matches each immutable SHA-256 and byte
length before reporting reconciliation success.
