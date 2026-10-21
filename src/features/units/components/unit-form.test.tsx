/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { UnitActionState } from "../actions";
import { UnitForm } from "./unit-form";

const { createUnitAction, updateUnitAction } = vi.hoisted(() => ({
  createUnitAction: vi.fn(), updateUnitAction: vi.fn(),
}));
vi.mock("../actions", () => ({ createUnitAction, updateUnitAction }));

beforeEach(() => {
  createUnitAction.mockReset();
  updateUnitAction.mockReset();
  props.onClose.mockReset();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("ResizeObserver", class { disconnect() {} observe() {} unobserve() {} });
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: false, addEventListener() {}, removeEventListener() {},
  })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const props = {
  properties: [{ id: "10000000-0000-4000-8000-000000000001", label: "Synthetic property" }],
  initialValues: { propertyId: "10000000-0000-4000-8000-000000000001" },
  onClose: vi.fn(),
};

it("retains the same creation key and physical draft across a lost Server Action response", async () => {
  const firstResponse = Promise.withResolvers<UnitActionState>();
  createUnitAction.mockReturnValueOnce(firstResponse.promise)
    .mockResolvedValueOnce({ status: "success", unitId: "20000000-0000-4000-8000-000000000001", message: "Unit added." });
  render(<UnitForm {...props} />);
  const form = screen.getByRole<HTMLFormElement>("form", { name: "Add unit form" });
  const key = new FormData(form).get("idempotencyKey");
  expect(key).toMatch(/^[0-9a-f-]{36}$/);
  const physicalDraft = {
    unitNumber: "\u00c9tage\u00a01",
    floor: "\u00c9tage\u00a02",
    sizeSqm: "48.25",
    bedroomCount: "0",
    bathroomCount: "1",
  };
  for (const [name, value] of Object.entries(physicalDraft)) {
    fireEvent.change(form.querySelector(`[name="${name}"]`)!, { target: { value } });
  }
  const submittedDraft = {
    ...physicalDraft,
    idempotencyKey: key,
    operationalState: "active",
    propertyId: props.initialValues.propertyId,
  };
  fireEvent.click(screen.getByRole("button", { name: "Add unit" }));
  await waitFor(() => expect(createUnitAction).toHaveBeenCalledTimes(1));
  expect(form.getAttribute("aria-busy")).toBe("true");
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Add unit" }).disabled).toBe(true);
  // Even a second submit event cannot bypass the real form's pending lock.
  fireEvent.submit(form);
  expect(createUnitAction).toHaveBeenCalledTimes(1);
  await act(async () => { firstResponse.reject(new Error("synthetic lost response")); });
  await screen.findByText(/Keep this form open and retry the same details/);
  expect(Object.fromEntries(new FormData(form))).toEqual(submittedDraft);
  expect(form.querySelector("fieldset")?.disabled).toBe(false);
  expect(props.onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Add unit" }));
  await screen.findByText("Unit added.");
  expect(createUnitAction).toHaveBeenCalledTimes(2);
  const first = [...(createUnitAction.mock.calls[0][1] as FormData).entries()];
  const second = [...(createUnitAction.mock.calls[1][1] as FormData).entries()];
  expect(second).toEqual(first);
  expect(Object.fromEntries(first)).toEqual(submittedDraft);
  expect(screen.queryByRole("button", { name: "Add unit" })).toBeNull();
  expect(form.querySelector("fieldset")?.disabled).toBe(true);
  expect(props.onClose).not.toHaveBeenCalled();
});

it("keeps a rejected request key through rerender and allocates a new one only for a new form", async () => {
  createUnitAction.mockResolvedValue({ status: "error", message: "Check the request." });
  const view = render(<UnitForm {...props} />);
  const form = screen.getByRole("form") as HTMLFormElement;
  const original = new FormData(form).get("idempotencyKey");
  fireEvent.change(form.querySelector('[name="unitNumber"]')!, { target: { value: "2A" } });
  fireEvent.click(screen.getByRole("button", { name: "Add unit" }));
  await screen.findByText("Check the request.");
  view.rerender(<UnitForm {...props} />);
  expect(new FormData(form).get("idempotencyKey")).toBe(original);
  view.unmount();
  render(<UnitForm {...props} />);
  await waitFor(() => expect(new FormData(screen.getByRole("form") as HTMLFormElement).get("idempotencyKey")).not.toBe(original));
});
