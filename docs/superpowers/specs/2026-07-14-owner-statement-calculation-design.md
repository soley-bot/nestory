# Trustworthy Owner Statement Calculation Design

**Date:** 2026-07-14
**Status:** Approved for implementation

## Purpose

Replace the existing current-primary-owner label over monthly ledger totals with
a property-level, cash-basis Owner Statement powered by `buildPropertyCash`.
This PR produces an internal readiness workspace with exact allocation and
source evidence, then generates owner-facing preview, print, and PDF documents
for exactly one property, one owner, and one month. It does not add ownership
editing, schema, branding, delivery, snapshots, or Overview changes.

## Architecture

```text
Supabase report loader
  -> PropertyCashInput
  -> buildPropertyCash
  -> report-owned owner allocation
  -> readiness TrustedReport
     -> internal readiness preview / evidence CSV
     -> recipient selection
        -> owner-facing preview / print / dedicated PDF
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
Only ready properties contribute to monetary summary totals. Summary counts
distinguish ready properties, owner statements ready, and blocked properties.
A 60/40 ready property therefore counts as one ready property and two owner
statements ready. Consecutive historical links for the same person do not
duplicate the recipient count.

Evidence is separate from navigation. An evidence line preserves property ID,
owner person/link IDs, obligation ID, receipt/payment ID, allocation ID,
deposit-event ID, event date, classification, original signed cents, and the
owner-allocated cents. CSV serializes exact evidence record types and IDs.
Navigation uses only supported module filters and labels non-focused links as
review links.

## Readiness, Recipient Scope, and Exports

Owner Statement is property-level. The UI must not carry `unitId` into Owner
Statement links or forms. A direct preview with a real unit ID shows:

> Owner Statements are property-level reports. Clear the unit filter to continue.

CSV and PDF endpoints reject the same unsupported request with a controlled
HTTP 400. They must never silently broaden it to a property statement.

The all-properties surface is titled `Owner Statement readiness`. It is an
internal operational workspace with counts, blockers, evidence links, and a
portfolio CSV. Each ready owner row links to a recipient-scoped preview, PDF,
and print view using `propertyId`, `ownerPersonId`, and month. Blocked rows never
offer monetary documents.

Owner-facing preview, print, and PDF require one selected property. A property
with exactly one ready owner may infer that recipient; a multi-owner property
requires `ownerPersonId`. Unknown recipients return controlled HTTP 400 and a
blocked property returns controlled HTTP 409. The resulting document contains
one owner only, all nine financial/disclosure values, and no readiness state,
blocker details, warnings, evidence IDs, or source counts. CSV remains the
internal evidence export and retains exact traceability.

## Scope Boundaries

- No migration or generated database type change.
- No ownership write workflow.
- No finance write change.
- No organization profile, branding, email, or snapshot work.
- No Overview behavior or type dependency.
- No unsupported exact-record focus query parameters.
