/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PersonPartyType,
  PersonRoleValue,
} from "@/features/people/people.types";

vi.mock("@/features/leases/actions", () => ({
  createLeaseAction: async () => ({}),
  updateLeaseAction: async () => ({}),
}));

vi.mock("@/features/people/components/person-form", () => ({
  PersonForm: ({
    onSuccess,
  }: {
    onSuccess?: (
      message: string,
      personId?: string,
      roles?: PersonRoleValue[],
      displayName?: string,
      partyType?: PersonPartyType,
    ) => void;
  }) => (
    <div>
      <button
        onClick={() =>
          onSuccess?.(
            "Person added.",
            "22222222-2222-4222-8222-222222222222",
            ["tenant"],
            "Acme Tenant LLC",
            "company",
          )
        }
        type="button"
      >
        Complete company tenant
      </button>
      <button
        onClick={() =>
          onSuccess?.(
            "Person added.",
            "11111111-1111-4111-8111-111111111111",
            ["tenant"],
            "Ari Tenant",
            "individual",
          )
        }
        type="button"
      >
        Complete individual tenant
      </button>
    </div>
  ),
}));

import { LeaseForm } from "@/features/leases/components/lease-form";

beforeEach(() => {
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
    setPointerCapture: { configurable: true, value: () => undefined },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
});

describe("LeaseForm inline tenant billing recipient", () => {
  it("separates the deposit obligation from an optional receipt and defaults the receipt", async () => {
    const user = userEvent.setup();
    render(
      <LeaseForm
        onClose={() => undefined}
        properties={[]}
        tenants={[]}
        units={[]}
      />,
    );

    const form = screen.getByRole("form", { name: "Add lease form" });
    expect(screen.getByText("Deposit required")).not.toBeNull();
    fireEvent.change(form.elements.namedItem("depositAmount")!, {
      target: { value: "750" },
    });

    await user.click(screen.getByRole("combobox", { name: "Deposit received?" }));
    await user.click(screen.getByRole("option", { name: "Yes, received" }));

    expect(screen.getByText("Received amount")).not.toBeNull();
    expect(screen.getByLabelText("Received on")).not.toBeNull();
    const payload = new FormData(form);
    expect(payload.get("depositReceived")).toBe("yes");
    expect(payload.get("depositReceivedAmount")).toBe("750");
    expect(payload.get("depositReceivedOn")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it.each([
    [
      "Complete company tenant",
      "22222222-2222-4222-8222-222222222222",
      "company",
    ],
    [
      "Complete individual tenant",
      "11111111-1111-4111-8111-111111111111",
      "individual",
    ],
  ] as const)(
    "preserves edited billing values and the party type from %s",
    async (completionLabel, personId, partyType) => {
      const user = userEvent.setup();
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const consoleWarn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      render(
        <LeaseForm
          billingFormConfig={{
            companyOptions: [],
            operationalTimezone: "Asia/Bangkok",
            organizationName: "Nestory",
          }}
          onClose={() => undefined}
          properties={[]}
          tenants={[]}
          units={[]}
        />,
      );

      const form = screen.getByRole("form", { name: "Add lease form" });
      const chooseOption = async (label: RegExp | string, option: string) => {
        await user.click(screen.getByRole("combobox", { name: label }));
        await user.click(await screen.findByRole("option", { name: option }));
      };

      await chooseOption("Who collects rent?", "Collected by owner");
      await chooseOption("Management fee", "Flat amount");
      fireEvent.change(form.elements.namedItem("managementFeeValue")!, {
        target: { value: "125.50" },
      });
      await chooseOption(/^Charge management fee\?/, "No");
      await user.click(
        screen.getByText("Advanced billing rules", { selector: "summary" }),
      );
      await chooseOption(/^Keep full fee in pro-rata months\?/, "Yes");
      fireEvent.change(form.elements.namedItem("rentCalculationTimezone")!, {
        target: { value: "Pacific/Honolulu" },
      });
      fireEvent.change(form.elements.namedItem("firstPeriodProratedAmount")!, {
        target: { value: "321.45" },
      });
      fireEvent.change(form.elements.namedItem("finalPeriodProratedAmount")!, {
        target: { value: "654.32" },
      });

      await user.click(screen.getByRole("button", { name: "New tenant" }));
      await user.click(screen.getByRole("button", { name: completionLabel }));

      const payload = new FormData(form);
      expect(payload.get("tenantPersonId")).toBe(personId);
      expect(payload.get("billingRecipientKind")).toBe(partyType);
      expect(payload.get("billingRecipientPersonId")).toBe(personId);
      expect(payload.get("collectionRoute")).toBe("direct_to_owner");
      expect(payload.get("managementFeeMode")).toBe("flat");
      expect(payload.get("managementFeeValue")).toBe("125.50");
      expect(payload.get("chargeManagementFeeWhenActive")).toBe("no");
      expect(payload.get("fullManagementFeeDuringProration")).toBe("yes");
      expect(payload.get("chargeThroughLeaseEnd")).toBe("yes");
      expect(payload.get("rentCalculationTimezone")).toBe("Pacific/Honolulu");
      expect(payload.get("firstPeriodProratedAmount")).toBe("321.45");
      expect(payload.get("finalPeriodProratedAmount")).toBe("654.32");
      expect(consoleError).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();
    },
  );
});
