// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { OpeningBalanceAuthorityData } from "../owner-balance.types";
import {
  canonicalizeOwnerOpeningAmount,
  canonicalizeSignedOwnerOpeningAmount,
} from "../owner-balance.money";

const mocks = vi.hoisted(() => ({
  createDocument: vi.fn(),
  correction: vi.fn(),
  initial: vi.fn(),
  refresh: vi.fn(),
  review: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/features/documents/actions", () => ({
  createDocumentAction: mocks.createDocument,
}));
vi.mock("@/features/owner-balances/actions", () => ({
  reviewOwnerOpeningBalanceAction: mocks.review,
  submitOwnerOpeningBalanceAction: mocks.initial,
  submitOwnerOpeningBalanceCorrectionAction: mocks.correction,
}));

import { OpeningBalanceScreen } from "./opening-balance-screen";

const organizationId = "00000000-0000-4000-8000-000000000001";
const propertyId = "00000000-0000-4000-8000-000000000002";
const ownerId = "00000000-0000-4000-8000-000000000003";
const actorId = "00000000-0000-4000-8000-000000000004";
const otherUserId = "00000000-0000-4000-8000-000000000005";
const openingEntryId = "00000000-0000-4000-8000-000000000006";
const replacementEntryId = "00000000-0000-4000-8000-000000000007";
const rejectedRequestId = "00000000-0000-4000-8000-000000000008";
const pendingRequestId = "00000000-0000-4000-8000-000000000009";
const ownPendingRequestId = "00000000-0000-4000-8000-000000000010";
const documentId = "00000000-0000-4000-8000-000000000011";
const fingerprint = "a".repeat(64);

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class {
    disconnect() {}
    observe() {}
    unobserve() {}
  });
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(() => "00000000-0000-4000-8000-000000000099"),
    subtle: globalThis.crypto?.subtle,
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.initial.mockResolvedValue({
    entryIds: [],
    message: "Opening balance submitted for review.",
    requestId: pendingRequestId,
    status: "success",
  });
  mocks.correction.mockResolvedValue({
    entryIds: [],
    message: "Opening-balance correction submitted for review.",
    requestId: pendingRequestId,
    status: "success",
  });
  mocks.review.mockResolvedValue({
    entryIds: [openingEntryId],
    message: "Opening balance approved.",
    requestId: pendingRequestId,
    status: "success",
  });
  mocks.createDocument.mockResolvedValue({
    contentSha256: fingerprint,
    documentId,
    fileName: "opening.pdf",
    message: "Document uploaded.",
    status: "success",
  });
});

afterEach(cleanup);

