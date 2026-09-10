# Reporting Workspace Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent tasks and final review.

**Goal:** Deliver usable transaction, fee and rent reporting with shared compact controls and exports.
**Architecture:** Dedicated scoped loaders return TrustedReport; common query/presentation code supplies the same rows to UI and exports. Existing owner reports retain their source authority.
**Tech Stack:** Next.js App Router, React, TypeScript, Supabase, Vitest, existing PDF/XLSX engine.
**Spec:** docs/superpowers/specs/2026-09-10-reporting-workspace-design.md

## Global constraints

- Staff-only, read-only reports; no real financial changes or owner portal.
- Existing monthly owner report behavior remains compatible.
- Source errors and incomplete reads cannot produce apparently complete reports.
- Preserve exact amounts and distinct financial meanings; no parent/child double counting.
- User authorized implementation and existing release workflow; no repeated approval request.

## Tasks

- [x] Transactions/management fee loaders and tests. Own data/transaction-report.ts plus tests. Export getTransactionReport({organizationId,viewQuery,supabase,financeContext}) returning Promise<TrustedReport>; management-fees selects fee-only report. Reuse current checked sources, handle scoped properties/units, date ranges and source links. Test failures, reversal signs, multi-line totals, fee versus cash distinction.
- [x] Rent loaders and tests. Own data/rent-reports.ts plus tests. Export getRentReport with the same parameter shape, supports rent-roll and rent-collections. Current rent-roll snapshot, invoice collection report by date range with billed/received/open totals. Test permissions/scopes, vacancy, partial payment and credits without false arrears.
- [x] UI workspace. Own reports-screen.tsx, reports-filters.tsx, report-results-table.tsx and new UI files; catalog directory component. Compact report navigation, filter/search controls, named local views, columns and grouping. Export links carry all filters; UI/export presentation consistency via shared helper coordinated with root. Test behavior and responsive layout.
- [x] Root integration. Extend optional query/types/catalog, route new loaders through getTrustedReport, ensure screen trimming/pagination and export formatting preserve all rows. Add shared presentation filtering/grouping with tests. Integrate report directory and retain statement authority.
- [ ] Review/test/release. Focused tests then lint/typecheck and full CI; local authenticated browser/screenshots and download checks; review each lane and whole branch, fix findings. Release through normal PR/main/database gates and verify Pilot read-only. Record limitations accurately.
