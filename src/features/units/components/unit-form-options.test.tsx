/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnitFormOptions } from "./unit-form-options";
import type { UnitFormOptionsMode } from "@/features/units/unit-form-options.types";

const options = { billingFormConfig: { companyOptions: [], operationalTimezone: "UTC", organizationName: "Synthetic" }, tenants: [] };
const fetchMock = vi.fn<typeof fetch>();

function payload(unitId = "unit-a", propertyId = "property-a") {
  return Response.json({ mode: "lease", unitId, propertyId, options });
}

function Form({ unitId = "unit-a", propertyId = "property-a", mode = "lease" }: { unitId?: string; propertyId?: string; mode?: UnitFormOptionsMode }) {
  return <UnitFormOptions mode={mode} propertyId={propertyId} unitId={unitId}>{() => <form aria-label={`Loaded ${mode} form`} />}</UnitFormOptions>;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Unit form options request lifecycle", () => {
  it("loads exactly one mode request per drawer and renders the form only after it arrives", async () => {
    fetchMock.mockResolvedValue(payload());
    const view = render(<Form />);
    expect(screen.getByRole("status").textContent).toBe("Loading form…");
    expect(screen.queryByRole("form")).toBeNull();
    await screen.findByRole("form", { name: "Loaded lease form" });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/units/unit-a/form-options?mode=lease", expect.objectContaining({ cache: "no-store", credentials: "same-origin", signal: expect.any(AbortSignal) }));
    view.rerender(<Form />);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts a closed drawer and ignores a late completion when it opens again", async () => {
    let resolveOld!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    const view = render(<Form />);
    const oldSignal = fetchMock.mock.calls[0][1]?.signal;
    view.unmount();
    expect(oldSignal?.aborted).toBe(true);
    fetchMock.mockResolvedValueOnce(payload());
    render(<Form />);
    await screen.findByRole("form");
    await act(async () => resolveOld(Response.json({ mode: "lease", unitId: "unit-a", propertyId: "property-a", options: null })));
    expect(screen.getByRole("form")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    { unitId: "unit-b", propertyId: "property-a" },
    { unitId: "unit-a", propertyId: "property-b" },
    { unitId: "unit-a", propertyId: "property-a", mode: "maintenance" as const },
  ])("aborts and prevents a stale form after the request scope changes (%s)", async (next) => {
    let resolveOld!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    const view = render(<Form />);
    const oldSignal = fetchMock.mock.calls[0][1]?.signal;
    view.rerender(<Form {...next} />);
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => resolveOld(payload()));
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Loading form…");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not briefly show completed data after switching units", async () => {
    fetchMock.mockResolvedValueOnce(payload());
    const view = render(<Form />);
    await screen.findByRole("form");
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    view.rerender(<Form unitId="unit-b" />);
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it.each([401, 403])("gives clear access guidance for %s without exposing response details", async (status) => {
    fetchMock.mockResolvedValue(new Response("sensitive details", { status }));
    render(<Form />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Your access to this form has changed. Refresh the page to check your access.");
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("retries a failed request and keeps the form unavailable until successful", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    fetchMock.mockResolvedValueOnce(payload());
    render(<Form />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("form");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([404, 409])("asks for a refresh when the unit is unavailable (%s)", async (status) => {
    fetchMock.mockResolvedValue(new Response("unavailable", { status }));
    render(<Form />);
    expect((await screen.findByRole("alert")).textContent).toBe("This unit is no longer available for this form. Refresh the page.");
    expect(screen.queryByRole("form")).toBeNull();
  });

  it.each([
    { mode: "lease", unitId: "other-unit", propertyId: "property-a", options },
    { mode: "lease", unitId: "unit-a", propertyId: "other-property", options },
    { mode: "maintenance", unitId: "unit-a", propertyId: "property-a", options },
    { mode: "lease", unitId: "unit-a", propertyId: "property-a", options: {} },
  ])("rejects a mismatched or incomplete response (%s)", async (response) => {
    fetchMock.mockResolvedValue(Response.json(response));
    render(<Form />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Could not load"));
    expect(screen.queryByRole("form")).toBeNull();
  });
});
