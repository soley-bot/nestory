# Synthetic daily workflow acceptance

Historical fourth-attempt scope and approval record. The local combined candidate adds separately identified source/dependency commits and typing/preflight corrections; see [business-date access correction](business-date-access-2026-10-06.md) and [local harness follow-up](daily-workflow-local-followup-2026-10-06.md). The fourth attempt finished with the documented typing and business-date failures. The proposed fifth execution remains unapproved and has not been triggered.

PR226 contains only test tooling, component assertions and documentation. No product, schema, dependency, permission or assignment changes. Keep deposits, diagnostics, role-design work and PR223 dependencies separate.

The continuous browser journey has **not passed**. Published head `d3234a8942cf75511752c5169a726f76a824a275` passed normal CI, 192 migrations, fixtures, 66 focused rent SQL assertions and the production build. Browser login succeeded, then Property Setup correctly denied Finance Manager. No browser phase completed. Evidence: [synthetic run](https://github.com/soley-bot/nestory/actions/runs/37327990925), [normal CI](https://github.com/soley-bot/nestory/actions/runs/37327990967). These results do not validate this subsequent consolidated patch.

## Whole-journey audit

| Phase | Existing authority | Corrected assumption and proof |
| --- | --- | --- |
| Move-in | Super Admin; setup needs properties.view and leases.activate. Fixture Finance Manager lacks properties.view. | Use existing setup actor without changing grants. Real parent/component test submits active status, dates, confirmed move-in, 120 rent, 8% fee, through-IPS collection and zero deposit. Handle required markers in accessible names; use named rent/fee fields. |
| Payment | Finance Manager; assigned-property finance.view and finance.record_payments. | Exact invoiceId URL opens Invoice details → Record payment. The old q filter and row payment button were unsupported. Select the configured operating bank by visible name and verify its ID. Set company business date. Real component test verifies invoice identity, form payload and receipt link. Active-lease triggers must issue rent; no recovery or direct invoice insert hides failure. |
| Monthly correction | Finance Manager; leases.view, finance.view, finance.correct_records. | Test Finance Member denial before correction while invoice is eligible. Require reason; preview 100 rent, 40 retained payment and 60 balance; invalidate changed input; preview again/save. Component tests cover required reason and stale inputs. Runtime checks correction plus activity audit, original payment/invoice evidence and unchanged future terms. |
| Receipt | Finance Manager; finance.view. | Wait for publication and scope to the exact artifact link. Verify downloaded bytes/hash, refuse redirects, then verify unchanged metadata/hash after correction. Existing component tests cover immediate and retained receipt links. |
| Owner statement | Finance Manager; finance.view, finance.record_payments, finance.close_periods, finance.publish. | Exact owner/property/month summary URL → Account actions → Close month. Reopen dialog after navigation for publication and downloads. Old Load balances and hidden controlled-select mutation were invalid. Real component tests verify scoped close/publication forms, no reopen, and downloads. Runtime verifies Manager close/publication actors and retained receipt source once. |

The baseline pending opening correction was submitted by Finance Manager. Retain the independent Super Admin reviewer only for the exact preflight-pinned fixture requests: self-review is forbidden. This exception prepares the synthetic baseline; it never substitutes for the Manager in payment, rent correction, receipt, locking, closing or publication.

Owner preparation uses existing checked authenticated RPCs to allocate newly pending sources, regenerate the exact period, independently review the pinned opening request and lock only the Manager's own branch/current month. Before the journey, the baseline queue must already be settled. New-source allocation is bounded and blocked sources fail. Closing/publication remain UI actions. This is mixed UI and checked preparation, not an all-UI claim.

## Preflight and isolation

- Before services: 35 boundary tests, 27 actor/date tests using actual baseline grants and the real application permission resolver, plus focused real-component journey checks.
- Before build: read-only database checks for each actor's assigned-property permissions, Member restrictions, fixture identities, vacant unit, owner, receiving account, independent reviewer, unlocked/unclosed month and settled baseline source queue. Save safe preflight.json. No automatic fixture repair.
- Company business dates cover first-of-month, leap day, year rollover and Phnom Penh crossing into October before UTC. Stop if the business month changes during the journey. Some baseline fixtures still use UTC dates; incompatibility must fail preflight rather than be silently repaired.
- Authorization snapshots include members, roles, grants, authorization state, branches and property-branch assignments. Preserve old artifacts and original financial evidence. Broader role/property, fully paid, overpayment, dependent-payment, closed/stale/idempotency cases remain in the two focused SQL suites; they are not all repeated in the browser.

The dedicated same-repository PR-only job checks out exact head with contents:read and no persisted credentials. It creates a unique disposable localhost Supabase project with five services, verifies ownership/ports, applies migrations and loads fixtures once. Never touch the shared local database or production customer data.

One 3 GiB-heap production build with this job's services stopped, then one serial browser attempt. Resource thresholds remain 4 GiB admission/build, 768 MiB stop and 8 GiB disk. Seven-minute browser deadline, 30-minute job timeout, no matrix or automatic retry. Preserve only sanitized logs/synthetic screenshots/results for three days; always clean only this run's owned runtime. Existing CI and protected gates are unchanged.

## Authorized bounded execution

Local checks prove actor selection, selectors and component form payloads, not end-to-end RLS, PDF/storage delivery, owner-close readiness or execution of the new read-only SQL preflight. Those remain explicit runtime risks for a disposable attempt.

Independent review found no implementation defect in the consolidated patch. The user approved publishing it once to draft PR226 and making one fourth synthetic attempt. At the time of this note, that publication and attempt remain pending. CodeRabbit skipped automatic review because the PR is draft.

The approved publication triggers the synthetic job capped at 30 minutes, normal existing PR CI, and the existing Vercel Git preview build/deployment. The combined GitHub job timeout ceilings total 230 runner-minutes; this is neither expected usage nor a monetary cap. Cache, artifact and Vercel preview usage can be additional. Live Actions, Vercel and Codex balances are unverified; the user withdrew the former 20% reserve requirement. Monitor this single attempt and its accompanying checks to completion, without automatic retry, merge or production deployment. No purchases, new paid runner, persistent credentials, permission changes or customer-data writes are included. A test pass does not automatically release anything.
