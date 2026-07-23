/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersonSelect } from "@/features/people/components/person-select";

const options = [
  {
    archived: false,
    description: "Owner · alex@example.com",
    id: "person-1",
    label: "Alex Owner",
    roles: ["owner" as const],
  },
  {
    archived: false,
    description: "Owner · dara@example.com",
    id: "person-2",
    label: "Dara Owner",
    roles: ["owner" as const],
  },
];

afterEach(cleanup);

describe("PersonSelect", () => {
  it("tracks a stable active option ID and selects it with the keyboard", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <PersonSelect
        context="Property owner"
        name="ownerPersonId"
        onValueChange={onValueChange}
        options={options}
        roles={["owner"]}
      />,
    );
    const combobox = screen.getByRole("combobox", { name: "Property owner" });

    fireEvent.focus(combobox);
    const renderedOptions = screen.getAllByRole("option");
    expect(combobox.getAttribute("aria-activedescendant")).toBe(
      renderedOptions[0]!.id,
    );

    fireEvent.keyDown(combobox, { key: "ArrowDown" });
    expect(combobox.getAttribute("aria-activedescendant")).toBe(
      renderedOptions[1]!.id,
    );
    fireEvent.keyDown(combobox, { key: "Enter" });

    expect(onValueChange).toHaveBeenCalledWith("person-2");
    expect(
      container.querySelector<HTMLInputElement>('input[name="ownerPersonId"]')
        ?.value,
    ).toBe("person-2");
    expect(screen.getByText("Dara Owner")).toBeTruthy();
  });

  it("clears an optional selected person and submits an empty value", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <PersonSelect
        allowClear
        context="Property owner"
        defaultValue="person-1"
        name="ownerPersonId"
        onValueChange={onValueChange}
        options={options}
        roles={["owner"]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Clear Property owner" }),
    );

    expect(onValueChange).toHaveBeenCalledWith("");
    expect(
      container.querySelector<HTMLInputElement>('input[name="ownerPersonId"]')
        ?.value,
    ).toBe("");
    expect(
      screen.queryByRole("button", { name: "Clear Property owner" }),
    ).toBeNull();
  });

  it("does not offer clearing unless the caller explicitly allows it", () => {
    render(
      <PersonSelect
        aria-required="true"
        context="Lease tenant"
        defaultValue="person-1"
        name="tenantPersonId"
        options={options}
        roles={["owner"]}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: "Lease tenant" }).getAttribute(
        "aria-required",
      ),
    ).toBe("true");
    expect(screen.queryByRole("button", { name: /Clear/ })).toBeNull();
  });
});
