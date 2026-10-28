# Pilot manual billing restart

The October empty-books reset is complete, but its lifecycle freeze also blocks property and financial views. The separate restart opens normal entry while preventing automatic rent generation. It does not repeat the reset, generate invoices, change lease terms, or make October ready to close.

## Scope and authority

The restart is limited to Pilot organization `752a87b8-bd04-4a45-9cb8-00687af66e73`, completed operation `7c70e27f-ba37-48cc-8f93-d32badcb2fb7`, generation 1 and the 1 October 2026 cutoff. The original reset binding and checkpoint remain immutable.

Release the forward migration and application through the normal protected main workflow. The migration creates support only; it does not reopen Pilot. The named maker then uses the existing signed-in `/settings/maintenance` page, completes any required email verification, reviews the retained counts and selects **Reopen Pilot for manual billing**. The server action uses the genuine authenticated session; an operator or service-role connection cannot substitute for it.

The native command checks the completed transaction, applied actions, immutable checkpoint, current full snapshot, unchanged contracts and empty financial sources. It records one immutable restart receipt and changes the control to open with automatic rent disabled, retaining its generation and cutoff. Immediate and deferred guards verify the same transaction. A failed command rolls back; an uncertain response requires reading the recorded status before retrying.

The two maintenance RPCs have a 30-second function-specific query budget. The production snapshot is approximately 5.65 MB; one read-only snapshot/hash measurement took 3.48 seconds, so the normal 8-second request budget does not reliably cover both initial and final verification. Ordinary request limits, lock limits and authorization lifetimes are unchanged. See [Supabase function-level timeouts](https://supabase.com/docs/guides/database/postgres/timeouts#function-level).

## Normal user behavior

- Properties, units, people, leases and financial entry become available after a full page refresh.
- Rent cron and lease, term, billing-rule and rent-policy catch-up skip automatic rent generation for Pilot.
- Authorized finance users explicitly select **Generate rent invoice** for the current billing month. The database resolves that month from the selected lease's billing rule when submitted, including timezone and scheduled-rule transitions. This uses the existing canonical rent and fee calculation and its idempotency checks.
- Earlier-month recovery keeps its existing administrator restriction. Future months and dates before the financial cutoff remain rejected.
- Other organizations retain their existing billing behavior. Lease activation and deferred owner-cash settlement keep their existing schedules.
- Old financial forms and retired idempotency keys remain rejected. Reopening does not declare missing rent complete or bypass report/close checks.

## Verification

Use a disposable, schema-only synthetic database for the committed reset followed by restart test. Verify rollback on invalid authority or stale review, automatic rent skips, explicit current-month generation and replay, and unchanged behavior for ordinary automatic organizations. The SQL fixture's emulated gateway is not proof of a genuine hosted session.

After protected production release, use the real signed-in maintenance action once. Read the receipt and policy, then refresh Pilot and verify the property, unit, people, lease and finance screens and the manual rent form. Check that the financial baseline remains empty before the user starts re-entry. Do not create test invoices or payments in Pilot for acceptance.

If the application still fails after a confirmed restart, investigate that failure from current runtime evidence. Do not rerun the reset or remove lifecycle, cutoff, authorization or report guards.
