/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/people/actions", () => ({
  createPersonAction: async () => ({}),
  updatePersonAction: async () => ({}),
}));

import { PersonForm } from "@/features/people/components/person-form";
import type { PersonRoleValue } from "@/features/people/people.types";

afterEach(cleanup);

describe("PersonForm role-specific presentation", () => {
  it.each([
    {
      contactHeading: "Statement contact",
      displayLabel: "Owner name",
      identityHeading: "Owner identity",
      notesLabel: "Owner notes",
      role: "owner",
      showsTaxIdentifier: true,
    },
    {
      contactHeading: "Tenancy contact",
      displayLabel: "Tenant name",
      identityHeading: "Tenant identity",
      notesLabel: "Tenancy notes",
      role: "tenant",
      showsTaxIdentifier: false,
    },
    {
      contactHeading: "Operational contact",
      displayLabel: "Staff name",
      identityHeading: "Staff identity",
      notesLabel: "Staff notes",
      role: "staff",
      showsTaxIdentifier: false,
    },
    {
      contactHeading: "Business contact",
      displayLabel: "Vendor or business name",
      identityHeading: "Vendor identity",
      notesLabel: "Vendor notes",
      role: "vendor",
      showsTaxIdentifier: true,
    },
  ] satisfies Array<{
    contactHeading: string;
    displayLabel: string;
    identityHeading: string;
    notesLabel: string;
    role: PersonRoleValue;
    showsTaxIdentifier: boolean;
  }>)(
    "shows supported $role fields without unrelated administration",
    ({
      contactHeading,
      displayLabel,
      identityHeading,
      notesLabel,
      role,
      showsTaxIdentifier,
    }) => {
      const { container } = render(
        <PersonForm
          initialRoles={[role]}
          onClose={vi.fn()}
          roleContext={role}
        />,
      );

      expect(screen.getByRole("heading", { name: identityHeading })).toBeTruthy();
      expect(screen.getByRole("heading", { name: contactHeading })).toBeTruthy();
      expect(
        screen.getByRole("group", { name: new RegExp(displayLabel) }),
      ).toBeTruthy();
      expect(
        screen.getByRole("group", { name: new RegExp(notesLabel) }),
      ).toBeTruthy();
      expect(
        Boolean(screen.queryByRole("group", { name: "Tax identifier" })),
      ).toBe(
        showsTaxIdentifier,
      );
      expect(
        container.querySelector<HTMLInputElement>('input[name="taxIdentifier"]'),
      ).not.toBeNull();
      expect(
        screen.queryByRole("group", { name: "Operational roles" }),
      ).toBeNull();
    },
  );

  it("explains that Staff identity and Workspace Access are separate", () => {
    render(
      <PersonForm
        initialRoles={["staff"]}
        onClose={vi.fn()}
        roleContext="staff"
      />,
    );

    expect(
      screen.getByText(
        "Create the Staff record first, then grant Workspace Access with an Access Level and Scope.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/auth user|membership identity/i)).toBeNull();
  });
});
