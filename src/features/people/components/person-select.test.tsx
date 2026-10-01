/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Modal } from "@/components/ui/modal";
import { RecordField } from "@/components/ui/record-form";
import { OverlayPortalContainerProvider } from "@/components/ui/overlay-portal-container";
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

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

afterEach(() => {
  cleanup();
  document
    .querySelectorAll('[data-testid="person-select-portal"]')
    .forEach((node) => node.remove());
});

function InputEventHarness() {
  const [lastInput, setLastInput] = useState("No input event");

  return (
    <form
      onInput={(event) => {
        const target = event.target as HTMLInputElement;
        setLastInput(`${target.name}:${target.value}`);
      }}
    >
      <PersonSelect
        context="Property owner"
        name="ownerPersonId"
        options={options}
        roles={["owner"]}
      />
      <output>{lastInput}</output>
    </form>
  );
}

describe("PersonSelect", () => {
  it.each(["fieldset", "control"])("preserves the selected person when its open %s becomes disabled", async (target) => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const renderControl = (disabled: boolean) => <fieldset disabled={target === "fieldset" && disabled}><PersonSelect context="Property owner" defaultValue="person-1" disabled={target === "control" && disabled} name="ownerPersonId" onValueChange={onValueChange} options={options} roles={["owner"]} /></fieldset>;
    const { container, rerender } = render(renderControl(false));
    await user.click(screen.getByRole("combobox", { name: "Property owner" }));
    rerender(renderControl(true));
    await user.click(screen.getByRole("option", { name: /Dara Owner/ }));
    expect(onValueChange).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLInputElement>('input[name="ownerPersonId"]')?.value).toBe("person-1");
  });

  it("does not submit or replace a person when Enter has no matching option", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event) => event.preventDefault());
    const onValueChange = vi.fn();
    const { container } = render(<form onSubmit={onSubmit}><PersonSelect context="Property owner" defaultValue="person-1" name="ownerPersonId" onValueChange={onValueChange} options={options} roles={["owner"]} /><button type="submit">Save</button></form>);
    await user.click(screen.getByRole("combobox", { name: "Property owner" }));
    await user.clear(screen.getByRole("combobox", { name: "Property owner" }));
    await user.type(screen.getByRole("combobox", { name: "Property owner" }), "No match{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onValueChange).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLInputElement>('input[name="ownerPersonId"]')?.value).toBe("person-1");
  });

  it("exposes the selected person as the labeled input value with its error", async () => {
    const user = userEvent.setup();
    render(<RecordField error="Choose an active owner." label="Property owner" name="ownerPersonId" required>
      <PersonSelect context="Owner" defaultValue="person-1" name="ownerPersonId" options={options} roles={["owner"]} />
    </RecordField>);
    const control = screen.getByRole("combobox", { name: /^Property owner\s*\(required\)$/ }) as HTMLInputElement;
    expect(control.value).toBe("Alex Owner");
    expect(control.getAttribute("aria-invalid")).toBe("true");
    expect(control.getAttribute("aria-required")).toBe("true");
    expect(document.getElementById(control.getAttribute("aria-describedby")!)?.textContent).toBe("Choose an active owner.");
    await user.click(control);
    expect(control.value).toBe("Alex Owner");
    await user.clear(control);
    await user.type(control, "Dara");
    await user.keyboard("{Enter}");
    expect(control.value).toBe("Dara Owner");
    expect(document.activeElement).toBe(control);
  });

  it("dismisses search with Escape while preserving the modal and selection", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal onClose={onClose} open title="Edit owner"><PersonSelect context="Property owner" defaultValue="person-1" name="ownerPersonId" options={options} roles={["owner"]} /></Modal>);
    const control = screen.getByRole("combobox", { name: "Property owner" }) as HTMLInputElement;
    await user.click(control);
    await user.clear(control);
    await user.type(control, "Dara");
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(control.value).toBe("Alex Owner");
    expect(document.activeElement).toBe(control);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("tabs past options and restores the selected value after an uncommitted search", async () => {
    const user = userEvent.setup();
    render(<><PersonSelect context="Property owner" defaultValue="person-1" name="ownerPersonId" options={options} roles={["owner"]} /><button>Continue</button></>);
    const control = screen.getByRole("combobox", { name: "Property owner" }) as HTMLInputElement;
    await user.click(control);
    await user.clear(control);
    await user.type(control, "Dara");
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Continue" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(control.value).toBe("Alex Owner");
  });

  it("renders its options outside an overlay's scrolling form", () => {
    const portalContainer = document.createElement("div");
    portalContainer.dataset.testid = "person-select-portal";
    document.body.append(portalContainer);

    const { container } = render(
      <OverlayPortalContainerProvider value={portalContainer}>
        <div data-testid="scrolling-form">
          <PersonSelect
            context="Property owner"
            name="ownerPersonId"
            options={options}
            roles={["owner"]}
          />
        </div>
      </OverlayPortalContainerProvider>,
    );

    fireEvent.focus(
      screen.getByRole("combobox", { name: "Property owner" }),
    );

    const listbox = screen.getByRole("listbox", {
      name: "Property owner person options",
    });
    expect(portalContainer.contains(listbox)).toBe(true);
    expect(screen.getByTestId("scrolling-form").contains(listbox)).toBe(false);

    fireEvent.click(screen.getByRole("option", { name: /Dara Owner/ }));
    expect(
      container.querySelector<HTMLInputElement>('input[name="ownerPersonId"]')
        ?.value,
    ).toBe("person-2");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("emits a bubbling input event from its relationship input", async () => {
    render(<InputEventHarness />);

    fireEvent.focus(
      screen.getByRole("combobox", { name: "Property owner" }),
    );
    fireEvent.click(screen.getByRole("option", { name: /Dara Owner/ }));

    expect(
      await screen.findByText("ownerPersonId:person-2"),
    ).not.toBeNull();
  });

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
    expect(screen.getByDisplayValue("Dara Owner")).toBeTruthy();
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
