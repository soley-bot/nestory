/* @vitest-environment jsdom */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PeopleScreenSkeleton } from "@/features/people/components/people-screen-skeleton";

afterEach(cleanup);

describe("PeopleScreenSkeleton", () => {
  it("keeps the desktop table and inspector shells flat", () => {
    const { container } = render(<PeopleScreenSkeleton />);
    const tableFrame = Array.from(container.querySelectorAll("div")).find(
      (element) =>
        element.classList.contains("min-h-[380px]") &&
        element.classList.contains("md:block"),
    );
    const inspector = container.querySelector("aside");

    expect(tableFrame).toBeTruthy();
    expect(tableFrame?.classList.contains("rounded-md")).toBe(false);
    expect(tableFrame?.classList.contains("border")).toBe(false);
    expect(inspector).not.toBeNull();
    expect(inspector?.classList.contains("rounded-md")).toBe(false);
    expect(inspector?.classList.contains("border")).toBe(false);
    expect(inspector?.classList.contains("border-l")).toBe(true);
    expect(inspector?.classList.contains("border-border")).toBe(true);
    expect(inspector?.parentElement?.classList.contains("xl:gap-0")).toBe(true);
  });

  it("retains containment for mobile records and loading controls", () => {
    const { container } = render(<PeopleScreenSkeleton />);
    const mobileStack = Array.from(container.querySelectorAll("div")).find(
      (element) =>
        element.classList.contains("space-y-3") &&
        element.classList.contains("md:hidden"),
    );
    const mobileCards = Array.from(mobileStack?.children ?? []);
    const headerAction = Array.from(container.querySelectorAll("div")).find(
      (element) =>
        element.classList.contains("h-8") &&
        element.classList.contains("w-28"),
    );

    expect(mobileCards).toHaveLength(4);
    for (const card of mobileCards) {
      expect(card.classList.contains("rounded-md")).toBe(true);
      expect(card.classList.contains("border")).toBe(true);
      expect(card.classList.contains("border-border")).toBe(true);
      expect(card.classList.contains("bg-surface")).toBe(true);
    }
    expect(headerAction).toBeTruthy();
    expect(headerAction?.classList.contains("rounded-md")).toBe(true);
    expect(headerAction?.classList.contains("border")).toBe(true);
  });
});