describe("OpeningBalanceScreen", () => {
  it("renders the four fixed components and distinguishes Unknown from Known zero", () => {
    renderScreen(superAdminProps());

    expect(screen.getByRole("heading", { name: "Opening authority" })).toBeTruthy();
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
    expect(screen.getByText("Known zero")).toBeTruthy();
    expect(screen.getByText("$0.00")).toBeTruthy();
    for (const label of [
      "IPS-held owner cash",
      "Owner due to IPS",
      "IPS due to owner",
      "Security-deposit custody",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("shows exact ownership, evidence, review, and append-only correction lineage", () => {
    renderScreen(superAdminProps());

    expect(screen.getAllByText("100.000%").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Roster cccccccc/).length).toBeGreaterThan(0);
    expect(screen.getByText("opening.pdf")).toBeTruthy();
    expect(screen.getByText(fingerprint)).toBeTruthy();
    expect(screen.getByText("Reversal of opening entry")).toBeTruthy();
    expect(screen.getByText("Current replacement")).toBeTruthy();
    expect(screen.getByText("Resubmission of rejected request")).toBeTruthy();
    expect(screen.getByText("Evidence did not reconcile")).toBeTruthy();
  });

  it("applies capability controls and never offers self-review", () => {
    const admin = renderScreen(superAdminProps());
    expect(screen.getAllByRole("button", { name: "Submit opening balance" }).length)
      .toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Request correction" })).toBeTruthy();
    expect(screen.getByText("Independent review required")).toBeTruthy();
    admin.unmount();

    const reviewable = authorityData();
    const reviewableRequest = reviewable.groups[0]!.components[2]!.requests[0]!;
    reviewable.groups[0]!.components[2]!.requests[0] = {
      ...reviewableRequest,
      reviewedAt: null,
      reviewedBy: null,
      status: "submitted",
    };
    const review = renderScreen({ ...superAdminProps(), data: reviewable });
    expect(screen.getByRole("button", { name: "Approve opening balance" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject opening balance" })).toBeTruthy();
    review.unmount();

    const financeManager = renderScreen({
      ...baseProps(),
      canSubmitCorrection: true,
    });
    expect(screen.queryByRole("button", { name: "Submit opening balance" })).toBeNull();
    expect(screen.getByRole("button", { name: "Request correction" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Approve opening balance/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Resolve ownership" })).toBeNull();
    expect(screen.getByText("Ask a Super Admin to correct the ownership facts.")).toBeTruthy();
    financeManager.unmount();

    renderScreen({
      ...baseProps(),
      canSubmitCorrection: true,
      canSubmitInitial: true,
    });
    expect(screen.getAllByRole("button", { name: "Submit opening balance" }).length)
      .toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Request correction" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Approve opening balance/ })).toBeNull();
  });

  it("links rejected resubmission to its predecessor and withholds stale correction", async () => {
    const user = userEvent.setup();
    renderScreen(superAdminProps());

    expect(screen.getByRole("button", { name: "Resubmit rejected opening" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Request correction" })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Resubmit rejected opening" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog)
        .getByDisplayValue(rejectedRequestId)
        .getAttribute("name"),
    ).toBe("resubmissionOfRequestId");
  });

  it("offers only Resubmit for an unresolved rejected leaf", () => {
    renderScreen(superAdminProps());

    const row = screen.getByText("Security-deposit custody").closest("tr");
    expect(row).toBeTruthy();
    expect(within(row!).getByRole("button", { name: "Resubmit rejected opening" }))
      .toBeTruthy();
    expect(within(row!).queryByRole("button", { name: "Submit opening balance" }))
      .toBeNull();
  });

  it("uses only the newest request as current workflow, evidence, ownership, and action", () => {
    const data = authorityData();
    const component = data.groups[0]!.components[3]!;
    const rejected = component.requests[0]!;
    component.requests = [
      {
        ...rejected,
        id: pendingRequestId,
        ownershipPercentSnapshot: "88.000",
        ownershipRosterHash: "e".repeat(64),
        resubmissionOfRequestId: rejected.id,
        sourceReference: "Current successor evidence",
        status: "submitted",
        submittedAt: "2026-08-04T00:00:00Z",
      },
      {
        ...rejected,
        ownershipPercentSnapshot: "50.000",
        sourceReference: "Older rejected evidence",
        submittedAt: "2026-08-02T00:00:00Z",
      },
    ];

    renderScreen({ ...superAdminProps(), data });

    const row = screen.getByText("Security-deposit custody").closest("tr");
    expect(row).toBeTruthy();
    expect(within(row!).getByText("88.000%")).toBeTruthy();
    expect(within(row!).getByText("Reference: Current successor evidence"))
      .toBeTruthy();
    expect(within(row!).queryByText("Reference: Older rejected evidence")).toBeNull();
    expect(within(row!).queryByRole("button", { name: "Resubmit rejected opening" }))
      .toBeNull();
    expect(within(row!).getByRole("button", { name: "Approve opening balance" }))
      .toBeTruthy();
    expect(within(row!).getByRole("button", { name: "Reject opening balance" }))
      .toBeTruthy();
  });

  it("does not fabricate a selected property-owner pair when the roster is invalid", () => {
    const data = authorityData();
    data.groups = [];

    renderScreen({ ...superAdminProps(), data });

    expect(screen.getByText("Ownership setup required")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit opening balance" })).toBeNull();
    expect(screen.getByRole("link", { name: "Resolve ownership" })).toBeTruthy();
  });

  it("uses exact text amounts, stable intent IDs, and real-byte evidence controls", async () => {
    const user = userEvent.setup();
    renderScreen(superAdminProps());

    await user.click(screen.getAllByRole("button", { name: "Submit opening balance" })[0]);
    const dialog = screen.getByRole("dialog");
    const amount = within(dialog).getByLabelText("Opening amount");
    expect(amount.getAttribute("type")).toBe("text");
    expect(amount.getAttribute("inputmode")).toBe("decimal");
    expect(
      dialog.querySelector<HTMLInputElement>('input[name="idempotencyKey"]')?.value,
    ).toBe("owner-opening-initial-00000000-0000-4000-8000-000000000099");
    expect(within(dialog).getByLabelText("Evidence file").getAttribute("type")).toBe(
      "file",
    );
    expect(within(dialog).getByText("Existing eligible evidence")).toBeTruthy();
  });

  it("submits exact opening FormData and exposes action errors through a live region", async () => {
    mocks.initial.mockResolvedValueOnce({
      errorCode: "ownership_roster",
      message: "Resolve the ownership roster before continuing.",
      status: "error",
    });
    const user = userEvent.setup();
    renderScreen(superAdminProps());
    await user.click(screen.getAllByRole("button", { name: "Submit opening balance" })[0]);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Opening amount"), {
      target: { value: "999999999999.99" },
    });
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "Reconciled opening evidence" },
    });
    fireEvent.change(within(dialog).getByLabelText("Source reference"), {
      target: { value: "IPS workbook row 8" },
    });
    await user.click(within(dialog).getByRole("button", { name: "Submit for review" }));

    expect(mocks.initial).toHaveBeenCalledOnce();
    const submitted = mocks.initial.mock.calls[0]?.[1] as FormData;
    expect(Object.fromEntries(submitted)).toMatchObject({
      amount: "999999999999.99",
      component: "owner_due_to_ips",
      effectiveDate: "2026-08-01",
      ownerPersonId: ownerId,
      propertyId,
      resubmissionOfRequestId: "",
    });
    expect(screen.getByRole("alert").textContent).toContain(
      "Resolve the ownership roster",
    );
    expect(
      screen.getByRole("dialog").querySelector<HTMLInputElement>(
        'input[name="idempotencyKey"]',
      )?.value,
    ).toBe("owner-opening-initial-00000000-0000-4000-8000-000000000099");
    expect(within(screen.getByRole("dialog")).getByLabelText<HTMLInputElement>("Opening amount").value)
      .toBe("999999999999.99");
    expect(within(screen.getByRole("dialog")).getByLabelText<HTMLInputElement>("Reason").value)
      .toBe("Reconciled opening evidence");
    expect(within(screen.getByRole("dialog")).getByLabelText<HTMLInputElement>("Source reference").value)
      .toBe("IPS workbook row 8");
  });

  it("keeps a new evidence file local until final submission", async () => {
    const user = userEvent.setup();
    renderScreen(superAdminProps());
    await user.click(screen.getAllByRole("button", { name: "Submit opening balance" })[0]);

    const dialog = screen.getByRole("dialog");
    const file = new File([new Uint8Array([1, 2, 3])], "opening.pdf", {
      type: "application/pdf",
    });
    await user.upload(within(dialog).getByLabelText("Evidence file"), file);

    expect(within(dialog).queryByRole("button", { name: "Register file" })).toBeNull();
    expect(within(dialog).getByText("opening.pdf ready for final submission"))
      .toBeTruthy();
    expect(mocks.createDocument).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.createDocument).not.toHaveBeenCalled();
  });

  it("submits the current entry for correction without numeric coercion", async () => {
    const user = userEvent.setup();
    renderScreen(superAdminProps());

    await user.click(screen.getByRole("button", { name: "Request correction" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Replacement amount"), {
      target: { value: "999999999999.99" },
    });
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "Corrected from reconciled evidence" },
    });
    await user.click(within(dialog).getByRole("button", { name: "Submit for review" }));

    const submitted = mocks.correction.mock.calls[0]?.[1] as FormData;
    expect(Object.fromEntries(submitted)).toMatchObject({
      entryId: replacementEntryId,
      replacementAmount: "999999999999.99",
      resubmissionOfRequestId: "",
      supportingDocumentId: documentId,
    });
  });

  it("sends an independent review decision with its stable intent key", async () => {
    const user = userEvent.setup();
    const data = authorityData();
    const reviewableRequest = data.groups[0]!.components[2]!.requests[0]!;
    data.groups[0]!.components[2]!.requests[0] = {
      ...reviewableRequest,
      reviewedAt: null,
      reviewedBy: null,
      status: "submitted",
    };
    renderScreen({ ...superAdminProps(), data });

    await user.click(screen.getByRole("button", { name: "Approve opening balance" }));
    const dialog = screen.getByRole("dialog");
    const key = dialog.querySelector<HTMLInputElement>('input[name="idempotencyKey"]')?.value;
    expect(key).toBe("owner-opening-review-00000000-0000-4000-8000-000000000099");
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));

    const submitted = mocks.review.mock.calls[0]?.[1] as FormData;
    expect(Object.fromEntries(submitted)).toMatchObject({
      decision: "approve",
      idempotencyKey: key,
      requestId: pendingRequestId,
    });
  });

  it("submits the selected file through the final opening command", async () => {
    const user = userEvent.setup();
    renderScreen(superAdminProps());
    await user.click(screen.getAllByRole("button", { name: "Submit opening balance" })[0]);
    const dialog = screen.getByRole("dialog");
    const file = new File([new Uint8Array([1, 2, 3])], "opening.pdf", {
      type: "application/pdf",
    });
    const input = within(dialog).getByLabelText<HTMLInputElement>("Evidence file");
    await user.upload(input, file);
    expect(input.files?.[0]).toBe(file);
    fireEvent.change(within(dialog).getByLabelText("Opening amount"), {
      target: { value: "10.00" },
    });
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "Reconciled uploaded evidence" },
    });
    await user.click(within(dialog).getByRole("button", { name: "Submit for review" }));

    await waitFor(() => expect(mocks.initial).toHaveBeenCalledOnce());
    const submitted = mocks.initial.mock.calls[0]?.[1] as FormData;
    expect(submitted.get("evidenceFile")).toBe(file);
    expect(mocks.createDocument).not.toHaveBeenCalled();
  });

  it("retains a selected file, its fingerprint, source, amount, reason, and key after a network error", async () => {
    mocks.initial.mockResolvedValueOnce({
      errorCode: "database",
      message: "We could not save the opening balance. Review it and try again.",
      status: "error",
    });
    const user = userEvent.setup();
    renderScreen(superAdminProps());
    await user.click(screen.getAllByRole("button", { name: "Submit opening balance" })[0]);
    const dialog = screen.getByRole("dialog");
    const key = dialog.querySelector<HTMLInputElement>('input[name="idempotencyKey"]')!.value;
    const file = new File([new Uint8Array([1, 2, 3])], "recoverable.pdf", {
      type: "application/pdf",
    });
    await user.upload(within(dialog).getByLabelText("Evidence file"), file);
    fireEvent.change(within(dialog).getByLabelText("Opening amount"), {
      target: { value: "19.50" },
    });
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "Recover after network failure" },
    });
    fireEvent.change(within(dialog).getByLabelText("Source reference"), {
      target: { value: "IPS workbook row 19" },
    });
    await user.click(within(dialog).getByRole("button", { name: "Submit for review" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    const recovered = screen.getByRole("dialog");
    expect(within(recovered).getByText("recoverable.pdf ready for final submission"))
      .toBeTruthy();
    expect(within(recovered).getByText(/Fingerprint 039058c6f2c0/)).toBeTruthy();
    expect(within(recovered).getByLabelText<HTMLInputElement>("Opening amount").value)
      .toBe("19.50");
    expect(within(recovered).getByLabelText<HTMLInputElement>("Reason").value)
      .toBe("Recover after network failure");
    expect(within(recovered).getByLabelText<HTMLInputElement>("Source reference").value)
      .toBe("IPS workbook row 19");
    expect(recovered.querySelector<HTMLInputElement>('input[name="idempotencyKey"]')!.value)
      .toBe(key);
  });

  it("announces success persistently and moves focus away from the removed dialog", async () => {
    const user = userEvent.setup();
    renderScreen(superAdminProps());
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");
    await user.click(screen.getAllByRole("button", { name: "Submit opening balance" })[0]);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Opening amount"), {
      target: { value: "10.00" },
    });
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "Reconciled opening evidence" },
    });
    await user.click(within(dialog).getByRole("button", { name: "Submit for review" }));

    expect(status.textContent).toContain("Opening balance submitted for review.");
    await waitFor(() => expect(document.activeElement).toBe(status));
    expect(document.activeElement).not.toBe(document.body);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps its table usable as a labelled keyboard-scroll region at narrow widths", () => {
    renderScreen(superAdminProps());

    const region = screen.getByRole("region", { name: "Opening authority components" });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.className).toContain("overflow-x-auto");
    expect(within(region).getByRole("table")).toBeTruthy();
  });
});

