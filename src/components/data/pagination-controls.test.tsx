/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/people",
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.searchParams,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} href={String(href)}>
      {children}
    </a>
  ),
}));

import { PaginationControls } from "./pagination-controls";

afterEach(() => {
  cleanup();
  navigation.pathname = "/people";
  navigation.searchParams = new URLSearchParams();
});

describe("PaginationControls", () => {
  it("keeps the result count but hides inactive navigation for one page", () => {
    render(
      <PaginationControls
        pagination={{
          from: 1,
          page: 1,
          pageSize: 25,
          to: 13,
          totalCount: 13,
          totalPages: 1,
        }}
      />,
    );

    expect(screen.getByText(/Showing/).textContent).toBe("Showing 1-13 of 13");
    expect(screen.queryByText("Page 1 of 1")).toBeNull();
    expect(screen.queryByText("Previous")).toBeNull();
    expect(screen.queryByText("Next")).toBeNull();
  });

  it("preserves the active query when navigating between multiple pages", () => {
    navigation.searchParams = new URLSearchParams("role=tenant&page=2");

    render(
      <PaginationControls
        pagination={{
          from: 26,
          page: 2,
          pageSize: 25,
          to: 50,
          totalCount: 61,
          totalPages: 3,
        }}
      />,
    );

    expect(screen.getByText("Page 2 of 3")).not.toBeNull();
    expect(
      screen.getByText("Previous").closest("a")?.getAttribute("href"),
    ).toBe("/people?role=tenant");
    expect(screen.getByText("Next").closest("a")?.getAttribute("href")).toBe(
      "/people?role=tenant&page=3",
    );
  });
});
