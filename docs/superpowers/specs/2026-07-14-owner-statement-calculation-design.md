# Trustworthy Owner Statement Calculation Design

**Date:** 2026-07-14
**Status:** Approved for implementation

## Purpose

Replace the existing current-primary-owner label over monthly ledger totals with
a property-level, cash-basis Owner Statement powered by `buildPropertyCash`.
This PR produces an internal operational statement with explicit ownership
readiness, exact allocation, source evidence, and consistent preview/export
behavior. It does not add ownership editing, schema, branding, delivery,
snapshots, or Overview changes.

## Architecture

```text
Supabase report loader
  -> PropertyCashInput
  -> buildPropertyCash
  -> report-owned owner allocation
  -> TrustedReport
  -> preview / CSV / print / generic PDF
```

`src/features/reports/data/owner-statement.ts` is a pure module. It owns
effective-date validation, percentage parsing, largest-remainder allocation,
blockers, warnings, owner rows, statement totals, and evidence association. It
may import the Finance property-cash kernel, but it must not import React,
Overview UI types, URLs, or formatting helpers.

## Financial Contract

- Operating receipts use receipt event dates.
- Property expenses use payment event dates.
- Management fees earned use obligation due dates.
- Management fees received use receipt event dates.
- Management fees outstanding are the remaining balance at period end for each
  fee obligation due in the selected month, allocated by that obligation's
  due-date owner roster. The label is **Management fees outstanding from this
  period**. It is disclosure-only.
- Owner contributions and payouts use their receipt/payment event dates and are
  assigned directly only when exactly one owner is effective.
- Reversals use the reversal event date and signed kernel cents.
- Security deposits are disclosure-only. The closing held balance is allocated
  using the valid roster effective on the final day of the month.
- Prior-period settlement and deposit source lines remain evidence. They are
  not blindly summed as current-period cash.
- Net owner cash movement is operating cash received minus property expenses
  paid minus management fees received plus owner contributions minus owner
  payouts. It is not an amount payable or a reconciled bank balance.

## Ownership Contract

Ownership intervals are half-open: a link is effective when `started_on` is
null or at/before the fact date, and `ended_on` is null or strictly after the
fact date. Archived links never participate. Primary status is correspondence
metadata only.

At each required fact date:

- No effective owner blocks the property/month statement.
- One owner may have null ownership (inferred 100.000%) or explicit 100.000%;
  every other explicit percentage blocks.
- Multiple owners require positive explicit percentages totaling exactly
  100.000 (100,000 thousandths).
- Duplicate or overlapping effective links for the same owner/property block.
- If any required fact date is invalid, the entire property/month statement is
  blocked. No partial financial owner rows are emitted.
- Missing email/phone contact details produce warnings, not blockers.

Percentage allocation uses integer cents, exact thousandths, and `BigInt`
largest-remainder arithmetic. Remainder ties sort by owner person ID, then
owner-link ID. Signed allocations must add exactly to the signed property fact
and must not depend on input order.

## Rows, Summary, and Evidence

A ready statement emits one row per owner/property combination whose ownership
interval intersects the month or receives an allocated fact. A blocked property
emits one explicit blocked row with actionable reasons, a property link, and no
financial totals.

Ready rows expose owner, property, share, operating cash received, property
expenses paid, management fees earned/received/outstanding from this period,
owner contributions, owner payouts, deposits held, and net owner cash movement.
Only ready properties contribute to monetary summary totals.

Evidence is separate from navigation. An evidence line preserves property ID,
owner person/link IDs, obligation ID, receipt/payment ID, allocation ID,
deposit-event ID, event date, classification, original signed cents, and the
owner-allocated cents. CSV serializes exact evidence record types and IDs.
Navigation uses only supported module filters and labels non-focused links as
review links.

## Unit Scope and Exports

Owner Statement is property-level. The UI must not carry `unitId` into Owner
Statement links or forms. A direct preview with a real unit ID shows:

> Owner Statements are property-level reports. Clear the unit filter to continue.

CSV and PDF endpoints reject the same unsupported request with a controlled
HTTP 400. They must never silently broaden it to a property statement. Preview,
CSV, print, and generic PDF otherwise consume the same calculated rows and keep
blocked reasons visible.

## Scope Boundaries

- No migration or generated database type change.
- No ownership write workflow.
- No finance write change.
- No organization profile, branding, email, snapshot, or dedicated PDF design.
- No Overview behavior or type dependency.
- No unsupported exact-record focus query parameters.
