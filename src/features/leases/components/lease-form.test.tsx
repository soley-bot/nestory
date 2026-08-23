/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(cleanup);

describe("LeaseForm inline tenant billing recipient", () => {
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
    "preserves the party type from %s in the lease billing payload",
    (completionLabel, personId, partyType) => {
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

      fireEvent.click(screen.getByRole("button", { name: "New tenant" }));
      fireEvent.click(screen.getByRole("button", { name: completionLabel }));

      const form = screen.getByRole("form", { name: "Add lease form" });
      const payload = new FormData(form);
      expect(payload.get("tenantPersonId")).toBe(personId);
      expect(payload.get("billingRecipientKind")).toBe(partyType);
      expect(payload.get("billingRecipientPersonId")).toBe(personId);
    },
  );
});
