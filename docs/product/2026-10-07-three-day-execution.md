# October 7–10 execution checklist

The rolling 72-hour window is **October 7, 11:00 → October 10, 11:00 Cambodia time (Asia/Phnom_Penh)**, equivalent to October 7, 04:00 → October 10, 04:00 UTC. These are delivery targets, not evidence of completion or permission to bypass release checks. The product scope follows [staff workflow direction](staff-workflow-direction.md); this is not a claim of complete DoorLoop feature parity.

## Coordination and release rules

- One integration writer owns core Finance, owner close/statements, financial migrations, dependency locks and release workflows. Other tracks provide isolated commits with an exact base, changed-file list, acceptance evidence and open findings. Resolve overlapping files before integration.
- Run one heavy job at a time on the laptop. Schedule typing, broad tests, builds and browser runs serially. Use disposable cloud validation under the current applicable approval rules; keep failed attempts and cleanup evidence.
- Do not reset or mutate the shared local database. Use synthetic fixtures in an owned disposable runtime, never existing customer financial records. Preserve released migration bytes and keep the deposit candidate separate.
- Each release requires exact-head required CI, independent review, a complete relevant browser journey, normal protected merge/database gates, and verification that both production aliases serve the exact merged SHA. A merge or preview is not a live release.
- Record each slice as **planned**, **local checks passed**, **cloud validated**, or **live verified**, with SHA and evidence. Reassess scope daily; carry incomplete work forward explicitly.

| Track | Ownership and handoff |
| --- | --- |
| Integration / core Finance | Sole integration writer; Finance/report source fixes, package manifests, financial migrations, release workflows and candidate branch. |
| Company / branch access | Isolated access patch; disclose permission or schema changes before integration. |
| Reliability / recovery | Isolated reliability evidence/patch; coordinate runner, workflow and dependency overlap first. |
| Maintenance | Isolated maintenance UI/tests from verified main; no competing heavy jobs. |
| Onboarding / settings | Isolated setup/settings UI/tests; coordinate shared components and identity/permission overlap. |
| Deposits | Separate candidate and explicit financial decisions; no automatic integration into the core release. |

Each track supplies its actual base/head and file list before cherry-picking. The integrator refreshes remote main before release; a historical SHA in this plan is not permission to overwrite newer work.

## Day 1 — October 7, 11:00 to October 8, 11:00: core Finance and security

- [ ] Finish owner-statement fee attribution through existing property-scoped Finance reads. Cover migrated dates, late settlements, reversals, missing sources, denied/cross-property access, pagination and unchanged frozen totals. Check the related management-fee PDF/Excel reader.
- [ ] Upgrade sharp to 0.35.5 with official integrity metadata and only required platform dependencies. Verify upload validation, receipt/company logos and PDF/Excel generation; document exploit prerequisites and remaining uncertainty about the deployed runtime.
- [ ] Pass the exact candidate's full synthetic journey: move-in → partial payment → published receipt → reasoned single-month correction → owner allocation/close → both published statement downloads. Verify bytes/hashes, correct figures, actor/reason audit, duplicate/stale protection, original payment/receipt preservation and unchanged future rent.
- [ ] Release only after all gates pass, then verify pilot and production aliases. Provide precise staff steps and distinguish deployment from an operator's financial correction.

Checkpoint entering this plan: PR227 head `f9102d48c2d6c17dd65361321aedd3d877baa336` passed the cloud journey through rent correction and retained receipt verification, but failed statement artifact generation. Its dependency audit failed on sharp. Local follow-up is in progress; the full journey and release remain unverified. Last verified production SHA: `164b2cf93a4974bed2ae2fe5b030263dc0efc953`.

## Day 2 — October 8, 11:00 to October 9, 11:00: integrate validated staff workflows

- [ ] Company/branch access track: demonstrate permitted assigned-property work and denied other-branch/property/role access, including stale scope/session switching. Review changes to the restriction matrix separately from usability changes.
- [ ] Maintenance track: demonstrate request → assignment → status update → completion, including empty/error states and mobile use. Financial posting and automation require their own proven contracts.
- [ ] Onboarding/settings track: demonstrate resumable setup, clear prerequisite errors, navigation, validation and safe persistence. New credentials, payment-provider connections or changed security settings are separate decisions.
- [ ] Integrate reviewed commits individually on an explicit base. Run affected checks after each slice, then shared typing/build/browser checks serially. Release completed slices independently when all their gates pass.

## Day 3 — October 9, 11:00 to October 10, 11:00: regression, reports and recovery

- [ ] Run exact-head application/database/concurrency suites and a production build; preserve results and failures without relaxing gates.
- [ ] Verify staff journeys and report exports across supported roles, branch/property scopes, partial/full payments, reversals, closed periods and UTC/business-month boundaries. Reconcile PDF/Excel totals and retained document hashes.
- [ ] Rehearse recovery only in an owned synthetic runtime: prove dump/file manifest integrity, restore checks, cleanup and documented operational limits. A synthetic restore is not a production recovery rehearsal.
- [ ] Close reviewed findings, verify migration preservation, complete protected release and alias/SHA checks, and publish staff-facing changes plus a concrete unfinished-work list.

## Explicitly deferred until separately validated

- Deposit-to-rent work remains isolated; do not combine its unfinished migrations or financial behavior with the Finance release.
- General audited deletion/undo, new financial policies, payment automation, broad query architecture refactors and full competitor parity are not promised within these three days.
- Hosted recovery, new persistent credentials, security configuration changes and customer financial corrections require their applicable sensitive-action authorization and operational evidence.
- Incomplete independent tracks, unresolved audit/review findings, missing full-journey evidence or red required CI stay blocked regardless of the target date.