function renderScreen(overrides: Partial<React.ComponentProps<typeof OpeningBalanceScreen>>) {
  return render(<OpeningBalanceScreen {...baseProps()} {...overrides} />);
}

function baseProps(): React.ComponentProps<typeof OpeningBalanceScreen> {
  return {
    actorUserId: actorId,
    canReview: false,
    canSubmitCorrection: false,
    canSubmitInitial: false,
    data: authorityData(),
    isSuperAdmin: false,
    ownerOptions: [{ id: ownerId, label: "Nora Owner" }],
    propertyOptions: [{ id: propertyId, label: "Riverside / RS-01" }],
    selectedMonth: "2026-08",
    selectedOwnerPersonId: ownerId,
    selectedPropertyId: propertyId,
  };
}

function superAdminProps(): React.ComponentProps<typeof OpeningBalanceScreen> {
  return {
    ...baseProps(),
    canReview: true,
    canSubmitCorrection: true,
    canSubmitInitial: true,
    isSuperAdmin: true,
  };
}

function authorityData(): OpeningBalanceAuthorityData {
  const requestBase = {
    createdAt: "2026-08-02T00:00:00Z",
    evidence: null,
    evidenceSha256: fingerprint,
    ownershipPercentSnapshot: "100.000",
    ownershipRosterHash: "c".repeat(64),
    payloadHash: "d".repeat(64),
    propertyOwnerId: "00000000-0000-4000-8000-000000000012",
    reason: "Reconciled opening evidence",
    resubmissionOfRequestId: null,
    reviewReason: null,
    reviewedAt: null,
    reviewedBy: null,
    sourceReference: "IPS workbook row 8",
    submittedAt: "2026-08-02T00:00:00Z",
    submittedBy: otherUserId,
  } as const;
  const entryBase = {
    createdAt: "2026-08-03T00:00:00Z",
    createdBy: otherUserId,
    ownershipPercentSnapshot: "100.000",
    ownershipRosterHash: "c".repeat(64),
    propertyOwnerId: requestBase.propertyOwnerId,
  } as const;
  return {
    effectiveDate: "2026-08-01",
    readiness: [
      {
        activeOwnerCount: 1,
        boundaryDate: "2026-08-01",
        canonicalRoster: null,
        issueCode: "owner_share_total_not_100",
        nextBoundaryDate: null,
        organizationId,
        ownershipPercentTotal: "99.999",
        ownershipRosterHash: null,
        propertyId,
        propertyOwnerIds: [requestBase.propertyOwnerId],
        setupPath: `/properties/${propertyId}`,
      },
    ],
    groups: [
      {
        components: [
          {
            authority: {
              amount: canonicalizeOwnerOpeningAmount("0.00"),
              entryCount: 1,
              knownZero: true,
              latestEntryAt: "2026-08-03T00:00:00Z",
              state: "known",
            },
            component: "ips_held_owner_cash",
            currentAuthorityEntryId: openingEntryId,
            entries: [
              {
                ...entryBase,
                entryKind: "opening",
                id: openingEntryId,
                requestId: ownPendingRequestId,
                reversalOfEntryId: null,
                signedAmount: canonicalizeOwnerOpeningAmount("0.00"),
              },
            ],
            requests: [
              {
                ...requestBase,
                correctionOfEntryId: null,
                id: ownPendingRequestId,
                proposedAmount: canonicalizeOwnerOpeningAmount("0.00"),
                requestKind: "initial",
                status: "submitted",
                submittedBy: actorId,
              },
            ],
          },
          {
            authority: { state: "unknown" },
            component: "owner_due_to_ips",
            currentAuthorityEntryId: null,
            entries: [],
            requests: [],
          },
          {
            authority: {
              amount: canonicalizeOwnerOpeningAmount("12.34"),
              entryCount: 3,
              knownZero: false,
              latestEntryAt: "2026-08-05T00:00:00Z",
              state: "known",
            },
            component: "ips_due_to_owner",
            currentAuthorityEntryId: replacementEntryId,
            entries: [
              {
                ...entryBase,
                entryKind: "opening",
                id: "00000000-0000-4000-8000-000000000013",
                requestId: pendingRequestId,
                reversalOfEntryId: null,
                signedAmount: canonicalizeOwnerOpeningAmount("10.00"),
              },
              {
                ...entryBase,
                entryKind: "correction_reversal",
                id: "00000000-0000-4000-8000-000000000014",
                requestId: pendingRequestId,
                reversalOfEntryId: "00000000-0000-4000-8000-000000000013",
                signedAmount: canonicalizeSignedOwnerOpeningAmount("-10.00"),
              },
              {
                ...entryBase,
                entryKind: "correction_replacement",
                id: replacementEntryId,
                requestId: pendingRequestId,
                reversalOfEntryId: null,
                signedAmount: canonicalizeOwnerOpeningAmount("12.34"),
              },
            ],
            requests: [
              {
                ...requestBase,
                correctionOfEntryId: openingEntryId,
                evidence: {
                  archivedAt: null,
                  category: "owner_opening_balance_evidence",
                  contentSha256: fingerprint,
                  fileName: "opening.pdf",
                  hashMatchesRequest: true,
                  id: documentId,
                  storagePath: `${organizationId}/${propertyId}/opening.pdf`,
                },
                id: pendingRequestId,
                proposedAmount: canonicalizeOwnerOpeningAmount("12.34"),
                requestKind: "correction",
                resubmissionOfRequestId: rejectedRequestId,
                reviewedAt: "2026-08-03T00:00:00Z",
                reviewedBy: actorId,
                status: "approved",
              },
            ],
          },
          {
            authority: { state: "unknown" },
            component: "security_deposit_custody",
            currentAuthorityEntryId: null,
            entries: [],
            requests: [
              {
                ...requestBase,
                correctionOfEntryId: null,
                id: rejectedRequestId,
                proposedAmount: canonicalizeOwnerOpeningAmount("5.00"),
                requestKind: "initial",
                reviewReason: "Evidence did not reconcile",
                reviewedAt: "2026-08-03T00:00:00Z",
                reviewedBy: actorId,
                status: "rejected",
              },
            ],
          },
        ],
        currency: "USD",
        effectiveDate: "2026-08-01",
        organizationId,
        ownerPersonId: ownerId,
        propertyId,
        rosterState: "ready",
      },
    ],
  };
}
