# Checked month-to-month continuation review

This is generic workflow and verification guidance. Actual tenant occupancy, agreement to month-to-month continuation, unchanged rent/fees and execution authorization must be recorded privately for each affected lease. This document identifies no customer records and authorizes no hosted correction.

The private review manifest must bind the exact organization/property/lease IDs, authoritative predecessor term and billing-rule IDs, original term end, derived continuation start, rent amount/currency, fee configuration and source fingerprint. Do not put actual identities, dates, amounts or customer consent in the public repository. Re-read the authoritative source immediately before execution; if anything differs, stop for source review rather than choosing a similarly named tenant or overwriting changed terms.

## Checked workflow

After protected release of the application and migration, open the relevant active lease and choose **Renew lease**, then **Continue month to month with unchanged rent and fees**. Review the derived continuation start, unchanged rent and fee display and confirm the continuous stay. The command is `continue_lease_month_to_month`, using the original browser financial generation, exact predecessor term and billing-rule IDs, expected rent/fee, and an idempotency key.

The database derives the start from the day after the original term end, stores an open-ended date bound, preserves the predecessor's dates and rent, and appends a new authoritative term and complete billing rule. It retains the collection route, due day, frequency, recipient, timezone and management-fee configuration. One-time original first/final-period overrides do not become recurring monthly charges. The operation rejects changed source values, future competing terms/rules, incomplete billing, inactive leases, closed financial periods, frozen workspaces and stale browser generations. It records an audit event and replays the same request without duplication.

Contractual continuity can begin before the financial cutoff. Do not move that start to the cutoff to hide history. Preserve the contractual date while blocking earlier financial generation after the approved opening. This feature does not execute a reset, establish opening balances, rewrite old invoices or record a payment.

## Verification after each authorized hosted correction

1. Original lease ID, tenant, original start date and predecessor dates/rent remain unchanged.
2. Exactly one new month-to-month term and one continuation rule cover the intended period with the privately approved rent and fee. No arbitrary fixed end date appears.
3. Each required billing month contains exactly one issued rent invoice with correct term, billing rule, property/unit and recipient lineage. Derive expected rent and management fees from the approved private manifest, including existing fee-charge flags and collection routes. Calculated totals never authorize overriding those settings.
4. Resolve the billing-readiness issue only once invoice and rule evidence agree. Recheck monthly owner activity, Unit P&L and Owner Close readiness; the report guard must no longer list these missing invoice gaps.
5. For the next month, scheduled billing uses the same open-ended term and rule once. A repeated command or stale tab must not append another continuation.

Local validation uses synthetic data and rollback. Hosted release remains subject to exact merged main, protected production-database preflight/postflight, and authenticated runtime checks. These preparatory results are not hosted-production proof.
