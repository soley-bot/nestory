/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SideDrawer } from "@/components/ui/side-drawer";
import { MaintenanceDateField } from "@/features/maintenance/components/maintenance-date-field";

const calendar = vi.hoisted(() => ({ loaded: false }));

vi.mock("next/dynamic", () => ({
  default: (_loader: unknown, options: { loading?: ComponentType }) =>
    function DelayedDatePicker(props: { ariaLabel: string; defaultValue: string }) {
      return calendar.loaded
        ? <button aria-label={props.ariaLabel} type="button">{props.defaultValue}</button>
        : options.loading ? createElement(options.loading) : null;
    },
}));

beforeEach(() => {
  calendar.loaded = false;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(0), 0),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Fixture({ drawer = false }: { drawer?: boolean }) {
  const form = <form aria-label="Date form">
    <label>
      Due date
      <MaintenanceDateField ariaLabel="Due date" defaultValue="2026-07-18" name="dueDate" />
    </label>
    <button type="button">Elsewhere</button>
  </form>;
  return drawer ? <SideDrawer onClose={() => {}} open title="Edit date">{form}</SideDrawer> : form;
}

describe("Maintenance date loading focus", () => {
  it.each([false, true])("keeps and transfers date focus with drawer=%s", async (drawer) => {
    const { rerender } = render(<Fixture drawer={drawer} />);
    const loading = screen.getByRole("button", { name: "Due date" });
    loading.focus();
    expect(document.activeElement).toBe(loading);
    expect(new FormData(screen.getByRole("form", { name: "Date form" }) as HTMLFormElement).getAll("dueDate")).toEqual(["2026-07-18"]);

    calendar.loaded = true;
    rerender(<Fixture drawer={drawer} />);

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Due date" })));
    expect(new FormData(screen.getByRole("form", { name: "Date form" }) as HTMLFormElement).getAll("dueDate")).toEqual(["2026-07-18"]);
  });

  it.each([false, true])("does not steal date focus with drawer=%s", async (drawer) => {
    const { rerender } = render(<Fixture drawer={drawer} />);
    screen.getByRole("button", { name: "Due date" }).focus();
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    elsewhere.focus();
    calendar.loaded = true;
    rerender(<Fixture drawer={drawer} />);
    await new Promise(resolve => window.setTimeout(resolve, 10));
    expect(document.activeElement).toBe(elsewhere);
  });
});
