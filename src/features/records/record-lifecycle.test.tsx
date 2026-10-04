/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ archive: vi.fn(), restore: vi.fn() }));
vi.mock("@/features/people/actions", () => ({ archivePersonAction: actions.archive, archiveTenantAction: actions.archive, restorePersonAction: actions.restore }));
vi.mock("@/features/properties/actions", () => ({ archivePropertyAction: actions.archive, restorePropertyAction: actions.restore }));
vi.mock("@/features/units/actions", () => ({ archiveUnitAction: actions.archive, restoreUnitAction: actions.restore }));

import { ArchivePersonPanel, RestorePersonPanel } from "@/features/people/components/person-drawer-panels";
import { ArchivePropertyPanel, RestorePropertyPanel } from "@/features/properties/components/property-drawer-panels";
import { ArchiveUnitPanel, RestoreUnitPanel } from "@/features/units/components/unit-drawer-panels";
import { SideDrawer } from "@/components/ui/side-drawer";
import type { PeopleSummary } from "@/features/people/people.types";
import type { PropertySummary } from "@/features/properties/data/properties";
import type { UnitSummary } from "@/features/units/unit.types";

const person = { id: "synthetic-person", displayName: "Synthetic person", roles: [], contact: { label: "Synthetic contact" }, linked: { activeLeases: [], activeLease: null } } as unknown as PeopleSummary;
const property = { id: "synthetic-property", name: "Synthetic property", units: 0 } as PropertySummary;
const unit = { id: "synthetic-unit", unitNumber: "Synthetic unit" } as UnitSummary;
type PanelCallbacks = { onClose: () => void; onSuccess: (message: string) => void };

const cases = [
  { name: "archive person", Panel: (callbacks: PanelCallbacks) => <ArchivePersonPanel person={person} {...callbacks} />, action: actions.archive },
  { name: "restore person", Panel: (callbacks: PanelCallbacks) => <RestorePersonPanel person={person} {...callbacks} />, action: actions.restore },
  { name: "archive property", Panel: (callbacks: PanelCallbacks) => <ArchivePropertyPanel property={property} {...callbacks} />, action: actions.archive },
  { name: "restore property", Panel: (callbacks: PanelCallbacks) => <RestorePropertyPanel property={property} {...callbacks} />, action: actions.restore },
  { name: "archive unit", Panel: (callbacks: PanelCallbacks) => <ArchiveUnitPanel unit={unit} {...callbacks} />, action: actions.archive },
  { name: "restore unit", Panel: (callbacks: PanelCallbacks) => <RestoreUnitPanel unit={unit} {...callbacks} />, action: actions.restore },
];

afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe.each(cases)("$name lifecycle", ({ Panel, action }) => {
  it("retains context through failure, guards pending dismissal and repeated submission, and closes once on success", async () => {
    let finish!: (value: { status: "error" | "success"; message: string }) => void;
    action.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const { rerender } = render(<SideDrawer open title="Record correction" onClose={onClose}><Panel onClose={onClose} onSuccess={onSuccess} /></SideDrawer>);
    const form = document.querySelector("form")!;
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(form.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue waiting" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continue waiting" }));
    await act(async () => { finish({ status: "error", message: "Linked record changed. Review and retry." }); });
    expect(screen.getByRole("alert").textContent).toContain("Linked record changed");
    expect(form.querySelector("input")?.value).toMatch(/^synthetic-/);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.submit(form);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    await act(async () => { finish({ status: "success", message: "Saved correction." }); });
    expect(onSuccess).toHaveBeenCalledWith("Saved correction.");
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<SideDrawer open title="Record correction" onClose={() => onClose()}><Panel onClose={() => onClose()} onSuccess={message => onSuccess(message)} /></SideDrawer>);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.submit(form);
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("cancels an untouched confirmation without invoking an action", () => {
    const onClose = vi.fn();
    render(<SideDrawer open title="Record correction" onClose={onClose}><Panel onClose={onClose} onSuccess={vi.fn()} /></SideDrawer>);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(action).not.toHaveBeenCalled();
  });
});

it("keeps linked property and person constraints effective even for direct form submission", () => {
  const { container, unmount } = render(<ArchivePropertyPanel property={{ ...property, units: 2 }} onClose={vi.fn()} onSuccess={vi.fn()} />);
  fireEvent.submit(container.querySelector("form")!);
  expect(actions.archive).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "Review active units" })).toBeTruthy();
  unmount();
  const lease = { id: "synthetic-lease", href: "/leases/synthetic-lease" };
  const result = render(<ArchivePersonPanel person={{ ...person, linked: { ...person.linked, activeLeases: [lease] } } as PeopleSummary} onClose={vi.fn()} onSuccess={vi.fn()} />);
  fireEvent.submit(result.container.querySelector("form")!);
  expect(actions.archive).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "Review lease" })).toBeTruthy();
});
