// @vitest-environment jsdom
import type { AnchorHTMLAttributes } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeopleFilters } from "@/features/people/components/people-filters";
import { parsePeopleSearchParams } from "@/features/people/people.filters";
import { RentInvoiceFilterBar } from "@/features/finance-operations/components/rent-invoice-filters";
import { useFilterNavigation } from "./use-filter-navigation";

const navigation = vi.hoisted(() => ({ path: "/people", params: "", replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.path,
  useSearchParams: () => new URLSearchParams(navigation.params),
  useRouter: () => ({ replace: navigation.replace, push: navigation.push }),
}));
vi.mock("next/link", () => ({ default: ({ onNavigate, scroll, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { onNavigate?: (event: { preventDefault: () => void }) => void; scroll?: boolean }) => { void scroll; return <a {...props} onClick={event => { event.preventDefault(); let cancelled = false; onNavigate?.({ preventDefault: () => { cancelled = true; } }); if (!cancelled) navigation.push(props.href); }} />; } }));
vi.mock("@/components/ui/select-control", () => ({ SelectControl: ({ ariaLabel, options, value, onValueChange }: { ariaLabel: string; options: { label: string; value: string }[]; value: string; onValueChange: (value: string) => void }) => <select aria-label={ariaLabel} value={value} onChange={event => onValueChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> }));

beforeEach(() => { vi.useFakeTimers(); navigation.path = "/people"; navigation.params = ""; navigation.replace.mockReset(); navigation.push.mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

function People() {
  const query = parsePeopleSearchParams(Object.fromEntries(new URLSearchParams(navigation.params)));
  const filters = useFilterNavigation(query.query, "query", true);
  return <PeopleFilters navigation={filters} resetHref={`/people${query.pageSize === 10 ? "" : `?pageSize=${query.pageSize}`}`} viewQuery={query} />;
}
function select(name: string, value: string) { fireEvent.change(screen.getByRole("combobox", { name }), { target: { value } }); }
function lastParams() { return new URL(navigation.replace.mock.lastCall![0], "http://localhost").searchParams; }

describe("People delayed navigation", () => {
  it("composes rapid criteria before and after an intermediate response", () => {
    navigation.params = "page=3&pageSize=25&role=tenant";
    const view = render(<People />);
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    select("Filter by status", "missing_contact");
    const first = navigation.replace.mock.lastCall![0];
    select("Filter by archive state", "archived");
    expect(lastParams().get("status")).toBe("missing_contact");
    expect(lastParams().get("archiveState")).toBe("archived");
    expect(lastParams().get("pageSize")).toBe("25");
    expect(lastParams().has("page")).toBe(false);
    navigation.params = first.split("?")[1]; view.rerender(<People />);
    select("Sort people", "updated_desc");
    expect(lastParams().get("archiveState")).toBe("archived");
    expect(lastParams().get("sort")).toBe("updated_desc");
    expect(lastParams().get("role")).toBe("tenant");
  });

  it("cancels draft search on Reset before the route response arrives", async () => {
    navigation.params = "status=active&pageSize=25";
    render(<People />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search people" }), { target: { value: "Never apply" } });
    fireEvent.click(screen.getByRole("link", { name: "Reset people filters" }));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.push).toHaveBeenLastCalledWith("/people?pageSize=25", { scroll: false });
    expect((screen.getByRole("textbox", { name: "Search people" }) as HTMLInputElement).value).toBe("");
  });
});

describe("Rent Income delayed navigation", () => {
  beforeEach(() => { navigation.path = "/rent-income"; });
  it("retains status when due period changes before a response", () => {
    render(<RentInvoiceFilterBar invoices={[]} resultCount={0} />);
    fireEvent.click(screen.getByText("Filters", { exact: true }));
    select("Invoice status", "unpaid");
    select("Due period", "today");
    expect(lastParams().get("status")).toBe("unpaid");
    expect(lastParams().get("due")).toBe("today");
  });

  it("cancels queued search when clearing filters and starts fresh edits from the reset", async () => {
    navigation.params = "status=unpaid&q=old&view=rent";
    render(<RentInvoiceFilterBar invoices={[]} resultCount={0} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search rent invoices" }), { target: { value: "Never apply" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(navigation.replace).toHaveBeenCalledTimes(1);
    expect(lastParams().toString()).toBe("view=rent");
    select("Due period", "today");
    expect(lastParams().has("status")).toBe(false);
    expect(lastParams().has("q")).toBe(false);
  });
});

it.each(["people", "rent-income"])("keeps a draft across its own filter acknowledgement, but cancels it on Back in %s", async module => {
  navigation.path = `/${module}`;
  const element = () => module === "people" ? <People /> : <RentInvoiceFilterBar invoices={[]} resultCount={0} />;
  const view = render(element());
  if (module === "people") fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
  else fireEvent.click(screen.getByText("Filters", { exact: true }));
  const input = screen.getByRole("textbox", { name: module === "people" ? "Search people" : "Search rent invoices" });
  fireEvent.change(input, { target: { value: "River" } });
  select(module === "people" ? "Filter by status" : "Invoice status", module === "people" ? "active" : "unpaid");
  navigation.params = lastParams().toString(); view.rerender(element());
  expect((input as HTMLInputElement).value).toBe("River");
  act(() => window.dispatchEvent(new PopStateEvent("popstate")));
  await act(() => vi.advanceTimersByTimeAsync(1500));
  expect(navigation.replace).toHaveBeenCalledTimes(1);
  expect((input as HTMLInputElement).value).toBe("");
});

it.each(["people", "rent-income"])("allows the same search again while a reset response is still pending in %s", async module => {
  navigation.path = `/${module}`;
  navigation.params = "status=active";
  const element = () => module === "people" ? <People /> : <RentInvoiceFilterBar invoices={[]} resultCount={0} />;
  const view = render(element());
  const input = screen.getByRole("textbox", { name: module === "people" ? "Search people" : "Search rent invoices" });
  fireEvent.change(input, { target: { value: "River" } });
  await act(() => vi.advanceTimersByTimeAsync(500));
  const first = lastParams().toString();
  fireEvent.click(module === "people" ? screen.getByRole("link", { name: "Reset people filters" }) : screen.getByRole("button", { name: "Clear filters" }));
  fireEvent.change(input, { target: { value: "River" } });
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(lastParams().get(module === "people" ? "query" : "q")).toBe("River");
  expect(lastParams().has("status")).toBe(false);
  navigation.params = first; view.rerender(element());
  expect((input as HTMLInputElement).value).toBe("River");
  navigation.params = ""; view.rerender(element());
  expect((input as HTMLInputElement).value).toBe("River");
});

it("restores newer search text and URL when acknowledgements arrive in reverse order", async () => {
  const { result, rerender } = renderHook(() => useFilterNavigation(new URLSearchParams(navigation.params).get("query") ?? "", "query", true));
  act(() => result.current.search.onQueryChange("River"));
  await act(() => vi.advanceTimersByTimeAsync(500));
  const first = lastParams().toString();
  act(() => result.current.search.onQueryChange("Riverside"));
  await act(() => vi.advanceTimersByTimeAsync(500));
  navigation.params = lastParams().toString(); rerender();
  navigation.params = first; rerender();
  expect(result.current.search.query).toBe("Riverside");
  expect(lastParams().get("query")).toBe("Riverside");
});

it("preserves the latest controls when a superseded criteria response arrives last", () => {
  const { result, rerender } = renderHook(() => useFilterNavigation("", "q"));
  act(() => result.current.update(params => params.set("status", "unpaid")));
  const first = lastParams().toString();
  act(() => result.current.update(params => params.set("due", "today")));
  const latest = lastParams().toString();
  navigation.params = latest; rerender();
  navigation.params = first; rerender();
  expect(result.current.params?.toString()).toBe(latest);
  expect(lastParams().toString()).toBe(latest);
});

it.each(["", "query=old"])("keeps reset authoritative after a superseded search responds, starting at %s", async initial => {
  navigation.params = initial;
  const { result, rerender } = renderHook(() => useFilterNavigation(new URLSearchParams(navigation.params).get("query") ?? "", "query"));
  act(() => result.current.search.onQueryChange("River"));
  await act(() => vi.advanceTimersByTimeAsync(500));
  const first = lastParams().toString();
  act(() => result.current.reset(new URLSearchParams()));
  navigation.params = ""; rerender();
  navigation.params = first; rerender();
  await act(() => vi.advanceTimersByTimeAsync(600));
  expect(result.current.search.query).toBe("");
  expect(lastParams().toString()).toBe("");
});
