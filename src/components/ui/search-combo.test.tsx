// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { SearchCombo } from "./search-combo";

afterEach(cleanup);

function setup() {
  const select = vi.fn();
  const submit = vi.fn((event) => event.preventDefault());
  const props = {
    ariaLabel: "Search properties",
    placeholder: "Search properties",
    query: "River",
    submitLabel: "Search properties",
    suggestions: [{ id: "river-1", label: "River One" }, { id: "river-2", label: "River Two" }],
    onSuggestionSelect: select,
    onSubmit: submit,
  };
  const view = render(<><SearchCombo {...props} /><button>Next control</button></>);
  const input = screen.getByRole("combobox", { name: "Search properties" });
  return { ...view, input, props, select, submit };
}

it("selects a property with ArrowDown and Enter without submitting search", async () => {
  const user = userEvent.setup();
  const { input, select, submit } = setup();
  await user.click(input);
  await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
  expect(select).toHaveBeenCalledWith({ id: "river-2", label: "River Two" });
  expect(submit).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(input);
  expect(screen.queryByRole("listbox")).toBeNull();
});

it("exposes the active suggestion and supports ArrowUp", async () => {
  const user = userEvent.setup();
  const { input } = setup();
  await user.click(input);
  await user.keyboard("{ArrowUp}");
  const option = screen.getByRole("option", { name: "River Two" });
  expect(input.getAttribute("aria-activedescendant")).toBe(option.id);
  expect(option.getAttribute("aria-selected")).toBe("true");
  expect(input.getAttribute("aria-expanded")).toBe("true");
});

it("dismisses on Escape and lets Tab leave without selecting", async () => {
  const user = userEvent.setup();
  const { input, select } = setup();
  await user.click(input);
  await user.keyboard("{ArrowDown}{Escape}");
  expect(screen.queryByRole("listbox")).toBeNull();
  expect((input as HTMLInputElement).value).toBe("River");
  await user.keyboard("{ArrowDown}");
  await user.tab();
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(select).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Search properties" }));
});

it("does not select or submit during composition", () => {
  const { input, select, submit } = setup();
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.compositionStart(input);
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  expect(select).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
});

it("does not select a stale suggestion after the result list changes", async () => {
  const user = userEvent.setup();
  const { input, props, rerender, select, submit } = setup();
  await user.click(input);
  await user.keyboard("{ArrowDown}{ArrowDown}");
  rerender(<SearchCombo {...props} suggestions={[{ id: "home", label: "Home" }]} />);
  await user.keyboard("{Enter}");
  expect(select).not.toHaveBeenCalled();
  expect(submit).toHaveBeenCalledOnce();
});

it("keeps pointer selection and plain Enter search working", async () => {
  const user = userEvent.setup();
  const { input, select, submit } = setup();
  await user.click(input);
  await user.keyboard("{Enter}");
  expect(submit).toHaveBeenCalledOnce();
  await user.click(screen.getByText("River One"));
  expect(select).toHaveBeenCalledWith({ id: "river-1", label: "River One" });
});
