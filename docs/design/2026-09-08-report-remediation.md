# Report remediation handoff

This local change makes report prerequisites actionable for company staff. It is based on finance commit `c5ea12f72d8faa19b699308de4253d9673f431d9`, with its scoped finance readers and migrations unchanged. No owner login, delivery, payment integration, hosted database write, deployment, push, or main merge is included.

## Interaction design

- Opening balance review, source assignment and ownership setup appear before calculation; calculation precedes the explicit company-wide month lock and close. Ineligible roles see the responsible authority instead of write controls.
- Corrections retain the selected property, owner, month and originating report filters. Ownership setup returns through Owner Accounts to the originating live report. Recheck refreshes authoritative results.
- Pending opening review presents the proposed amount separately from approved history. Successful current publications show retained downloads without redundant blocked/reopen guidance.
- Commands preserve drafts on cancellation or failure, prevent duplicate pending submissions, reuse the same idempotency key for an unchanged retry, and start a new key for changed input or an explicit new command. Expected validation/prerequisite errors are safe inline results; unknown errors remain unconfirmed. Existing command authorization, RPC arguments and redirects are preserved.
- Incomplete publication exposes Resume and withholds missing download links. Reopening a completed statement is a deliberate correction action.

DoorLoop's [Owner Statement Report](https://support.doorloop.com/en/articles/8160274-owner-statement-report) informed scoped report filters, refresh and export presentation. Its [Record an Owner Distribution](https://support.doorloop.com/en/articles/8421185-record-an-owner-distribution) informed explicit prerequisites and keeping payout authority distinct. These patterns are adapted to Nestory's staff-only model.

## Local evidence

Ignored evidence is retained under `output/report-remediation/` in this worktree. Local application port 3017 uses the isolated Supabase API 54621 / database 54622. Finance 545xx and expense 544xx runtimes were not modified. Repository Supabase configuration is restored before commit; local credentials/session files remain ignored.

The real authorized browser flow rejected a pending opening correction with a reason, returned to the same account month, cancelled and resumed the lock draft, explicitly locked the month, closed the owner month, and published both retained formats. Evidence: `before-statements.png`, `valid-after-statements.png`, `valid-lock-confirmation.png`, `valid-resolved-ready-to-close.png`, `valid-closed-ready-to-publish.png`, `valid-published-statement.png`, and `valid-published-mobile.png` (390px wide). Actual retained files: `valid-retained-statement.pdf` and `valid-retained-statement.xlsx`.

A second ready fixture month was closed/published through existing checked RPCs to create an incomplete publication. The browser Resume action completed missing artifacts; `valid-incomplete-statement.png` and `valid-resumed-statement.png` retain both states. Subsequent authenticated PDF and Excel requests returned HTTP 200 (`resume-check.log`).

Finance Member and Finance Manager both downloaded retained statements successfully. The reader saw responsible-role guidance and no lock/close/publish/reopen/calculation controls. Live owner activity was denied to the reader and populated for Finance Manager. Evidence: `finance.member-statements.png`, `finance.manager-statements.png`, `reader-mobile-blocked.png`, `finance-manager-live-report.png`.

Validation and unknown-failure retention, duplicate submission prevention, retry identity, explicit next command, scope changes after both success and failure, proposed opening amounts, permission presentation, and nested safe return URLs are covered by focused tests. A real ownership correction was not completed in the browser: the sampled fixture exposed no ownership resolution link. That route's preservation is supported by component/helper tests, not an end-to-end ownership claim.

## Fixture limitation

Legacy all-zero-version fixture UUIDs failed unchanged privileged publication validation. That partial publication was preserved. A separate organization with valid UUIDs was added to the same disposable database using mapped baseline records; no original organization was reset or reseeded.

The executed additive baseline included a global rent scheduler call. Of 125 original-organization table/view fingerprints, 124 remained identical; `public.rent_generation_exceptions` changed. Owner-close, publication, artifact and monetary fingerprints remained identical. The scheduler contract suggests retry metadata, but before-state row payloads were not retained, so an exact column-level change is not claimed. No speculative rollback or cron alteration was performed. Before/after fingerprints and the executed SQL remain in the evidence directory. The retained loader now scopes the scheduler call to the new organization; this corrected loader was not rerun over existing records.

## Verification boundary

The final focused run passed 189 tests (`component-results.json`). Full lint, build, copy, route-discoverability and route-coverage results are retained alongside the final source manifest. The finance lane's previously reported broad SQL cron-fixture and Settings-route failures are not waived by this UX work. This handoff is local verification, not production certification. Source hashes and the final commit identify the review checkpoint separately from mutable ignored browser evidence.
