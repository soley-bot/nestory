# Pilot manual billing restart

The October empty-books reset is complete, but its lifecycle freeze also blocks property and financial views. The separate restart opens normal entry while preventing automatic rent generation. It does not repeat the reset, generate invoices, change lease terms, or make October ready to close.

## Scope and authority

The restart is limited to Pilot organization `752a87b8-bd04-4a45-9cb8-00687af66e73`, completed operation `7c70e27f-ba37-48cc-8f93-d32badcb2fb7`, generation 1 and the 1 October 2026 cutoff. The original reset binding and checkpoint remain immutable.

Release the forward migration and application through the normal protected main workflow. The migration creates support only; it does not reopen Pilot. The named maker then uses the existing signed-in `/settings/maintenance` page, completes any required email verification, reviews the retained counts and selects **Reopen Pilot for manual billing**. The server action uses the genuine authenticated session; an operator or service-role connection cannot substitute for it.

The native command checks the completed transaction, applied actions, immutable checkpoint, current full snapshot, unchanged contracts and empty financial sources. It records one immutable restart receipt and changes the control to open with automatic rent disabled, retaining its generation and cutoff. Immediate and deferred guards verify the same transaction. A failed command rolls back; an uncertain response requires reading the recorded status before retrying.

The two maintenance RPCs have a 30-second function-specific query budget. The production snapshot is approximately 5.65 MB; one read-only snapshot/hash measurement took 3.48 seconds, so the normal 8-second request budget does not reliably cover both initial and final verification. Ordinary request limits, lock limits and authorization lifetimes are unchanged. See [Supabase function-level timeouts](https://supabase.com/docs/guides/database/postgres/timeouts#function-level).

## Normal user behavior

- Properties, units, people, leases and financial entry become available after a full page refresh.
- Pilot starts in manual mode. While automatic posting is off, the rent scheduler and changes to a lease, term, billing rule or rent policy skip automatic generation.
- In **Finance → Rent & collections**, the unit list shows the rent status for each lease's current billing month. Select **Only show rent to generate** to find leases still missing a charge. A posted charge links to its invoice. A vacant unit shows **No current lease**.
- In manual mode, authorized staff can select **Generate rent invoice** on a unit, review the lease and confirm the charge. They can also open the page's **Generate rent invoice** form and type a property, unit or tenant name in the lease picker. The database uses the selected lease's billing clock, rent and fee rules, and existing invoice check.
- Earlier-month recovery keeps its existing administrator restriction. Future months and dates before the financial cutoff remain rejected.
- Other organizations retain their existing billing behavior. Lease activation and deferred owner-cash settlement keep their existing schedules.
- Old financial forms and retired idempotency keys remain rejected. Reopening does not declare missing rent complete or bypass report/close checks.

## Change automatic rent posting

In the open Pilot workspace, a Super Admin can open **Settings → Organization** and turn **Pilot automatic rent posting** on or off. The setting applies to the whole workspace. Each change records the administrator and the previous and new values in the activity log.

Turning posting on mid-month lets the normal schedule and eligible lease updates generate missing rent for the current lease-local billing month. Saving the setting issues no invoices. Earlier months still require explicit recovery. Turning it off stops subsequent automatic charges and preserves invoices already posted. A unit charged manually before the next scheduled run keeps its existing lease-month invoice.

## Verification

Use a disposable, schema-only synthetic database for the committed reset followed by restart test. Verify rollback on invalid authority or stale review, automatic rent skips, explicit current-month generation and replay, and unchanged behavior for ordinary automatic organizations. The SQL fixture's emulated gateway is not proof of a genuine hosted session.

After protected production release, use the real signed-in maintenance action once. Read the receipt and policy, then refresh Pilot and verify the property, unit, people, lease and finance screens and the manual rent form. Check that the financial baseline remains empty before the user starts re-entry. Do not create test invoices or payments in Pilot for acceptance.

If the application still fails after a confirmed restart, investigate that failure from current runtime evidence. Do not rerun the reset or remove lifecycle, cutoff, authorization or report guards.
