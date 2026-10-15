/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPropertySummary } from "@/features/properties/data/property-summary";
import { PropertyForm } from "./property-form";

const { updatePropertyAction } = vi.hoisted(() => ({ updatePropertyAction: vi.fn() }));
vi.mock("@/features/properties/actions", () => ({ updatePropertyAction, createPropertyAction: vi.fn() }));
vi.mock("@/features/people/components/person-form", () => ({ PersonForm: () => null }));

const initialVersion = "50000000-0000-4000-8000-000000000001";
const property = buildPropertySummary({
  property: {
    id: "10000000-0000-4000-8000-000000000001", name: "Original property", code: "HOME",
    property_type: "House/Villa", address: "Original address", owner: null, status: "active", edit_version: initialVersion,
  },
  units: [], ledgerEntries: [],
});

beforeEach(() => {
  updatePropertyAction.mockReset();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("ResizeObserver", class { disconnect() {} observe() {} unobserve() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("property editor concurrency", () => {
  it.each([
    "This property changed while you were editing. Your edits are still here.",
    "You no longer have permission to save this property. Your edits are still here.",
  ])("preserves the draft and its original version after rejection: %s", async (message) => {
    updatePropertyAction.mockResolvedValue({ status: "error", message });
    const onClose = vi.fn();
    const view = render(<PropertyForm mode="edit" onClose={onClose} ownerOptions={[]} property={property} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Property name/ }), { target: { value: "My draft" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Notes" }), { target: { value: "Keep these notes" } });
    fireEvent.submit(screen.getByRole("form", { name: "Edit property form" }));
    await screen.findByText(message);
    view.rerender(<PropertyForm mode="edit" onClose={onClose} ownerOptions={[]} property={{ ...property, editVersion: "50000000-0000-4000-8000-000000000002", formValues: { ...property.formValues, name: "Other editor" } }} />);
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: /Property name/ }).value).toBe("My draft");
    expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Notes" }).value).toBe("Keep these notes");
    expect(document.querySelector<HTMLInputElement>('input[name="expectedVersion"]')?.value).toBe(initialVersion);
    expect(screen.getByRole("link", { name: "Open latest property in another tab" }).getAttribute("target")).toBe("_blank");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("sends one in-flight submission and safely retries the same draft after a lost response", async () => {
    let rejectRequest!: (error: Error) => void;
    updatePropertyAction.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRequest = reject; }));
    updatePropertyAction.mockResolvedValueOnce({ status: "success", changed: false, message: "No changes to save.", propertyId: property.id });
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    render(<PropertyForm mode="edit" onClose={onClose} onSuccess={onSuccess} ownerOptions={[]} property={property} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Property name/ }), { target: { value: "Saved despite lost response" } });
    const form = screen.getByRole("form", { name: "Edit property form" });
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(updatePropertyAction).toHaveBeenCalledTimes(1);
    await act(async () => { rejectRequest(new Error("connection lost")); });
    expect(await screen.findByText(/We could not confirm the save/)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.submit(form);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(Array.from(updatePropertyAction.mock.calls[0][1].entries())).toEqual(Array.from(updatePropertyAction.mock.calls[1][1].entries()));
    expect(onSuccess).toHaveBeenCalledWith("No changes to save.", property.id);
  });

  it("keeps photo upload outside the property edit transaction", () => {
    render(<PropertyForm mode="edit" onClose={vi.fn()} ownerOptions={[]} property={property} />);
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getByRole("link", { name: "Open photos" }).getAttribute("href")).toBe(`/properties/${property.id}?section=files`);
  });
});
