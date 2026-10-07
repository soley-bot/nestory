# Statement source and sharp follow-up

Base candidate: `f9102d48c2d6c17dd65361321aedd3d877baa336` (PR227). Last checked main: `164b2cf93a4974bed2ae2fe5b030263dc0efc953`. This record describes local follow-up; it is not a claim that the candidate is live.

## Evidence and diagnosis

[Synthetic attempt seven](https://github.com/soley-bot/nestory/actions/runs/37566733339) passed move-in, partial payment, published receipt download, single-month rent correction, matching actor/reason audit, and unchanged payment, future terms, historical invoice snapshot and retained receipt hash. It failed during owner-statement source enrichment before both artifacts existed. Its retained error does not identify the exact missing row; the disposable runtime was cleaned. Do not claim a replay of that exact row.

Source inspection found a concrete application mismatch. `management_fee_occurrences` retains the baseline `can_read_finance` SELECT policy. The August 22 branch migration changes that helper to require Super Admin or an internal checked authority context and does not replace the fee table's policy. Ordinary Finance requests therefore cannot use the direct fee lookup. The baseline fixture creates fee cash settlements through normal commands; no missing synthetic setup or fabricated financial row is needed to explain this failure path.

The statement reader now uses the existing `get_owner_profit_loss_events_page` projection behind its unchanged property Finance permission check. It follows the exact fee ID and the owner charge's recognition month. The month matters: historical owner-line recognition was backfilled from a monthly invoice's first issue date, which can differ from an individual fee date. Cash settlement may occur in a later month. Pagination validates scope/cursor identity and stops explicitly above 100,000 scanned events. Frozen statement money, dates, sources and audit evidence remain unchanged.

The related management-fee transaction report had the same direct-read problem and could accept an empty Finance Manager result. It now uses its existing count-checked Finance projection adapter, retaining signed fees/reversals, invoice links, unit attribution, the selected-row limit and bounded pagination past unrelated events. PDF and Excel share that report model.

No SQL migration, grant, policy, financial command or fixture was changed. Deposit table reads have a similar latent policy limitation, but canonical deposits use the custody component, outside this held-owner-cash enrichment filter. Deposit behavior remains separate. The broader Finance account-entry enrichment also warrants a separate review; it is outside this export correction.

## Dependency correction and exposure limits

Both the base candidate and checked production source lock sharp 0.35.4. The [maintainer advisory GHSA-wq5f-xc86-pv6w](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w) identifies versions below 0.35.5 as affected by an upstream librsvg memory vulnerability, with possible code execution under particular glibc Linux runtime conditions. It identifies sharp 0.35.5, containing librsvg 2.63.2, as patched. See the [official release](https://github.com/lovell/sharp/releases/tag/v0.35.5).

The patch changes only sharp and its required platform/libvips packages, including transitive WASM: 27 existing package records, no additions or removals. Official npm registry metadata supplies each version, tarball URL and integrity value. Downloaded sharp, Windows x64 and Linux x64 libvips tarballs were SHA-512 checked against that metadata. The Windows runtime and Linux tarball version manifest both report librsvg 2.63.2. No external dependency inventory was submitted during this local preparation.

Exposure requires attacker-controlled SVG bytes to reach a vulnerable decoder plus the relevant runtime conditions. Current upload validation accepts structurally checked JPEG/PNG/WebP, and organization logo changes require Super Admin with JPEG/PNG validation. Export logo normalization does pass retained Storage bytes to sharp. This source review does not prove that every previously stored object is safe, establish the deployed native binary or Node PIE status, or establish exploitation. The source dependency is affected; actual live exploitability remains unverified. No production exploit probe or customer-data modification was performed.

## Local validation and remaining proof

- 203 focused tests passed across ten modules: statement source/presentation, fee transaction reports, P&L adapter, PDF/Excel/export parity, upload content, company logos and commercial document data.
- Regressions cover ordinary Finance direct-read denial, exact source identity, other organization/property/unit/currency, denied/missing projection, stale cursor, reversals, migrated dates, late settlements and more than 10,000 unrelated events.
- A real PDF/Excel builder test keeps a frozen USD 40 settlement against a USD 50 fee at opening USD 1,250 and closing USD 1,210; it checks readable attribution, unchanged model and deterministic artifact bytes.
- Full-project TypeScript and lint passed. Migration discipline passed against the local predecessor: 193 immutable migrations and zero newly added migrations in this follow-up. The candidate's existing business-date authorization migration remains unchanged and still requires the normal protected release path. Independent exact-diff review found no remaining blocking issue after historical-date and pagination corrections.
- These boundary mocks and local renders are not database role proof or a full publication/download journey. Corrected-head required CI, audit, the complete disposable Linux/browser journey, and protected release/alias verification remain necessary before calling the candidate live.

Application fixes, dependency fixes and planning/evidence documentation are separate commits. No shared local database reset or mutation, production financial testing, or deposit integration is included.
