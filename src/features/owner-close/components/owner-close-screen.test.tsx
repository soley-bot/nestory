/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/owner-close/actions", () => ({
  closeOwnerMonthAction: vi.fn(),
  publishOwnerStatementAction: vi.fn(),
  recordOwnerCloseCorrectionAction: vi.fn(),
  reopenOwnerMonthAction: vi.fn(),
  resumeOwnerStatementPublicationAction: vi.fn(),
}));

import { OwnerCloseScreen } from "@/features/owner-close/components/owner-close-screen";
import type { OwnerCloseData } from "@/features/owner-close/owner-close.types";
import { canonicalizeSignedOwnerOpeningAmount } from "@/features/owner-balances/owner-balance.money";

afterEach(() => cleanup());

const propertyId = "00000000-0000-4000-8000-000000000002";
const ownerId = "00000000-0000-4000-8000-000000000003";
const seriesId = "00000000-0000-4000-8000-000000000004";
const revisionOneId = "00000000-0000-4000-8000-000000000005";
const revisionTwoId = "00000000-0000-4000-8000-000000000006";
const publicationId = "00000000-0000-4000-8000-000000000019";
const amount = canonicalizeSignedOwnerOpeningAmount;

describe("OwnerCloseScreen", () => {
  it("gives Finance typed readiness and frozen source drill-through without mutation controls", () => {
    render(<OwnerCloseScreen
      canClose={false}
      canReopen={false}
      data={closedData()}
      monthStart="2026-08-01"
      ownerPersonId={ownerId}
      propertyId={propertyId}
    />);

    expect(screen.getByRole("heading", { name: "Close owner month" })).toBeTruthy();
    expect(screen.getByText("Reopen is required before another close")).toBeTruthy();
    expect(screen.getByText("owner_close_reopen_required")).toBeTruthy();
    expect(screen.getByText("Revision 1 - Closed")).toBeTruthy();
    expect(screen.getByText("Content hash")).toBeTruthy();
    expect(screen.getByText("e".repeat(64))).toBeTruthy();
    expect(screen.getByText(/Tenant rent receipt - IPS-held owner cash/)).toBeTruthy();
    expect(screen.getByText(/source line .*000000000009/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reopen month" })).toBeNull();
    expect(screen.queryByRole("button", { name: /close owner month/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Record correction" })).toBeNull();
  });

  it("gives Super Admin the reasoned reopen control while preserving revision one", () => {
    render(<OwnerCloseScreen
      canClose
      canReopen
      data={closedData()}
      monthStart="2026-08-01"
      ownerPersonId={ownerId}
      propertyId={propertyId}
    />);

    expect(screen.getByRole("button", { name: "Reopen month" })).toBeTruthy();
    expect(screen.getByLabelText("Reopen reason")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /close owner month/i })).toBeNull();
    expect(screen.getByText("Revision 1 - Closed")).toBeTruthy();
  });

  it("shows checked correction and revision two close only when the rerolled scope is ready", () => {
    const data = closedData();
    data.series = {
      ...data.series!,
      activeRevisionId: revisionTwoId,
      state: "preparing",
    };
    data.readiness = {
      ...data.readiness!,
      blockers: [],
      inputHash: "f".repeat(64),
      isReady: true,
      seriesState: "preparing",
    };
    data.revisions.unshift({
      closeReason: null,
      closedAt: null,
      closedBy: null,
      contentHash: null,
      id: revisionTwoId,
      inputHash: null,
      inputWatermark: null,
      lines: [],
      preparedAt: "2026-09-02T04:00:00Z",
      preparedBy: "00000000-0000-4000-8000-000000000012",
      reopenReason: "Late paid cost belongs to August",
      revisionNumber: 2,
      status: "preparing",
      supersedesRevisionId: revisionOneId,
    });

    render(<OwnerCloseScreen
      canClose
      canReopen
      data={data}
      monthStart="2026-08-01"
      ownerPersonId={ownerId}
      propertyId={propertyId}
    />);

    expect(screen.getByText("Ready to close owner month · revision 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close owner month · revision 2" })).toBeTruthy();
    expect(screen.getByLabelText("Close reason")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Record correction" })).toBeTruthy();
    expect(screen.getByLabelText("Signed correction amount")).toBeTruthy();
    expect(screen.getByText("Revision 1 - Closed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reopen month" })).toBeNull();
  });

  it("does not label a stale series ready when the financial inputs have rerolled", () => {
    const data = closedData();
    data.series = {
      ...data.series!,
      state: "stale",
    };
    data.readiness = {
      ...data.readiness!,
      blockers: [],
      isReady: true,
      seriesState: "stale",
    };

    render(<OwnerCloseScreen
      canClose
      canReopen
      data={data}
      monthStart="2026-08-01"
      ownerPersonId={ownerId}
      propertyId={propertyId}
    />);

    expect(screen.getByText("Close readiness blocked")).toBeTruthy();
    expect(screen.queryByText(/Ready to close owner month/)).toBeNull();
    expect(screen.queryByRole("button", { name: /close owner month/i })).toBeNull();
  });

  it("gives Super Admin publication and retained artifact controls for the current close", () => {
    const data = closedData();
    data.publicationReadiness = {
      blockers: [],
      existingPublicationId: null,
      isReady: true,
      revisionId: revisionOneId,
    };
    data.publications = [];

    render(<OwnerCloseScreen
      canClose
      canPublish
      canReopen
      data={data}
      monthStart="2026-08-01"
      ownerPersonId={ownerId}
      propertyId={propertyId}
    />);

    expect(screen.getByText("Ready to publish official Owner Statement")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Publish Owner Statement" })).toBeTruthy();
  });

  it("keeps superseded publications and downloads visible to read-only Finance", () => {
    const data = closedData();
    data.publicationReadiness = null;
    data.publications = [{
      artifacts: [
        { format: "pdf", id: "00000000-0000-4000-8000-000000000020" },
        { format: "xlsx", id: "00000000-0000-4000-8000-000000000021" },
      ],
      contentHash: "f".repeat(64),
      generatedAt: "2026-09-01T05:00:00Z",
      id: publicationId,
      revisionId: revisionOneId,
      revisionNumber: 1,
      statementNumber: "OS-202608-000000000000",
      supersededByPublicationId: "00000000-0000-4000-8000-000000000022",
      supersedesPublicationId: null,
    }];

    render(<OwnerCloseScreen
      canClose={false}
      canPublish={false}
      canReopen={false}
      data={data}
      monthStart="2026-08-01"
      ownerPersonId={ownerId}
      propertyId={propertyId}
    />);

    expect(screen.getByText("OS-202608-000000000000")).toBeTruthy();
    expect(screen.getByText("Superseded")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Download PDF" }).getAttribute("href"))
      .toBe("/api/reports/pdf?artifactId=00000000-0000-4000-8000-000000000020");
    expect(screen.getByRole("link", { name: "Download Excel" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Publish Owner Statement" })).toBeNull();
  });

  it("offers Super Admin a fresh-key resume control for an incomplete publication", () => {
    const data = closedData();
    data.publicationReadiness = {
      blockers: [{ code: "owner_statement_artifacts_incomplete" }],
      existingPublicationId: publicationId,
      isReady: false,
      revisionId: revisionOneId,
    };
    data.publications = [{
      artifacts: [{ format: "pdf", id: "00000000-0000-4000-8000-000000000020" }],
      contentHash: "f".repeat(64),
      generatedAt: "2026-09-01T05:00:00Z",
      id: publicationId,
      revisionId: revisionOneId,
      revisionNumber: 1,
      statementNumber: "OS-202608-000000000000",
      supersededByPublicationId: null,
      supersedesPublicationId: null,
    }];

    render(<OwnerCloseScreen
      canClose
      canPublish
      canReopen
      data={data}
      monthStart="2026-08-01"
      ownerPersonId={ownerId}
      propertyId={propertyId}
    />);

    expect(screen.getByText("Publication incomplete")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resume Owner Statement" })).toBeTruthy();
  });
});

function closedData(): OwnerCloseData {
  return {
    corrections: [],
    publicationReadiness: null,
    publications: [],
    readiness: {
      blockers: [{ code: "owner_close_reopen_required", series_id: seriesId, state: "closed" }],
      components: [
        { closingAmount: amount("900719925474.09"), component: "ips_held_owner_cash", movementAmount: amount("0.09"), openingAmount: amount("900719925474.00") },
        { closingAmount: amount("5.00"), component: "owner_due_to_ips", movementAmount: amount("0.00"), openingAmount: amount("5.00") },
        { closingAmount: amount("7.00"), component: "ips_due_to_owner", movementAmount: amount("7.00"), openingAmount: amount("0.00") },
        { closingAmount: amount("50.00"), component: "security_deposit_custody", movementAmount: amount("50.00"), openingAmount: amount("0.00") },
      ],
      inputHash: "b".repeat(64),
      inputWatermark: "allocations=1|movements=1|openings=4|month=2026-08-01",
      isReady: false,
      periodId: "00000000-0000-4000-8000-000000000011",
      seriesId,
      seriesState: "closed",
    },
    revisions: [{
      closeReason: "Reviewed against bank reconciliation",
      closedAt: "2026-09-01T04:00:00Z",
      closedBy: "00000000-0000-4000-8000-000000000012",
      contentHash: "e".repeat(64),
      id: revisionOneId,
      inputHash: "b".repeat(64),
      inputWatermark: "allocations=1|movements=1|openings=4|month=2026-08-01",
      lines: [{
        businessDate: "2026-08-05",
        component: "ips_held_owner_cash",
        description: "Tenant rent receipt - IPS-held owner cash",
        id: "00000000-0000-4000-8000-000000000007",
        lineKind: "movement",
        lineNumber: 5,
        signedAmount: amount("900719925474.09"),
        sourceCount: 1,
        sources: [{
          id: "00000000-0000-4000-8000-000000000014",
          ownerBalancePeriodComponentId: null,
          ownerComponentMovementId: "00000000-0000-4000-8000-000000000010",
          ownerEventOwnerAllocationId: null,
          ownerOpeningBalanceEntryId: null,
          sourceFingerprint: "d".repeat(64),
          sourceId: "00000000-0000-4000-8000-000000000008",
          sourceLineId: "00000000-0000-4000-8000-000000000009",
          sourceType: "tenant_rent_receipt",
        }],
      }],
      preparedAt: "2026-09-01T03:59:00Z",
      preparedBy: "00000000-0000-4000-8000-000000000012",
      reopenReason: null,
      revisionNumber: 1,
      status: "closed",
      supersedesRevisionId: null,
    }],
    series: {
      activeRevisionId: revisionOneId,
      currentClosedRevisionId: revisionOneId,
      id: seriesId,
      state: "closed",
      stateChangedAt: "2026-09-01T04:00:00Z",
    },
  };
}
