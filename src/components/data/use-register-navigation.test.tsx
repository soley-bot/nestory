// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRegisterNavigation } from "./use-register-navigation";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/units",
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.searchParams,
}));

beforeEach(() => {
  vi.useFakeTimers();
  navigation.replace.mockReset();
  navigation.searchParams = new URLSearchParams("propertyId=home&page=3&pageSize=25");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("register navigation", () => {
  it("retains newer typing when a search response resets the page", async () => {
    const { result, rerender } = renderHook(({ query }) => useRegisterNavigation(query), {
      initialProps: { query: "" },
    });
    act(() => result.current.search.onQueryChange("River"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    act(() => result.current.search.onQueryChange("Riverside"));
    navigation.searchParams = new URLSearchParams("propertyId=home&pageSize=25&query=River");
    rerender({ query: "River" });
    expect(result.current.search.query).toBe("Riverside");
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/units?propertyId=home&pageSize=25&query=Riverside",
      { scroll: false },
    );
  });

  it("discards queued typing before pagination even while the response is pending", async () => {
    const { result } = renderHook(() => useRegisterNavigation(""));
    act(() => result.current.search.onQueryChange("River"));
    act(() => result.current.cancelPending());
    expect(result.current.search.query).toBe("");
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("retains each rapid filter, sort, and view change through an intermediate response", () => {
    const { result, rerender } = renderHook(() => useRegisterNavigation(""));
    act(() => result.current.replaceParam("status", "vacant", "all"));
    const first = navigation.replace.mock.lastCall![0];
    act(() => result.current.replaceParam("sort", "rent_desc", "property_asc"));
    navigation.searchParams = new URLSearchParams(first.split("?")[1]);
    rerender();
    act(() => result.current.replaceParam("view", "cards", "table"));
    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/units?propertyId=home&pageSize=25&status=vacant&sort=rent_desc&view=cards",
      { scroll: false },
    );
  });

  it("starts edits from the visited URL after navigating away and back", () => {
    const { result, rerender } = renderHook(() => useRegisterNavigation(""));
    act(() => result.current.replaceParam("status", "vacant", "all"));
    navigation.searchParams = new URLSearchParams("propertyId=river");
    rerender();
    navigation.searchParams = new URLSearchParams("propertyId=home&page=3&pageSize=25");
    rerender();
    act(() => result.current.replaceParam("view", "cards", "table"));
    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/units?propertyId=home&page=3&pageSize=25&view=cards",
      { scroll: false },
    );
  });

  it("cancels queued typing on Back even when the applied query has not changed", async () => {
    const { result } = renderHook(() => useRegisterNavigation(""));
    act(() => result.current.search.onQueryChange("River"));
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(result.current.search.query).toBe("");
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(navigation.replace).not.toHaveBeenCalled();
    act(() => result.current.search.onQueryChange("Home"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/units?propertyId=home&pageSize=25&query=Home",
      { scroll: false },
    );
  });

  it("does not replay pending typing after Reset or record navigation", async () => {
    const { result, rerender } = renderHook(() => useRegisterNavigation(""));
    act(() => result.current.search.onQueryChange("River"));
    act(() => result.current.cancelPending());
    navigation.searchParams = new URLSearchParams();
    rerender();
    expect(result.current.search.query).toBe("");
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it.each(["status", "sort", "pageSize", "query"])("resets page when changing %s and preserves unrelated scope", (name) => {
    const { result } = renderHook(() => useRegisterNavigation(""));
    act(() => result.current.replaceParam(name, "new", ""));
    const url = new URL(navigation.replace.mock.lastCall![0], "http://localhost");
    expect(url.searchParams.has("page")).toBe(false);
    expect(url.searchParams.get("propertyId")).toBe("home");
    expect(url.searchParams.get(name)).toBe("new");
  });
});
