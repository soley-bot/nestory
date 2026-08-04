/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ModuleLoading } from "@/components/layout/module-loading";

afterEach(cleanup);

function hasRoundedBorderShell(element: Element) {
  const tokens = element.getAttribute("class")?.split(/\s+/) ?? [];
  const hasRoundedShape = tokens.some((token) => token.startsWith("rounded"));
  const hasOuterBorder = tokens.includes("border");

  return hasRoundedShape && hasOuterBorder;
}

describe("ModuleLoading task-first layout", () => {
  it.each(["dashboard", "list", "report"] as const)(
    "lets AppShell own the %s height while keeping its header inline",
    (kind) => {
      const { container } = render(
        <ModuleLoading kind={kind} title="Property records" />,
      );
      const state = container.querySelector(`[data-loading-kind="${kind}"]`)!;
      const titleActions = state.querySelector(
        '[data-slot="loading-title-actions"]',
      )!;
      const titleContext = titleActions.querySelector(
        '[data-slot="loading-title-context"]',
      )!;
      const workspace = state.querySelector('[data-slot="loading-workspace"]')!;
      const workSurface = workspace.querySelector(
        '[data-slot="loading-work-surface"]',
      )!;

      expect(state.classList.contains("min-h-screen")).toBe(false);
      expect(state.classList.contains("h-full")).toBe(true);
      expect(state.classList.contains("min-h-0")).toBe(true);
      expect(state.classList.contains("flex")).toBe(true);
      expect(state.classList.contains("flex-col")).toBe(true);
      expect(state.classList.contains("overflow-hidden")).toBe(true);
      expect(titleActions.querySelector(".space-y-3")).toBeNull();
      expect(titleContext.classList.contains("flex-col")).toBe(true);
      expect(titleContext.classList.contains("sm:flex-row")).toBe(true);
      expect(workspace.classList.contains("min-h-0")).toBe(true);
      expect(workspace.classList.contains("flex-1")).toBe(true);
      expect(workspace.classList.contains("flex-col")).toBe(true);
      expect(workSurface.classList.contains("flex-1")).toBe(true);
      expect(workSurface.className).not.toMatch(/(?:^|\s)h-(?:80|\[28rem\])(?:\s|$)/);
      expect(workSurface.className).toMatch(/(?:^|\s)min-h-/);
    },
  );

  it.each(["dashboard", "list", "report"] as const)(
    "keeps the %s variant announced while flattening its live workspace",
    (kind) => {
      const { container } = render(
        <ModuleLoading kind={kind} title="Property records" />,
      );
      const state = container.querySelector(`[data-loading-kind="${kind}"]`);
      const workspace = state?.querySelector('[data-slot="loading-workspace"]');
      const shellElements = Array.from(
        state?.querySelectorAll("[class]") ?? [],
      ).filter(hasRoundedBorderShell);

      expect(state?.getAttribute("aria-busy")).toBe("true");
      expect(screen.getByRole("status").getAttribute("aria-live")).toBe(
        "polite",
      );
      expect(screen.getByRole("status").textContent).toContain(
        "Property records is loading",
      );
      expect(workspace?.getAttribute("aria-hidden")).toBe("true");
      expect(
        state?.querySelectorAll('[data-slot="loading-title-actions"]'),
      ).toHaveLength(1);
      expect(
        workspace?.querySelectorAll('[data-slot="loading-controls"]')
          .length,
      ).toBeLessThanOrEqual(1);
      expect(
        workspace?.querySelectorAll('[data-slot="loading-work-surface"]'),
      ).toHaveLength(1);
      expect(shellElements).toHaveLength(0);
      expect(state?.innerHTML).not.toContain("320px");
    },
  );

  it.each(["dashboard", "report"] as const)(
    "renders the %s summary as one inline, unboxed metric group",
    (kind) => {
      const { container } = render(
        <ModuleLoading kind={kind} title="Property records" />,
      );
      const summaries = container.querySelectorAll(
        '[data-slot="loading-summary"]',
      );

      expect(summaries).toHaveLength(1);
      expect(hasRoundedBorderShell(summaries[0]!)).toBe(false);
    },
  );
});
