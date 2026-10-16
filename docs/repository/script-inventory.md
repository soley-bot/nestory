# Script lifecycle inventory

Generated from package commands, GitHub workflows, script imports, source references, and documentation mentions. A missing reference is an audit signal, not automatic permission to delete an operator tool.

## Summary

- default-gate: 52
- documented-operator: 9
- reusable-support: 42
- specialist-command: 66
- unreferenced: 3
- workflow-gate: 7

## Inventory

| Script | Classification | Reference evidence |
| --- | --- | --- |
| `scripts/audit-dependencies.mjs` | specialist-command | `package:security:audit`, `scripts/security-guardrails.node-test.mjs` |
| `scripts/business-date-access.node-test.mjs` | default-gate | `package:test:contracts` |
| `scripts/capture-feature-layout.mjs` | documented-operator | `docs/design/feature-long-text-coverage-20261004.md` |
| `scripts/chart-of-accounts-fixture-contract.node-test.mjs` | specialist-command | `package:test:chart-fixture-contract` |
| `scripts/ci-deployment-gate.node-test.mjs` | default-gate | `docs/superpowers/plans/2026-08-21-supabase-migration-history-reconciliation.md`, `package:test:contracts` |
| `scripts/cleanup-paid-cost-storage-orphans-core.mjs` | reusable-support | `scripts/cleanup-paid-cost-storage-orphans.mjs`, `scripts/cleanup-paid-cost-storage-orphans.node-test.mjs` |
| `scripts/cleanup-paid-cost-storage-orphans.mjs` | documented-operator | `docs/repository/legacy-test-compatibility-inventory.md` |
| `scripts/cleanup-paid-cost-storage-orphans.node-test.mjs` | default-gate | `docs/repository/legacy-test-compatibility-inventory.md`, `package:test:contracts` |
| `scripts/compare-ips-cutover-rehearsals.mjs` | documented-operator | `docs/runbooks/ips-cutover.md` |
| `scripts/daily-fixture-identities.mjs` | reusable-support | `scripts/daily-workflow-contract.mjs`, `scripts/daily-workflow-contract.test.mjs`, `scripts/load-owner-statement-publication-fixture.ts`, `scripts/load-paid-cost-scenarios-fixture.ts`, `scripts/load-test-fixture.mjs` |
| `scripts/daily-workflow-browser.config.mjs` | workflow-gate | `.github/workflows/daily-workflow-acceptance.yml` |
| `scripts/daily-workflow-contract.mjs` | reusable-support | `scripts/daily-workflow-contract.test.mjs`, `scripts/run-daily-workflow-ci.mjs`, `scripts/smoke-daily-workflow.mjs` |
| `scripts/daily-workflow-contract.test.mjs` | default-gate | `.github/workflows/daily-workflow-acceptance.yml` |
| `scripts/daily-workflow-download.browser.mjs` | reusable-support | `scripts/daily-workflow-browser.config.mjs` |
| `scripts/daily-workflow-download.mjs` | reusable-support | `scripts/daily-workflow-download.browser.mjs`, `scripts/rent-readiness-target.mjs`, `scripts/smoke-daily-workflow.mjs`, `scripts/smoke-ips-rent-readiness.mjs` |
| `scripts/daily-workflow-policy.mjs` | reusable-support | `scripts/daily-fixture-identities.mjs`, `scripts/daily-workflow-policy.node-test.mjs`, `scripts/run-daily-workflow-ci.mjs`, `scripts/smoke-daily-workflow.mjs` |
| `scripts/daily-workflow-policy.node-test.mjs` | workflow-gate | `.github/workflows/daily-workflow-acceptance.yml` |
| `scripts/deposit-candidate-target.mjs` | reusable-support | `scripts/deposit-candidate-target.node-test.mjs`, `scripts/ips-integrated-readiness-fixture.mjs`, `scripts/maintenance-automation-runs-target.mjs`, `scripts/property-concurrency-target.mjs`, `scripts/rent-readiness-target.mjs`, `scripts/test-deposit-candidate-local.mjs`, `scripts/test-deposit-custody-concurrency.mjs` |
| `scripts/deposit-candidate-target.node-test.mjs` | default-gate | `.github/workflows/ci.yml`, `package:test:contracts` |
| `scripts/deposit-rent-approved-command-model.mjs` | documented-operator | `src/features/leases/local-deposit-rent/workflow.test-fixture.ts` |
| `scripts/deposit-rent-command-model.mjs` | reusable-support | `scripts/deposit-rent-approved-command-model.mjs` |
| `scripts/document-evidence-storage-cleanup.node-test.mjs` | specialist-command | `package:documents:test-evidence-storage` |
| `scripts/document-evidence-storage.node-test.mjs` | specialist-command | `package:documents:test-evidence-storage`, `scripts/document-evidence-storage-cleanup.node-test.mjs` |
| `scripts/document-replacement-concurrency.node-test.mjs` | specialist-command | `package:documents:test-evidence-storage` |
| `scripts/document-storage-lifecycle-concurrency.node-test.mjs` | specialist-command | `package:documents:test-evidence-storage` |
| `scripts/generate-enterprise-frontend-evidence.mjs` | documented-operator | `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md` |
| `scripts/generate-script-inventory.mjs` | specialist-command | `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `docs/superpowers/plans/2026-08-24-legacy-test-compatibility-cleanup.md`, `package:repo:script-inventory` |
| `scripts/generate-unit-profit-loss-comparison.mjs` | specialist-command | `package:report:unit-profit-loss:compare`, `scripts/unit-profit-loss-comparison.node-test.mjs` |
| `scripts/historical-rent-correction-concurrency.node-test.mjs` | specialist-command | `package:rent:test-correction-concurrency` |
| `scripts/hosted-demo-cutover-plan-core.mjs` | reusable-support | `scripts/hosted-demo-cutover-plan.mjs`, `scripts/hosted-demo-cutover-plan.node-test.mjs` |
| `scripts/hosted-demo-cutover-plan.mjs` | specialist-command | `package:demo:cutover:plan` |
| `scripts/hosted-demo-cutover-plan.node-test.mjs` | default-gate | `package:test:contracts` |
| `scripts/hosted-migration-parity-core.mjs` | reusable-support | `docs/superpowers/plans/2026-08-21-supabase-migration-history-reconciliation.md`, `scripts/hosted-migration-parity-core.node-test.mjs`, `scripts/rent-readiness-target.mjs`, `scripts/rent-readiness-target.node-test.mjs`, `scripts/verify-hosted-migration-parity.mjs` |
| `scripts/hosted-migration-parity-core.node-test.mjs` | default-gate | `docs/superpowers/plans/2026-08-21-supabase-migration-history-reconciliation.md`, `package:test:contracts` |
| `scripts/ips-cutover-browser-contract.node-test.mjs` | default-gate | `package:test:contracts` |
| `scripts/ips-cutover-concurrency.node-test.mjs` | specialist-command | `docs/superpowers/plans/2026-08-11-track-9-ips-cutover.md`, `package:cutover:test-concurrency` |
| `scripts/ips-golden-setup-browser-contract.mjs` | reusable-support | `scripts/ips-golden-setup-browser-contract.node-test.mjs`, `scripts/smoke-ips-golden-setup.mjs` |
| `scripts/ips-golden-setup-browser-contract.node-test.mjs` | default-gate | `package:test:contracts`, `package:test:ips-golden-setup-contract` |
| `scripts/ips-integrated-readiness-browser.mjs` | documented-operator | `docs/verification/ips-readiness-2026-10-14.md` |
| `scripts/ips-integrated-readiness-fixture.mjs` | reusable-support | `docs/verification/ips-readiness-2026-10-14.md`, `scripts/ips-integrated-readiness-browser.mjs`, `scripts/ips-integrated-readiness.node-test.mjs`, `scripts/rent-readiness-target.mjs`, `scripts/rent-readiness-target.node-test.mjs`, `scripts/smoke-ips-rent-readiness.mjs` |
| `scripts/ips-integrated-readiness.node-test.mjs` | default-gate | `package:test:contracts` |
| `scripts/ips-paid-cost-browser-contract.node-test.mjs` | default-gate | `docs/superpowers/plans/2026-08-11-track-6-paid-cost.md`, `package:test:contracts` |
| `scripts/ips-paid-cost-fixture-contract.node-test.mjs` | default-gate | `docs/superpowers/plans/2026-08-11-track-6-paid-cost.md`, `package:paid-cost:test-scenario-contract`, `package:test:contracts` |
| `scripts/ips-readiness-recovery-core.mjs` | reusable-support | `docs/runbooks/ips-recovery-and-rollback.md`, `scripts/ips-readiness-recovery.mjs`, `scripts/ips-readiness-recovery.node-test.mjs`, `scripts/owner-statement-readiness-core.mjs`, `scripts/owner-statement-readiness.node-test.mjs`, `scripts/rent-readiness-target.mjs`, `scripts/rent-readiness-target.node-test.mjs`, `scripts/smoke-ips-owner-statement-readiness.mjs`, `scripts/smoke-ips-rent-readiness.mjs` |
| `scripts/ips-readiness-recovery.mjs` | documented-operator | `docs/runbooks/ips-recovery-and-rollback.md`, `docs/verification/ips-readiness-2026-10-14.md` |
| `scripts/ips-readiness-recovery.node-test.mjs` | default-gate | `docs/runbooks/ips-recovery-and-rollback.md`, `package:test:contracts` |
| `scripts/ips-rent-scenario-concurrency.node-test.mjs` | specialist-command | `package:rent:test-concurrency` |
| `scripts/ips-rent-scenario-contract.node-test.mjs` | default-gate | `package:rent:test-scenario-contract`, `package:test:contracts` |
| `scripts/lease-deposit-lifecycle-concurrency.node-test.mjs` | workflow-gate | `.github/workflows/ci.yml` |
| `scripts/lease-history-integrity-concurrency-contract.test.mjs` | default-gate | None found |
| `scripts/lease-history-integrity-concurrency.mjs` | specialist-command | `package:leases:test-history-integrity`, `scripts/lease-history-integrity-concurrency-contract.test.mjs` |
| `scripts/lease-relationship-concurrency-contract.test.mjs` | default-gate | None found |
| `scripts/lease-relationship-concurrency.mjs` | specialist-command | `package:leases:test-relationships`, `scripts/lease-relationship-concurrency-contract.test.mjs` |
| `scripts/lease-term-authority-concurrency-contract.test.mjs` | default-gate | None found |
| `scripts/lease-term-authority-concurrency.mjs` | specialist-command | `package:leases:test-term-authority`, `scripts/lease-term-authority-concurrency-contract.test.mjs` |
| `scripts/legacy-deposit-default-concurrency.node-test.mjs` | specialist-command | `package:leases:test-deposit-default` |
| `scripts/load-owner-statement-publication-fixture.ts` | reusable-support | `scripts/load-test-fixture.mjs`, `scripts/owner-statement-publication-fixture-contract.node-test.mjs` |
| `scripts/load-paid-cost-scenarios-fixture.ts` | reusable-support | `scripts/load-test-fixture.mjs` |
| `scripts/load-test-fixture.mjs` | specialist-command | `docs/superpowers/plans/2026-08-10-owner-statement-publication.md`, `package:db:test:fixture`, `scripts/document-evidence-storage.node-test.mjs`, `scripts/document-replacement-concurrency.node-test.mjs`, `scripts/document-storage-lifecycle-concurrency.node-test.mjs`, `scripts/historical-rent-correction-concurrency.node-test.mjs`, `scripts/ips-cutover-concurrency.node-test.mjs`, `scripts/ips-rent-scenario-concurrency.node-test.mjs`, `scripts/lease-deposit-lifecycle-concurrency.node-test.mjs`, `scripts/legacy-deposit-default-concurrency.node-test.mjs`, `scripts/load-test-fixture.node-test.mjs`, `scripts/owner-balance-lifecycle-concurrency.node-test.mjs`, `scripts/owner-balance-lifecycle-correction-concurrency.node-test.mjs`, `scripts/owner-close-concurrency.node-test.mjs`, `scripts/owner-opening-balance-schema-concurrency.node-test.mjs`, `scripts/owner-opening-balance-workflow-concurrency.node-test.mjs`, `scripts/owner-roster-readiness-concurrency.node-test.mjs`, `scripts/owner-statement-artifact-storage.node-test.mjs`, `scripts/owner-statement-publication-concurrency.node-test.mjs`, `scripts/paid-cost-concurrency.node-test.mjs`, `scripts/photo-logo-storage-concurrency.node-test.mjs`, `scripts/report-owner-roster-preflight.mjs`, `scripts/run-daily-workflow-ci.mjs`, `scripts/smoke-daily-workflow.mjs`, `scripts/smoke-fixture-finance-manager-day.mjs`, `scripts/smoke-fixture-owner-balance-lifecycle.mjs`, `scripts/smoke-fixture-owner-close.mjs`, `scripts/smoke-ips-cutover-browser-acceptance.mjs`, `scripts/smoke-ips-cutover-rehearsal.mjs`, `scripts/smoke-ips-golden-setup.mjs`, `scripts/smoke-ips-paid-cost-browser-acceptance.mjs`, `scripts/smoke-ips-paid-cost-scenarios.mjs`, `scripts/smoke-ips-rent-browser-acceptance.mjs`, `scripts/smoke-ips-rent-scenarios.mjs`, `scripts/smoke-owner-balance-browser-acceptance.mjs`, `scripts/smoke-owner-close-browser-acceptance.mjs`, `scripts/smoke-owner-opening-browser-acceptance.mjs`, `scripts/smoke-owner-statement-browser-acceptance.mjs` |
| `scripts/load-test-fixture.node-test.mjs` | default-gate | `docs/repository/legacy-test-compatibility-inventory.md`, `docs/superpowers/plans/2026-08-24-legacy-test-compatibility-cleanup.md`, `package:test:contracts` |
| `scripts/local-fixture-credentials.ts` | unreferenced | None found |
| `scripts/local-recovery-docker.mjs` | reusable-support | `docs/runbooks/ips-recovery-and-rollback.md`, `scripts/deposit-candidate-target.node-test.mjs`, `scripts/ips-integrated-readiness-fixture.mjs`, `scripts/ips-readiness-recovery.mjs`, `scripts/maintenance-automation-runs-target.mjs`, `scripts/property-concurrency-target.mjs`, `scripts/rehearse-synthetic-recovery.mjs`, `scripts/rent-readiness-target.mjs`, `scripts/rent-readiness-target.node-test.mjs`, `scripts/smoke-ips-owner-statement-readiness.mjs`, `scripts/synthetic-recovery.node-test.mjs`, `scripts/test-deposit-candidate-local.mjs`, `scripts/test-deposit-statement-reader-local.mjs` |
| `scripts/maintenance-automation-runner.node-test.mjs` | default-gate | `docs/runbooks/background-jobs-and-recovery.md`, `docs/superpowers/plans/2026-08-26-second-wave-security-remediation.md`, `package:maintenance:test-runner`, `package:test:contracts` |
| `scripts/maintenance-automation-runs-target.mjs` | reusable-support | `scripts/maintenance-automation-runs-target.node-test.mjs`, `scripts/maintenance-automation-runs.integration.mjs` |
| `scripts/maintenance-automation-runs-target.node-test.mjs` | default-gate | `package:test:contracts` |
| `scripts/maintenance-automation-runs.integration.mjs` | specialist-command | `package:maintenance:test-runs` |
| `scripts/maintenance-run-health.mjs` | specialist-command | `package:maintenance:health`, `scripts/maintenance-run-health.node-test.mjs` |
| `scripts/maintenance-run-health.node-test.mjs` | default-gate | `package:test:contracts` |
| `scripts/migration-discipline-core.mjs` | reusable-support | `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `docs/superpowers/plans/2026-08-21-supabase-migration-history-reconciliation.md`, `scripts/migration-discipline-core.node-test.mjs`, `scripts/verify-migration-discipline.mjs` |
| `scripts/migration-discipline-core.node-test.mjs` | default-gate | `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `docs/superpowers/plans/2026-08-21-supabase-migration-history-reconciliation.md`, `package:test:contracts` |
| `scripts/migration-newline-portability.node-test.mjs` | default-gate | `docs/claude-handoff-from-codex-admin-onboarding-2026-08-12.md`, `docs/codex-handoff-admin-onboarding-2026-08-12.md`, `package:test:contracts` |
| `scripts/next-eslint-glob.node-test.mjs` | default-gate | `package:test:contracts` |
| `scripts/owner-balance-lifecycle-concurrency.node-test.mjs` | specialist-command | `package:owners:test-lifecycle` |
| `scripts/owner-balance-lifecycle-correction-concurrency.node-test.mjs` | specialist-command | `package:owners:test-lifecycle` |
| `scripts/owner-balance-lifecycle-fixture-contract.node-test.mjs` | default-gate | `package:owners:test-lifecycle`, `package:test:contracts` |
| `scripts/owner-balance-lifecycle-loaded-fixture.node-test.mjs` | specialist-command | `package:owners:test-lifecycle`, `package:test:database:contracts` |
| `scripts/owner-close-browser-contract.node-test.mjs` | default-gate | `package:test:contracts` |
| `scripts/owner-close-concurrency.node-test.mjs` | specialist-command | `package:owners:test-close` |
| `scripts/owner-opening-balance-schema-concurrency.node-test.mjs` | specialist-command | `package:owners:test-workflow` |
| `scripts/owner-opening-balance-workflow-concurrency.node-test.mjs` | specialist-command | `package:owners:test-workflow` |
| `scripts/owner-opening-fixture-contract.node-test.mjs` | default-gate | `package:test:contracts` |
| `scripts/owner-roster-readiness-concurrency.node-test.mjs` | specialist-command | `package:owners:test-readiness` |
| `scripts/owner-statement-artifact-storage.node-test.mjs` | specialist-command | `package:owners:test-statement-storage` |
| `scripts/owner-statement-browser-contract.node-test.mjs` | default-gate | `docs/superpowers/plans/2026-08-10-owner-statement-publication.md`, `package:test:contracts` |
| `scripts/owner-statement-publication-concurrency.node-test.mjs` | specialist-command | `docs/superpowers/plans/2026-08-10-owner-statement-publication.md`, `package:owners:test-statement-publication` |
| `scripts/owner-statement-publication-fixture-contract.node-test.mjs` | default-gate | `docs/superpowers/plans/2026-08-10-owner-statement-publication.md`, `package:test:contracts` |
| `scripts/owner-statement-readiness-core.mjs` | reusable-support | `docs/verification/ips-readiness-2026-10-14.md`, `scripts/owner-statement-readiness.node-test.mjs`, `scripts/smoke-ips-owner-statement-readiness.mjs` |
| `scripts/owner-statement-readiness.node-test.mjs` | default-gate | `docs/verification/ips-readiness-2026-10-14.md`, `package:test:contracts` |
| `scripts/paid-cost-concurrency.node-test.mjs` | specialist-command | `docs/superpowers/plans/2026-08-11-track-6-paid-cost.md`, `package:paid-cost:test-concurrency`, `scripts/ips-paid-cost-fixture-contract.node-test.mjs` |
| `scripts/paid-cost-fixture-periods.test.ts` | default-gate | None found |
| `scripts/paid-cost-fixture-periods.ts` | unreferenced | None found |
| `scripts/photo-logo-storage-concurrency.node-test.mjs` | workflow-gate | `.github/workflows/ci.yml` |
| `scripts/playwright-form-controls.mjs` | reusable-support | `scripts/rent-readiness-target.mjs`, `scripts/smoke-daily-workflow.mjs`, `scripts/smoke-ips-cutover-browser-acceptance.mjs`, `scripts/smoke-ips-rent-browser-acceptance.mjs`, `scripts/smoke-ips-rent-readiness.mjs`, `scripts/smoke-owner-balance-browser-acceptance.mjs`, `scripts/smoke-owner-close-browser-acceptance.mjs`, `scripts/smoke-owner-opening-browser-acceptance.mjs`, `scripts/smoke-owner-statement-browser-acceptance.mjs` |
| `scripts/property-checked-update-concurrency.node-test.mjs` | specialist-command | `package:properties:test-concurrency` |
| `scripts/property-concurrency-target.mjs` | reusable-support | `scripts/deposit-candidate-target.node-test.mjs`, `scripts/property-checked-update-concurrency.node-test.mjs` |
| `scripts/rehearse-synthetic-recovery.mjs` | specialist-command | `package:recovery:rehearse-synthetic` |
| `scripts/rent-readiness-target.mjs` | reusable-support | `scripts/rent-readiness-target.node-test.mjs`, `scripts/smoke-ips-rent-readiness.mjs` |
| `scripts/rent-readiness-target.node-test.mjs` | default-gate | `package:test:contracts` |
| `scripts/report-owner-roster-preflight.mjs` | reusable-support | `docs/superpowers/plans/2026-08-09-ips-operational-readiness-program.md`, `docs/superpowers/specs/2026-08-09-owner-balance-and-close-authority.md`, `scripts/report-owner-roster-preflight.node-test.mjs` |
| `scripts/report-owner-roster-preflight.node-test.mjs` | specialist-command | `package:owners:test-readiness` |
| `scripts/route-registry-core.mjs` | reusable-support | `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `scripts/route-registry-core.node-test.mjs`, `scripts/smoke-authenticated-route-discoverability.mjs`, `scripts/verify-authenticated-route-discoverability.mjs` |
| `scripts/route-registry-core.node-test.mjs` | default-gate | `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `package:test:contracts` |
| `scripts/run-daily-workflow-ci.mjs` | workflow-gate | `.github/workflows/daily-workflow-acceptance.yml` |
| `scripts/run-maintenance-automation.mjs` | specialist-command | `docs/runbooks/background-jobs-and-recovery.md`, `docs/runbooks/ips-monitoring.md`, `docs/superpowers/plans/2026-08-26-second-wave-security-remediation.md`, `package:maintenance:run-local`, `scripts/maintenance-automation-runner.node-test.mjs` |
| `scripts/run-supabase-portable.mjs` | specialist-command | `package:db:reset`, `package:supabase:start`, `scripts/run-daily-workflow-ci.mjs`, `scripts/supabase-portable-migrations.node-test.mjs` |
| `scripts/run-vitest-tier.mjs` | default-gate | `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `package:test:ui`, `package:test:unit` |
| `scripts/script-inventory-core.mjs` | reusable-support | `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `docs/superpowers/plans/2026-08-24-legacy-test-compatibility-cleanup.md`, `scripts/generate-script-inventory.mjs`, `scripts/script-inventory-core.node-test.mjs` |
| `scripts/script-inventory-core.node-test.mjs` | default-gate | `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `docs/superpowers/plans/2026-08-24-legacy-test-compatibility-cleanup.md`, `package:test:contracts` |
| `scripts/secret-scan-core.mjs` | reusable-support | `docs/superpowers/plans/2026-08-26-second-wave-security-remediation.md`, `scripts/security-guardrails.node-test.mjs`, `scripts/verify-repository-secrets.mjs` |
| `scripts/security-guardrails.node-test.mjs` | default-gate | `docs/superpowers/plans/2026-08-26-second-wave-security-remediation.md`, `package:test:contracts` |
| `scripts/sentry-autofix.mjs` | specialist-command | `docs/superpowers/plans/2026-08-20-sentry-observability-and-autofix.md`, `package:sentry:autofix`, `scripts/sentry-autofix.node-test.mjs` |
| `scripts/sentry-autofix.node-test.mjs` | default-gate | `docs/repository/legacy-test-compatibility-inventory.md`, `docs/superpowers/plans/2026-08-20-sentry-observability-and-autofix.md`, `package:test:contracts` |
| `scripts/shared-drawer-capture.mjs` | documented-operator | `docs/previews/shared-spacing-20261004.md` |
| `scripts/shared-register-capture.mjs` | unreferenced | None found |
| `scripts/smoke-authenticated-route-discoverability-core.mjs` | reusable-support | `scripts/smoke-authenticated-route-discoverability.mjs`, `scripts/smoke-authenticated-route-discoverability.node-test.mjs`, `scripts/verify-authenticated-route-discoverability.mjs` |
| `scripts/smoke-authenticated-route-discoverability.mjs` | specialist-command | `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `package:test:fixture-route-discoverability`, `scripts/smoke-authenticated-route-discoverability.node-test.mjs` |
| `scripts/smoke-authenticated-route-discoverability.node-test.mjs` | default-gate | `package:test:contracts` |
| `scripts/smoke-daily-workflow.mjs` | workflow-gate | `.github/workflows/daily-workflow-acceptance.yml`, `scripts/daily-workflow-contract.test.mjs`, `scripts/run-daily-workflow-ci.mjs` |
| `scripts/smoke-fixture-finance-manager-day.mjs` | specialist-command | `docs/superpowers/plans/2026-08-09-ips-operational-readiness-program.md`, `package:test:fixture-finance-manager-day`, `scripts/smoke-fixture-finance-manager-day.node-test.mjs` |
| `scripts/smoke-fixture-finance-manager-day.node-test.mjs` | default-gate | `docs/superpowers/plans/2026-08-09-ips-operational-readiness-program.md`, `package:test:contracts` |
| `scripts/smoke-fixture-owner-balance-lifecycle.mjs` | specialist-command | `package:test:fixture-owner-balance-lifecycle`, `scripts/owner-balance-lifecycle-loaded-fixture.node-test.mjs` |
| `scripts/smoke-fixture-owner-close.mjs` | specialist-command | `package:test:fixture-owner-close` |
| `scripts/smoke-fixture-owner-opening-balances.mjs` | specialist-command | `docs/superpowers/plans/2026-08-09-ips-operational-readiness-program.md`, `package:test:fixture-owner-opening-balances`, `scripts/owner-opening-fixture-contract.node-test.mjs` |
| `scripts/smoke-fixture-owner-statement-publication.mjs` | specialist-command | `docs/superpowers/plans/2026-08-10-owner-statement-publication.md`, `package:test:fixture-owner-statement-publication` |
| `scripts/smoke-fixture-role-journeys-core.mjs` | reusable-support | `scripts/smoke-fixture-role-journeys.mjs`, `scripts/smoke-fixture-role-journeys.node-test.mjs` |
| `scripts/smoke-fixture-role-journeys.mjs` | specialist-command | `docs/superpowers/plans/2026-08-09-compact-end-to-end-local-fixture.md`, `docs/superpowers/plans/2026-08-09-ips-operational-readiness-program.md`, `package:test:fixture-roles` |
| `scripts/smoke-fixture-role-journeys.node-test.mjs` | default-gate | `package:test:contracts` |
| `scripts/smoke-ips-cutover-browser-acceptance.mjs` | specialist-command | `package:cutover:test-browser`, `scripts/ips-cutover-browser-contract.node-test.mjs` |
| `scripts/smoke-ips-cutover-rehearsal.mjs` | specialist-command | `package:cutover:test-rehearsal` |
| `scripts/smoke-ips-golden-setup.mjs` | specialist-command | `docs/superpowers/plans/2026-08-09-ips-operational-readiness-program.md`, `package:test:ips-golden-setup` |
| `scripts/smoke-ips-owner-statement-readiness.mjs` | reusable-support | `docs/verification/ips-readiness-2026-10-14.md`, `scripts/owner-statement-readiness.node-test.mjs` |
| `scripts/smoke-ips-paid-cost-browser-acceptance.mjs` | specialist-command | `docs/superpowers/plans/2026-08-11-track-6-paid-cost.md`, `package:paid-cost:test-browser`, `scripts/ips-paid-cost-browser-contract.node-test.mjs` |
| `scripts/smoke-ips-paid-cost-scenarios.mjs` | specialist-command | `docs/superpowers/plans/2026-08-09-ips-operational-readiness-program.md`, `docs/superpowers/plans/2026-08-11-track-6-paid-cost.md`, `package:paid-cost:test-fixture`, `scripts/ips-paid-cost-fixture-contract.node-test.mjs` |
| `scripts/smoke-ips-rent-browser-acceptance.mjs` | specialist-command | `package:rent:test-browser`, `scripts/ips-rent-scenario-contract.node-test.mjs` |
| `scripts/smoke-ips-rent-readiness.mjs` | reusable-support | `docs/verification/ips-readiness-2026-10-14.md`, `scripts/rent-readiness-target.mjs`, `scripts/rent-readiness-target.node-test.mjs` |
| `scripts/smoke-ips-rent-scenarios.mjs` | specialist-command | `docs/superpowers/plans/2026-08-09-ips-operational-readiness-program.md`, `package:rent:test-fixture`, `scripts/smoke-ips-rent-browser-acceptance.mjs` |
| `scripts/smoke-maintenance-mobile.mjs` | specialist-command | `package:test:maintenance-mobile` |
| `scripts/smoke-owner-balance-browser-acceptance.mjs` | specialist-command | `package:test:owner-balance-browser-acceptance`, `scripts/smoke-owner-balance-browser-acceptance.node-test.mjs` |
| `scripts/smoke-owner-balance-browser-acceptance.node-test.mjs` | default-gate | `package:test:contracts` |
| `scripts/smoke-owner-close-browser-acceptance.mjs` | specialist-command | `package:test:owner-close-browser-acceptance`, `scripts/owner-close-browser-contract.node-test.mjs` |
| `scripts/smoke-owner-opening-browser-acceptance.mjs` | specialist-command | `package:test:owner-opening-browser-acceptance`, `scripts/owner-opening-fixture-contract.node-test.mjs` |
| `scripts/smoke-owner-statement-browser-acceptance.mjs` | specialist-command | `docs/superpowers/plans/2026-08-10-owner-statement-publication.md`, `package:test:owner-statement-browser-acceptance`, `scripts/owner-statement-browser-contract.node-test.mjs` |
| `scripts/smoke-properties-flow-policy.mjs` | reusable-support | `docs/superpowers/plans/2026-08-26-second-wave-security-remediation.md`, `scripts/smoke-properties-flow-policy.node-test.mjs`, `scripts/smoke-properties-flow.mjs` |
| `scripts/smoke-properties-flow-policy.node-test.mjs` | default-gate | `docs/superpowers/plans/2026-08-26-second-wave-security-remediation.md`, `package:test:contracts` |
| `scripts/smoke-properties-flow.mjs` | specialist-command | `docs/superpowers/plans/2026-08-26-second-wave-security-remediation.md`, `package:test:properties-flow` |
| `scripts/smoke-ui-redesign-artifacts.mjs` | reusable-support | `scripts/generate-enterprise-frontend-evidence.mjs`, `scripts/smoke-ui-redesign-policy.test.mjs`, `scripts/smoke-ui-redesign.mjs` |
| `scripts/smoke-ui-redesign-policy.mjs` | reusable-support | `docs/superpowers/plans/2026-08-15-settings-redesign.md`, `docs/superpowers/plans/2026-08-26-second-wave-security-remediation.md`, `scripts/generate-enterprise-frontend-evidence.mjs`, `scripts/ips-golden-setup-browser-contract.mjs`, `scripts/smoke-authenticated-route-discoverability.mjs`, `scripts/smoke-fixture-finance-manager-day.mjs`, `scripts/smoke-fixture-role-journeys.mjs`, `scripts/smoke-ips-cutover-browser-acceptance.mjs`, `scripts/smoke-ips-golden-setup.mjs`, `scripts/smoke-ips-paid-cost-browser-acceptance.mjs`, `scripts/smoke-ips-rent-browser-acceptance.mjs`, `scripts/smoke-maintenance-mobile.mjs`, `scripts/smoke-owner-balance-browser-acceptance.mjs`, `scripts/smoke-owner-close-browser-acceptance.mjs`, `scripts/smoke-owner-opening-browser-acceptance.mjs`, `scripts/smoke-owner-statement-browser-acceptance.mjs`, `scripts/smoke-properties-flow-policy.mjs`, `scripts/smoke-ui-redesign-artifacts.mjs`, `scripts/smoke-ui-redesign-policy.test.mjs`, `scripts/smoke-ui-redesign.mjs` |
| `scripts/smoke-ui-redesign-policy.test.mjs` | default-gate | `docs/superpowers/plans/2026-08-15-settings-redesign.md` |
| `scripts/smoke-ui-redesign.mjs` | specialist-command | `docs/superpowers/plans/2026-08-09-ips-operational-readiness-program.md`, `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `docs/verification/enterprise-frontend-redesign-evidence.md`, `package:test:ui-a11y`, `package:test:ui-redesign`, `scripts/generate-enterprise-frontend-evidence.mjs` |
| `scripts/supabase-portable-migrations.mjs` | reusable-support | `scripts/run-supabase-portable.mjs`, `scripts/supabase-portable-migrations.node-test.mjs` |
| `scripts/supabase-portable-migrations.node-test.mjs` | default-gate | `docs/repository/legacy-test-compatibility-inventory.md`, `package:test:contracts` |
| `scripts/synthetic-recovery-core.mjs` | reusable-support | `scripts/rehearse-synthetic-recovery.mjs`, `scripts/synthetic-recovery.node-test.mjs` |
| `scripts/synthetic-recovery.node-test.mjs` | specialist-command | `package:recovery:test-synthetic` |
| `scripts/target-org-dump-core.mjs` | reusable-support | `scripts/target-org-dump.node-test.mjs` |
| `scripts/target-org-dump.node-test.mjs` | default-gate | `docs/runbooks/background-jobs-and-recovery.md`, `package:test:contracts` |
| `scripts/tenant-commercial-document-pdf.node-test.mjs` | specialist-command | `package:test:tenant-commercial-document-pdf` |
| `scripts/test-deposit-candidate-local.mjs` | workflow-gate | `.github/workflows/ci.yml`, `docs/design/deposit-rent-candidate/README.md`, `docs/runbooks/deposit-release-validation.md`, `docs/verification/ips-security-advisor-review-2026-10-14.md` |
| `scripts/test-deposit-custody-concurrency.mjs` | reusable-support | `scripts/deposit-candidate-target.node-test.mjs`, `scripts/test-deposit-candidate-local.mjs` |
| `scripts/test-deposit-statement-reader-local.mjs` | documented-operator | `docs/runbooks/deposit-statement-reader-acceptance.md` |
| `scripts/unit-profit-loss-comparison-core.mjs` | reusable-support | `scripts/generate-unit-profit-loss-comparison.mjs`, `scripts/unit-profit-loss-comparison.node-test.mjs` |
| `scripts/unit-profit-loss-comparison.node-test.mjs` | default-gate | `package:test:contracts` |
| `scripts/verify-authenticated-route-discoverability.mjs` | specialist-command | `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `package:test:route-discoverability`, `scripts/verify-authenticated-route-discoverability.node-test.mjs` |
| `scripts/verify-authenticated-route-discoverability.node-test.mjs` | default-gate | `package:test:contracts` |
| `scripts/verify-hosted-migration-parity.mjs` | specialist-command | `docs/superpowers/plans/2026-08-21-supabase-migration-history-reconciliation.md`, `package:db:hosted-postflight`, `package:db:hosted-preflight`, `scripts/hosted-migration-parity-core.node-test.mjs` |
| `scripts/verify-ips-cutover-manifest.mjs` | reusable-support | `docs/superpowers/plans/2026-08-09-ips-operational-readiness-program.md`, `scripts/smoke-ips-cutover-rehearsal.mjs`, `scripts/verify-ips-cutover-manifest.node-test.mjs` |
| `scripts/verify-ips-cutover-manifest.node-test.mjs` | default-gate | `docs/superpowers/plans/2026-08-11-track-9-ips-cutover.md`, `package:cutover:test-manifest`, `package:test:contracts` |
| `scripts/verify-migration-discipline.mjs` | specialist-command | `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `docs/superpowers/plans/2026-08-21-supabase-migration-history-reconciliation.md`, `package:db:verify-migrations` |
| `scripts/verify-release-parity.mjs` | specialist-command | `docs/superpowers/plans/2026-08-09-ips-operational-readiness-program.md`, `package:release:verify-local`, `scripts/verify-release-parity.node-test.mjs` |
| `scripts/verify-release-parity.node-test.mjs` | default-gate | `package:release:test-parity`, `package:test:contracts` |
| `scripts/verify-repository-secrets.mjs` | specialist-command | `docs/verification/property-photo-viewer.md`, `package:security:secrets`, `scripts/security-guardrails.node-test.mjs` |
| `scripts/verify-ui-copy-scanner.mjs` | reusable-support | `scripts/verify-ui-copy-scanner.test.mjs`, `scripts/verify-ui-copy.mjs` |
| `scripts/verify-ui-copy-scanner.test.mjs` | default-gate | None found |
| `scripts/verify-ui-copy.mjs` | specialist-command | `docs/codex-ui-ux-remediation-prompt.md`, `docs/ui-ux-audit-2026-08-12.md`, `docs/verification/property-photo-viewer.md`, `package:test:ui-copy` |
| `scripts/verify-ui-route-coverage.mjs` | specialist-command | `package:test:ui-coverage` |
| `scripts/vitest-tier-core.mjs` | reusable-support | `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `scripts/run-vitest-tier.mjs`, `scripts/vitest-tier-core.node-test.mjs` |
| `scripts/vitest-tier-core.node-test.mjs` | default-gate | `docs/superpowers/plans/2026-08-14-repository-health-and-test-architecture.md`, `package:test:contracts` |
| `scripts/workspace-provision-core.mjs` | reusable-support | `docs/codex-handoff-admin-onboarding-2026-08-12.md`, `docs/ui-ux-audit-admin-onboarding-invites-2026-08-12.md`, `scripts/workspace-provision-core.test.mjs`, `scripts/workspace-provision.mjs` |
| `scripts/workspace-provision-core.test.mjs` | default-gate | None found |
| `scripts/workspace-provision.mjs` | specialist-command | `package:workspace:provision` |

## Unreferenced review queue

- `scripts/local-fixture-credentials.ts` - inspect purpose and operator history before archival.
- `scripts/paid-cost-fixture-periods.ts` - inspect purpose and operator history before archival.
- `scripts/shared-register-capture.mjs` - inspect purpose and operator history before archival.
