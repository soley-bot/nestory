# Local follow-up to the fourth daily-workflow attempt

Historical harness/diagnosis checkpoint. The local combined candidate now packages the business-date correction separately; see [business-date access correction](business-date-access-2026-10-06.md). References below to an unresolved bug describe the state when these harness checks ran. No fifth publication or cloud execution has occurred.

Base published commit: `bbd2ceb1557cd0225efac02fed2af91c013fe5d2`, PR226. This follow-up is local only: no push, fifth cloud run, hosted changes or production release. Fourth-attempt logs, ZIP and terminal report remain preserved in task-7 artifacts.

## Typing corrections

Removed the 23 unsupported `exact` options from Testing Library role queries in the four component test additions. String accessible names already match exactly; valid `exact` options on text/label queries remain. Replaced five unnarrowed `form.elements.namedItem` event targets with runtime `HTMLInputElement` checks. Missing or wrong-kind controls now fail the test explicitly rather than being hidden by casts.

The entire project passed TypeScript with `--noEmit --incremental false`, including test files. The final run checked 3,521 files, exited zero in 30.929 seconds and kept at least 0.751 GiB free. The first 1 GiB heap run exhausted its cap; successful runs used a 1.5 GiB heap and a 512 MiB free-memory stop floor. An attempted final check while UI tests were still active was refused by the 2 GiB admission guard; it started successfully after they finished. The synthetic workflow now runs the full compiler before Chromium installation or any runtime provisioning. It retains the existing 30-minute timeout and permissions; no hosted workflow was started.

## Business-date diagnosis

This is an existing application authorization mismatch, not an incorrect fixture identity:

- The daily fixture assigns Finance Manager and Finance Member valid `custom` memberships and branch/role IDs. The actual application permission resolver accepts those memberships and their lease-read permissions.
- `public.get_lease_rent_business_date` checks `app_private.is_org_member`, which delegates to legacy `current_workspace_role`. That helper recognizes legacy role names but excludes `custom`.
- A standalone PostgreSQL probe loaded those four exact source function bodies and the fixture's actual membership insert. Super Admin succeeded; custom Finance Manager and Member returned `42501 / Not authorized`. Non-members, cross-organization callers, missing users and anonymous callers were also denied. The Phnom Penh month boundary returned October 1 for September 30 at 18:00 UTC.
- The real lease screen loader unconditionally calls the business-date RPC and throws when denied. A new loader regression reproduces that failure even when scoped lease reads succeed. Unit lease-form options also consume this loader helper; this is not solely a test-harness dependency.

The probe used a cached PostgreSQL 16.15 image, 512 MiB memory, one CPU, no network/ports, no mounted volumes and ephemeral tmpfs storage. It completed in about four seconds and removed its own labeled container. It did not read or alter any existing database. This was a bounded source-function reproduction with minimal supporting tables and an `auth.uid` shim for `request.jwt.claim.sub`, not a replay of the complete Supabase 17 schema. The fourth cloud attempt separately reproduced the denial after replaying all 192 migrations.

No membership, grant, policy, migration or application security code was changed. The bug remains unresolved. A future fix needs a narrow reviewed authorization change for this read-only RPC using the current access model and explicit denial tests; replacing the general membership helper wholesale would broaden the scope. Do not substitute Super Admin, a private helper or a UTC fallback to make the journey pass.

## Why prior checks missed it

1. Focused Vitest tests transpiled the TypeScript without running the compiler. Lint and syntax checks did not validate the Testing Library overloads. Independent reviews omitted the full type check.
2. Actor tests exercised the permission-key resolver, not the additional RPC membership predicate. All permission keys could pass while this RPC denied access.
3. The lease loader stub always returned a successful business date. The new regression allows the actual `42501` response and proves the screen fails.
4. The existing `current_month_rent_change_test.sql` business-date assertion uses a legacy `finance_manager` membership at lines91-100, not the current `custom` representation. The broader database suite could therefore pass while this ordinary-user path remained broken.
5. The new SQL preflight was reviewed but had not executed before the fourth cloud attempt. Independent review did not establish runtime authorization correctness.

## Regression coverage and limits

- Full compiler gate before synthetic provisioning; regression checks that it cannot be skipped or downgraded to `--noCheck`.
- Explicit read-only business-date probes as authenticated setup, Finance Manager and Member actors, independent of permission keys. Errors identify the actor/RPC, preserve the cause and stop without fallback. The browser month-boundary guard uses the same probe.
- Preflight tests cover denial despite successful permission keys, transport failure, malformed output and no further fixture work after denial.
- Lease loader test covers a denied business-date RPC despite otherwise readable scoped leases.
- Local policy tests: 36 passed. Contract/loader tests: 58 passed across two files. Focused journey component tests: seven passed across five files; 241 unrelated cases were intentionally filtered out.

These passing tests prove the corrected typings and fail-closed diagnosis. They do not prove a successful Finance Manager business-date call or a completed browser journey. No full browser journey, production build, full database suite or cloud retry was performed in this local follow-up.
