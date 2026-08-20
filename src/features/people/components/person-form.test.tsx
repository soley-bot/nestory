/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/people/actions", () => ({
  createPersonAction: async () => ({}),
  updatePersonAction: async () => ({}),
}));

vi.stubGlobal(
  "ResizeObserver",
  class ResizeObserverMock {
    disconnect() {}
    observe() {}
    unobserve() {}
  },
);

import { PersonForm } from "@/features/people/components/person-form";
import type {
  PeopleSummary,
  PersonRoleValue,
} from "@/features/people/people.types";

afterEach(cleanup);

describe("PersonForm role-specific presentation", () => {
  it.each([
    {
      displayLabel: "Owner name",
      notesLabel: "Owner notes",
      role: "owner",
      showsTaxIdentifier: true,
    },
    {
      displayLabel: "Tenant name",
      notesLabel: "Tenancy notes",
      role: "tenant",
      showsTaxIdentifier: false,
    },
    {
      displayLabel: "Staff name",
      notesLabel: "Staff notes",
      role: "staff",
      showsTaxIdentifier: false,
    },
    {
      displayLabel: "Vendor or business name",
      notesLabel: "Vendor notes",
      role: "vendor",
      showsTaxIdentifier: true,
    },
  ] satisfies Array<{
    displayLabel: string;
    notesLabel: string;
    role: PersonRoleValue;
    showsTaxIdentifier: boolean;
  }>)(
    "shows supported $role fields as one continuous form",
    ({ displayLabel, notesLabel, role, showsTaxIdentifier }) => {
      const { container } = render(
        <PersonForm
          initialRoles={[role]}
          onClose={vi.fn()}
          roleContext={role}
        />,
      );

      expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
      expect(
        screen.getByRole("group", { name: new RegExp(displayLabel) }),
      ).toBeTruthy();
      expect(
        screen.getByRole("group", { name: new RegExp(notesLabel) }),
      ).toBeTruthy();
      expect(
        Boolean(screen.queryByRole("group", { name: "Tax identifier" })),
      ).toBe(showsTaxIdentifier);
      expect(
        container.querySelector<HTMLInputElement>(
          'input[name="taxIdentifier"]',
        ),
      ).not.toBeNull();
      expect(
        screen.queryByRole("group", { name: "Operational roles" }),
      ).toBeNull();
      expect(screen.queryByRole("region", { name: "Role effect" })).toBeNull();
      expect(
        screen.queryByRole("region", { name: "Access boundary" }),
      ).toBeNull();
      expect(
        container.querySelector<HTMLInputElement>('input[name="roles"]')?.value,
      ).toBe(role);
    },
  );

  it("uses labels instead of example placeholders and formats phone input", () => {
    render(
      <PersonForm
        initialRoles={["owner"]}
        onClose={vi.fn()}
        roleContext="owner"
      />,
    );

    expect(screen.queryByPlaceholderText("Sokha Chan")).toBeNull();
    expect(
      screen.queryByPlaceholderText("Optional registered name"),
    ).toBeNull();
    expect(screen.queryByPlaceholderText("name@example.com")).toBeNull();
    expect(screen.queryByPlaceholderText("+855 ...")).toBeNull();

    const phone = screen.getByRole("textbox", {
      name: "Primary phone",
    }) as HTMLInputElement;
    fireEvent.change(phone, { target: { value: "+85512345678" } });
    expect(phone.value).toBe("+855 12 345 678");
  });

  it.each(["owner", "tenant"] satisfies PersonRoleValue[])(
    "collects passport and visa follow-up dates for a %s",
    (role) => {
      render(
        <PersonForm
          initialRoles={[role]}
          onClose={vi.fn()}
          roleContext={role}
        />,
      );

      expect(
        screen.getByRole("group", { name: "Passport number" }),
      ).toBeTruthy();
      expect(
        screen.getByRole("group", { name: "Passport expiry date" }),
      ).toBeTruthy();
      expect(
        screen.getByRole("group", { name: "Visa expiry date" }),
      ).toBeTruthy();
    },
  );

  it("shows travel documents when editing a multi-role tenant from People", () => {
    render(
      <PersonForm
        mode="edit"
        onClose={vi.fn()}
        person={
          {
            contact: {},
            displayName: "Multi Role Person",
            formValues: {
              displayName: "Multi Role Person",
              partyType: "individual",
              roles: ["tenant", "vendor"],
            },
            id: "person-1",
            partyType: "individual",
            roles: [
              { role: "tenant", status: "active" },
              { role: "vendor", status: "active" },
            ],
          } as PeopleSummary
        }
      />,
    );

    expect(
      screen.getByRole("group", { name: "Passport number" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("group", { name: "Visa expiry date" }),
    ).toBeTruthy();
  });
});
