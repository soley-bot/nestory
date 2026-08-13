// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/imports/cutover-actions", () => ({
  commitIpsCutoverBatchAction: vi.fn(),
  stageIpsCutoverBatchAction: vi.fn(),
}));

import { CutoverPanel } from "./cutover-panel";

afterEach(cleanup);

describe("CutoverPanel", () => {
  it("shows the import plan, blockers, selected months, exact totals, and optional audit data", () => {
    render(
      <CutoverPanel
        canManage
        detail={{
          authorityStartDate: "2026-09-01",
          batchId: "10000000-0000-4000-8000-000000000001",
          blockers: ["One lease relationship is ambiguous"],
          dataOwner: "REDACTED-IPS-DATA-OWNER",
          importCounts: [
            { actual: "1", expected: "1", label: "properties" },
          ],
          manifestSha256: "a".repeat(64),
          ownerOpeningTotals: [
            { amount: "2290.50", currency: "USD" },
            { amount: "4000000.00", currency: "KHR" },
          ],
          reconciliationDifferences: [],
          reconciliationSha256: null,
          selectedRentMonths: ["2026-07-01", "2026-08-01"],
          signedExceptions: [
            {
              approvedAt: "2026-08-10T01:02:03Z",
              approvedBy: "REDACTED-DATA-OWNER",
              reason: "Redacted source exception independently approved",
              sourceKey: "cutover-exception-v1",
            },
          ],
          status: "staged",
          tenantOpeningTotals: [
            { amount: "875.00", currency: "USD" },
            { amount: "500000.00", currency: "KHR" },
          ],
        }}
      />,
    );

    expect(screen.getByText("2026-09-01")).toBeTruthy();
    expect(screen.getByText("REDACTED-IPS-DATA-OWNER")).toBeTruthy();
    expect(screen.getByText("One lease relationship is ambiguous")).toBeTruthy();
    expect(screen.getByText("2026-07-01, 2026-08-01")).toBeTruthy();
    expect(screen.getByText("875.00 USD")).toBeTruthy();
    expect(screen.getByText("500000.00 KHR")).toBeTruthy();
    expect(screen.getByText("2290.50 USD")).toBeTruthy();
    expect(screen.getByText("4000000.00 KHR")).toBeTruthy();
    expect(
      screen.getByText(
        "Redacted source exception independently approved (REDACTED-DATA-OWNER, 2026-08-10T01:02:03Z)",
      ),
    ).toBeTruthy();
    expect(screen.getByText("cutover-exception-v1")).toBeTruthy();
    expect(screen.getByText("properties: 1 expected / 1 actual")).toBeTruthy();
    expect(
      (screen.getByRole("button", {
        name: "Confirm imported totals",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("keeps Finance readers read-only", () => {
    render(<CutoverPanel canManage={false} detail={null} />);

    expect(screen.getByText("Import cutover is read-only for this role.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /cutover/i })).toBeNull();
  });

  it("renders usable stage and sign-off forms for Super Admin", () => {
    render(
      <CutoverPanel
        canManage
        detail={{
          authorityStartDate: "2026-09-01",
          batchId: "10000000-0000-4000-8000-000000000001",
          blockers: [],
          dataOwner: "REDACTED-IPS-DATA-OWNER",
          importCounts: [],
          manifestSha256: "a".repeat(64),
          ownerOpeningTotals: [{ amount: "2290.50", currency: "USD" }],
          reconciliationDifferences: [],
          reconciliationSha256: null,
          selectedRentMonths: ["2026-07-01", "2026-08-01"],
          signedExceptions: [],
          status: "staged",
          tenantOpeningTotals: [{ amount: "875.00", currency: "USD" }],
        }}
      />,
    );

    expect(screen.getByLabelText("Start date")).toBeTruthy();
    expect(screen.getByLabelText("Data owner")).toBeTruthy();
    expect(
      (document.querySelector('input[name="idempotencyKey"]') as HTMLInputElement).value,
    ).toMatch(/^ips-cutover-stage-/);
    expect(screen.getByLabelText("Manifest data (JSON)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stage import plan" })).toBeTruthy();
    expect(screen.getByLabelText("Approval reason")).toBeTruthy();
    expect(
      (
        document.querySelectorAll('input[name="idempotencyKey"]')[1] as HTMLInputElement
      ).value,
    ).toBe(
      "ips-cutover-commit-10000000-0000-4000-8000-000000000001",
    );
    expect(screen.getByRole("button", { name: "Confirm imported totals" })).toBeTruthy();
  });
});
