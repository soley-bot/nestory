# Script lifecycle inventory

Generated from package commands, GitHub workflows, script imports, source references, and documentation mentions. A missing reference is an audit signal, not automatic permission to delete an operator tool.

## Summary

- default-gate: 35
- documented-operator: 6
- reusable-support: 21
- specialist-command: 54

## Inventory

| Script | Classification | Reference evidence |
| --- | --- | --- |
| `scripts/ci-deployment-gate.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `package:test:contracts` |
| `scripts/cleanup-paid-cost-storage-orphans-core.mjs` | reusable-support | `docs/repository/script-inventory.md`, `scripts/cleanup-paid-cost-storage-orphans.mjs`, `scripts/cleanup-paid-cost-storage-orphans.node-test.mjs` |
| `scripts/cleanup-paid-cost-storage-orphans.mjs` | documented-operator | `docs/repository/script-inventory.md` |
| `scripts/cleanup-paid-cost-storage-orphans.node-test.mjs` | documented-operator | `docs/repository/script-inventory.md` |
| `scripts/compare-ips-cutover-rehearsals.mjs` | documented-operator | `docs/repository/script-inventory.md`, `docs/runbooks/ips-cutover.md` |
| `scripts/document-evidence-storage-cleanup.node-test.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:documents:test-evidence-storage` |
| `scripts/document-evidence-storage.node-test.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:documents:test-evidence-storage`, `scripts/document-evidence-storage-cleanup.node-test.mjs` |
| `scripts/document-replacement-concurrency.node-test.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:documents:test-evidence-storage` |
| `scripts/document-storage-lifecycle-concurrency.node-test.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:documents:test-evidence-storage` |
| `scripts/generate-enterprise-frontend-evidence.mjs` | documented-operator | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md` |
| `scripts/generate-script-inventory.mjs` | specialist-command | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `package:repo:script-inventory` |
| `scripts/generate-unit-profit-loss-comparison.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:report:unit-profit-loss:compare`, `scripts/unit-profit-loss-comparison.node-test.mjs` |
| `scripts/hosted-demo-cutover-plan-core.mjs` | reusable-support | `docs/repository/script-inventory.md`, `scripts/hosted-demo-cutover-plan.mjs`, `scripts/hosted-demo-cutover-plan.node-test.mjs` |
| `scripts/hosted-demo-cutover-plan.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:demo:cutover:plan` |
| `scripts/hosted-demo-cutover-plan.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `package:test:contracts` |
| `scripts/ips-cutover-browser-contract.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `package:test:contracts` |
| `scripts/ips-cutover-concurrency.node-test.mjs` | specialist-command | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-11-track-9-ips-cutover.md`, `package:cutover:test-concurrency` |
| `scripts/ips-golden-setup-browser-contract.mjs` | reusable-support | `docs/repository/script-inventory.md`, `scripts/ips-golden-setup-browser-contract.node-test.mjs`, `scripts/smoke-ips-golden-setup.mjs` |
| `scripts/ips-golden-setup-browser-contract.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `package:test:contracts`, `package:test:ips-golden-setup-contract` |
| `scripts/ips-paid-cost-browser-contract.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-11-track-6-paid-cost.md`, `package:test:contracts` |
| `scripts/ips-paid-cost-fixture-contract.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-11-track-6-paid-cost.md`, `package:paid-cost:test-scenario-contract`, `package:test:contracts` |
| `scripts/ips-rent-scenario-concurrency.node-test.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:rent:test-concurrency` |
| `scripts/ips-rent-scenario-contract.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `package:rent:test-scenario-contract`, `package:test:contracts` |
| `scripts/lease-history-integrity-concurrency-contract.test.mjs` | default-gate | `docs/repository/script-inventory.md` |
| `scripts/lease-history-integrity-concurrency.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:leases:test-history-integrity`, `scripts/lease-history-integrity-concurrency-contract.test.mjs` |
| `scripts/lease-relationship-concurrency-contract.test.mjs` | default-gate | `docs/repository/script-inventory.md` |
| `scripts/lease-relationship-concurrency.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:leases:test-relationships`, `scripts/lease-relationship-concurrency-contract.test.mjs` |
| `scripts/lease-term-authority-concurrency-contract.test.mjs` | default-gate | `docs/repository/script-inventory.md` |
| `scripts/lease-term-authority-concurrency.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:leases:test-term-authority`, `scripts/lease-term-authority-concurrency-contract.test.mjs` |
| `scripts/load-owner-statement-publication-fixture.ts` | reusable-support | `docs/repository/script-inventory.md`, `scripts/load-test-fixture.mjs`, `scripts/owner-statement-publication-fixture-contract.node-test.mjs` |
| `scripts/load-paid-cost-scenarios-fixture.ts` | reusable-support | `docs/repository/script-inventory.md`, `scripts/load-test-fixture.mjs` |
| `scripts/load-test-fixture.mjs` | specialist-command | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-10-owner-statement-publication.md`, `package:db:test:fixture`, `scripts/document-evidence-storage.node-test.mjs`, `scripts/document-replacement-concurrency.node-test.mjs`, `scripts/document-storage-lifecycle-concurrency.node-test.mjs`, `scripts/ips-cutover-concurrency.node-test.mjs`, `scripts/ips-rent-scenario-concurrency.node-test.mjs`, `scripts/load-test-fixture.node-test.mjs`, `scripts/owner-balance-lifecycle-concurrency.node-test.mjs`, `scripts/owner-balance-lifecycle-correction-concurrency.node-test.mjs`, `scripts/owner-close-concurrency.node-test.mjs`, `scripts/owner-opening-balance-schema-concurrency.node-test.mjs`, `scripts/owner-opening-balance-workflow-concurrency.node-test.mjs`, `scripts/owner-roster-readiness-concurrency.node-test.mjs`, `scripts/owner-statement-artifact-storage.node-test.mjs`, `scripts/owner-statement-publication-concurrency.node-test.mjs`, `scripts/paid-cost-concurrency.node-test.mjs`, `scripts/report-owner-roster-preflight.mjs`, `scripts/smoke-fixture-finance-manager-day.mjs`, `scripts/smoke-fixture-owner-close.mjs`, `scripts/smoke-ips-cutover-browser-acceptance.mjs`, `scripts/smoke-ips-cutover-rehearsal.mjs`, `scripts/smoke-ips-golden-setup.mjs`, `scripts/smoke-ips-paid-cost-browser-acceptance.mjs`, `scripts/smoke-ips-paid-cost-scenarios.mjs`, `scripts/smoke-ips-rent-browser-acceptance.mjs`, `scripts/smoke-ips-rent-scenarios.mjs`, `scripts/smoke-owner-balance-browser-acceptance.mjs`, `scripts/smoke-owner-close-browser-acceptance.mjs`, `scripts/smoke-owner-opening-browser-acceptance.mjs`, `scripts/smoke-owner-statement-browser-acceptance.mjs` |
| `scripts/load-test-fixture.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `package:test:contracts` |
| `scripts/maintenance-automation-runner.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `package:maintenance:test-runner`, `package:test:contracts` |
| `scripts/migration-discipline-core.mjs` | reusable-support | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `scripts/migration-discipline-core.node-test.mjs`, `scripts/verify-migration-discipline.mjs` |
| `scripts/migration-discipline-core.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `package:test:contracts` |
| `scripts/migration-newline-portability.node-test.mjs` | default-gate | `docs/claude-handoff-from-codex-admin-onboarding-2026-08-12.md`, `docs/codex-handoff-admin-onboarding-2026-08-12.md`, `docs/repository/script-inventory.md`, `package:test:contracts` |
| `scripts/owner-balance-lifecycle-concurrency.node-test.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:owners:test-lifecycle` |
| `scripts/owner-balance-lifecycle-correction-concurrency.node-test.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:owners:test-lifecycle` |
| `scripts/owner-balance-lifecycle-fixture-contract.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `package:owners:test-lifecycle`, `package:test:contracts` |
| `scripts/owner-balance-lifecycle-loaded-fixture.node-test.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:owners:test-lifecycle`, `package:test:database:contracts` |
| `scripts/owner-close-browser-contract.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `package:test:contracts` |
| `scripts/owner-close-concurrency.node-test.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:owners:test-close` |
| `scripts/owner-opening-balance-schema-concurrency.node-test.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:owners:test-workflow` |
| `scripts/owner-opening-balance-workflow-concurrency.node-test.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:owners:test-workflow` |
| `scripts/owner-opening-fixture-contract.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `package:test:contracts` |
| `scripts/owner-roster-readiness-concurrency.node-test.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:owners:test-readiness` |
| `scripts/owner-statement-artifact-storage.node-test.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:owners:test-statement-storage` |
| `scripts/owner-statement-browser-contract.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-10-owner-statement-publication.md`, `package:test:contracts` |
| `scripts/owner-statement-publication-concurrency.node-test.mjs` | specialist-command | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-10-owner-statement-publication.md`, `package:owners:test-statement-publication` |
| `scripts/owner-statement-publication-fixture-contract.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-10-owner-statement-publication.md`, `package:test:contracts` |
| `scripts/paid-cost-concurrency.node-test.mjs` | specialist-command | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-11-track-6-paid-cost.md`, `package:paid-cost:test-concurrency`, `scripts/ips-paid-cost-fixture-contract.node-test.mjs` |
| `scripts/playwright-form-controls.mjs` | reusable-support | `docs/repository/script-inventory.md`, `scripts/smoke-ips-cutover-browser-acceptance.mjs`, `scripts/smoke-ips-rent-browser-acceptance.mjs`, `scripts/smoke-owner-balance-browser-acceptance.mjs`, `scripts/smoke-owner-close-browser-acceptance.mjs`, `scripts/smoke-owner-opening-browser-acceptance.mjs`, `scripts/smoke-owner-statement-browser-acceptance.mjs` |
| `scripts/report-owner-roster-preflight.mjs` | reusable-support | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-09-ips-operational-readiness-program.md`, `docs/superpowers/specs/2026-08-09-owner-balance-and-close-authority.md`, `scripts/report-owner-roster-preflight.node-test.mjs` |
| `scripts/report-owner-roster-preflight.node-test.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:owners:test-readiness` |
| `scripts/route-registry-core.mjs` | reusable-support | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `scripts/route-registry-core.node-test.mjs`, `scripts/smoke-authenticated-route-discoverability.mjs`, `scripts/verify-authenticated-route-discoverability.mjs` |
| `scripts/route-registry-core.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `package:test:contracts` |
| `scripts/run-maintenance-automation.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:maintenance:run-local`, `scripts/maintenance-automation-runner.node-test.mjs` |
| `scripts/run-supabase-portable.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:db:reset`, `package:supabase:start`, `scripts/supabase-portable-migrations.node-test.mjs` |
| `scripts/run-vitest-tier.mjs` | default-gate | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `package:test:ui`, `package:test:unit` |
| `scripts/script-inventory-core.mjs` | reusable-support | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `scripts/generate-script-inventory.mjs`, `scripts/script-inventory-core.node-test.mjs` |
| `scripts/script-inventory-core.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `package:test:contracts` |
| `scripts/sentry-autofix.mjs` | specialist-command | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-20-sentry-observability-and-autofix.md`, `package:sentry:autofix`, `scripts/sentry-autofix.node-test.mjs` |
| `scripts/sentry-autofix.node-test.mjs` | documented-operator | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-20-sentry-observability-and-autofix.md` |
| `scripts/smoke-authenticated-route-discoverability-core.mjs` | reusable-support | `docs/repository/script-inventory.md`, `scripts/smoke-authenticated-route-discoverability.mjs`, `scripts/smoke-authenticated-route-discoverability.node-test.mjs`, `scripts/verify-authenticated-route-discoverability.mjs` |
| `scripts/smoke-authenticated-route-discoverability.mjs` | specialist-command | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `package:test:fixture-route-discoverability` |
| `scripts/smoke-authenticated-route-discoverability.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `package:test:contracts` |
| `scripts/smoke-fixture-finance-manager-day.mjs` | specialist-command | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-09-ips-operational-readiness-program.md`, `package:test:fixture-finance-manager-day`, `scripts/smoke-fixture-finance-manager-day.node-test.mjs` |
| `scripts/smoke-fixture-finance-manager-day.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-09-ips-operational-readiness-program.md`, `package:test:contracts` |
| `scripts/smoke-fixture-owner-balance-lifecycle.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:test:fixture-owner-balance-lifecycle`, `scripts/owner-balance-lifecycle-loaded-fixture.node-test.mjs` |
| `scripts/smoke-fixture-owner-close.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:test:fixture-owner-close` |
| `scripts/smoke-fixture-owner-opening-balances.mjs` | specialist-command | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-09-ips-operational-readiness-program.md`, `package:test:fixture-owner-opening-balances`, `scripts/owner-opening-fixture-contract.node-test.mjs` |
| `scripts/smoke-fixture-owner-statement-publication.mjs` | specialist-command | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-10-owner-statement-publication.md`, `package:test:fixture-owner-statement-publication` |
| `scripts/smoke-fixture-role-journeys-core.mjs` | reusable-support | `docs/repository/script-inventory.md`, `scripts/smoke-fixture-role-journeys.mjs`, `scripts/smoke-fixture-role-journeys.node-test.mjs` |
| `scripts/smoke-fixture-role-journeys.mjs` | specialist-command | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-09-compact-end-to-end-local-fixture.md`, `docs/superpowers/plans/2026-08-09-ips-operational-readiness-program.md`, `package:test:fixture-roles` |
| `scripts/smoke-fixture-role-journeys.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `package:test:contracts` |
| `scripts/smoke-ips-cutover-browser-acceptance.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:cutover:test-browser`, `scripts/ips-cutover-browser-contract.node-test.mjs` |
| `scripts/smoke-ips-cutover-rehearsal.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:cutover:test-rehearsal` |
| `scripts/smoke-ips-golden-setup.mjs` | specialist-command | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-09-ips-operational-readiness-program.md`, `package:test:ips-golden-setup` |
| `scripts/smoke-ips-paid-cost-browser-acceptance.mjs` | specialist-command | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-11-track-6-paid-cost.md`, `package:paid-cost:test-browser`, `scripts/ips-paid-cost-browser-contract.node-test.mjs` |
| `scripts/smoke-ips-paid-cost-scenarios.mjs` | specialist-command | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-09-ips-operational-readiness-program.md`, `docs/superpowers/plans/2026-08-11-track-6-paid-cost.md`, `package:paid-cost:test-fixture`, `scripts/ips-paid-cost-fixture-contract.node-test.mjs` |
| `scripts/smoke-ips-rent-browser-acceptance.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:rent:test-browser`, `scripts/ips-rent-scenario-contract.node-test.mjs` |
| `scripts/smoke-ips-rent-scenarios.mjs` | specialist-command | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-09-ips-operational-readiness-program.md`, `package:rent:test-fixture`, `scripts/smoke-ips-rent-browser-acceptance.mjs` |
| `scripts/smoke-maintenance-mobile.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:test:maintenance-mobile` |
| `scripts/smoke-owner-balance-browser-acceptance.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:test:owner-balance-browser-acceptance`, `scripts/smoke-owner-balance-browser-acceptance.node-test.mjs` |
| `scripts/smoke-owner-balance-browser-acceptance.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `package:test:contracts` |
| `scripts/smoke-owner-close-browser-acceptance.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:test:owner-close-browser-acceptance`, `scripts/owner-close-browser-contract.node-test.mjs` |
| `scripts/smoke-owner-opening-browser-acceptance.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:test:owner-opening-browser-acceptance`, `scripts/owner-opening-fixture-contract.node-test.mjs` |
| `scripts/smoke-owner-statement-browser-acceptance.mjs` | specialist-command | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-10-owner-statement-publication.md`, `package:test:owner-statement-browser-acceptance`, `scripts/owner-statement-browser-contract.node-test.mjs` |
| `scripts/smoke-properties-flow.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:test:properties-flow` |
| `scripts/smoke-ui-redesign-artifacts.mjs` | reusable-support | `docs/repository/script-inventory.md`, `scripts/generate-enterprise-frontend-evidence.mjs`, `scripts/smoke-ui-redesign-policy.test.mjs`, `scripts/smoke-ui-redesign.mjs` |
| `scripts/smoke-ui-redesign-policy.mjs` | reusable-support | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-15-settings-redesign.md`, `scripts/generate-enterprise-frontend-evidence.mjs`, `scripts/ips-golden-setup-browser-contract.mjs`, `scripts/smoke-authenticated-route-discoverability.mjs`, `scripts/smoke-fixture-finance-manager-day.mjs`, `scripts/smoke-fixture-role-journeys.mjs`, `scripts/smoke-ips-cutover-browser-acceptance.mjs`, `scripts/smoke-ips-golden-setup.mjs`, `scripts/smoke-ips-paid-cost-browser-acceptance.mjs`, `scripts/smoke-ips-rent-browser-acceptance.mjs`, `scripts/smoke-maintenance-mobile.mjs`, `scripts/smoke-owner-balance-browser-acceptance.mjs`, `scripts/smoke-owner-close-browser-acceptance.mjs`, `scripts/smoke-owner-opening-browser-acceptance.mjs`, `scripts/smoke-owner-statement-browser-acceptance.mjs`, `scripts/smoke-ui-redesign-artifacts.mjs`, `scripts/smoke-ui-redesign-policy.test.mjs`, `scripts/smoke-ui-redesign.mjs` |
| `scripts/smoke-ui-redesign-policy.test.mjs` | default-gate | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-15-settings-redesign.md` |
| `scripts/smoke-ui-redesign.mjs` | specialist-command | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-09-ips-operational-readiness-program.md`, `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `docs/verification/enterprise-frontend-redesign-evidence.md`, `package:test:ui-a11y`, `package:test:ui-redesign`, `scripts/generate-enterprise-frontend-evidence.mjs` |
| `scripts/supabase-portable-migrations.mjs` | reusable-support | `docs/repository/script-inventory.md`, `scripts/run-supabase-portable.mjs`, `scripts/supabase-portable-migrations.node-test.mjs` |
| `scripts/supabase-portable-migrations.node-test.mjs` | documented-operator | `docs/repository/script-inventory.md` |
| `scripts/target-org-dump-core.mjs` | reusable-support | `docs/repository/script-inventory.md`, `scripts/target-org-dump.node-test.mjs` |
| `scripts/target-org-dump.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `package:test:contracts` |
| `scripts/unit-profit-loss-comparison-core.mjs` | reusable-support | `docs/repository/script-inventory.md`, `scripts/generate-unit-profit-loss-comparison.mjs`, `scripts/unit-profit-loss-comparison.node-test.mjs` |
| `scripts/unit-profit-loss-comparison.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `package:test:contracts` |
| `scripts/verify-authenticated-route-discoverability.mjs` | specialist-command | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `package:test:route-discoverability`, `scripts/verify-authenticated-route-discoverability.node-test.mjs` |
| `scripts/verify-authenticated-route-discoverability.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `package:test:contracts` |
| `scripts/verify-ips-cutover-manifest.mjs` | reusable-support | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-09-ips-operational-readiness-program.md`, `scripts/smoke-ips-cutover-rehearsal.mjs`, `scripts/verify-ips-cutover-manifest.node-test.mjs` |
| `scripts/verify-ips-cutover-manifest.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-11-track-9-ips-cutover.md`, `package:cutover:test-manifest`, `package:test:contracts` |
| `scripts/verify-migration-discipline.mjs` | specialist-command | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `package:db:verify-migrations` |
| `scripts/verify-release-parity.mjs` | specialist-command | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-09-ips-operational-readiness-program.md`, `package:release:verify-local`, `scripts/verify-release-parity.node-test.mjs` |
| `scripts/verify-release-parity.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `package:release:test-parity`, `package:test:contracts` |
| `scripts/verify-ui-copy-scanner.mjs` | reusable-support | `docs/repository/script-inventory.md`, `scripts/verify-ui-copy-scanner.test.mjs`, `scripts/verify-ui-copy.mjs` |
| `scripts/verify-ui-copy-scanner.test.mjs` | default-gate | `docs/repository/script-inventory.md` |
| `scripts/verify-ui-copy.mjs` | specialist-command | `docs/codex-ui-ux-remediation-prompt.md`, `docs/repository/script-inventory.md`, `docs/ui-ux-audit-2026-08-12.md`, `package:test:ui-copy` |
| `scripts/verify-ui-route-coverage.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:test:ui-coverage` |
| `scripts/vitest-tier-core.mjs` | reusable-support | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `scripts/run-vitest-tier.mjs`, `scripts/vitest-tier-core.node-test.mjs` |
| `scripts/vitest-tier-core.node-test.mjs` | default-gate | `docs/repository/script-inventory.md`, `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `package:test:contracts` |
| `scripts/workspace-provision-core.mjs` | reusable-support | `docs/codex-handoff-admin-onboarding-2026-08-12.md`, `docs/repository/script-inventory.md`, `docs/ui-ux-audit-admin-onboarding-invites-2026-08-12.md`, `scripts/workspace-provision-core.test.mjs`, `scripts/workspace-provision.mjs` |
| `scripts/workspace-provision-core.test.mjs` | default-gate | `docs/repository/script-inventory.md` |
| `scripts/workspace-provision.mjs` | specialist-command | `docs/repository/script-inventory.md`, `package:workspace:provision` |

## Unreferenced review queue

No unreferenced scripts.
