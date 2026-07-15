/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/tasks",
  useRouter: () => navigation,
}));

vi.mock("@/features/auth/actions", () => ({
  signOutAction: vi.fn(),
}));

function renderPalette(role: "admin" | "manager" | "member" = "admin") {
  return render(
    <AppShell role={role}>
      <button type="button">Outside control</button>
    </AppShell>,
  );
}

function openPalette() {
  const trigger = screen.getByRole("button", { name: "Search or jump" });
  fireEvent.click(trigger);
  return trigger;
}

async function advanceSearch() {
  await act(async () => {
    vi.advanceTimersByTime(150);
    await Promise.resolve();
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

beforeEach(() => {
  navigation.push.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.style.overflow = "";
});

describe("Workspace command palette access", () => {
  it("uses the semantic focus token on the trigger, search field, and close control", () => {
    renderPalette();
    const trigger = screen.getByRole("button", { name: "Search or jump" });
    expect(trigger.className).toContain("focus-visible:ring-2");
    expect(trigger.className).toContain("focus-visible:ring-focus-ring");

    openPalette();
    const input = screen.getByRole("combobox", { name: "Search or jump" });
    const inputFrame = input.parentElement;
    const closeButton = screen.getByRole("button", { name: "Close search" });

    expect(inputFrame?.className).toContain("focus-within:ring-2");
    expect(inputFrame?.className).toContain("focus-within:ring-focus-ring");
    expect(input.className).not.toContain("focus:ring-0");
    expect(closeButton.className).toContain("focus-visible:ring-2");
    expect(closeButton.className).toContain("focus-visible:ring-focus-ring");
  });

  it("opens with Ctrl+K or Cmd+K and opens from its single visible trigger", () => {
    renderPalette();

    fireEvent.keyDown(document, { ctrlKey: true, key: "k" });
    expect(screen.getByRole("dialog", { name: "Search or jump" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Search or jump" })).toBeNull();

    fireEvent.keyDown(document, { key: "K", metaKey: true });
    expect(screen.getByRole("dialog", { name: "Search or jump" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    openPalette();
    expect(screen.getByRole("dialog", { name: "Search or jump" })).toBeTruthy();
  });

  it("focuses the combobox, traps focus, closes on Escape, and restores the trigger", () => {
    renderPalette();
    const trigger = openPalette();
    const input = screen.getByRole("combobox", { name: "Search or jump" });
    const closeButton = screen.getByRole("button", { name: "Close search" });

    expect(document.activeElement).toBe(input);
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(input, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);
    fireEvent.keyDown(closeButton, { key: "Tab" });
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Search or jump" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("");
  });

  it("provides named dialog, combobox, listbox, groups, and consistent active option state", () => {
    renderPalette("manager");
    openPalette();

    const dialog = screen.getByRole("dialog", { name: "Search or jump" });
    const input = within(dialog).getByRole("combobox", { name: "Search or jump" });
    const listbox = within(dialog).getByRole("listbox", { name: "Search results" });
    const navigationGroup = within(listbox).getByRole("group", {
      name: "Navigation",
    });
    const options = within(navigationGroup).getAllByRole("option");

    expect(input.getAttribute("aria-controls")).toBe(listbox.id);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id);
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    expect(new Set([input.id, listbox.id, ...options.map((option) => option.id)]).size)
      .toBe(2 + options.length);
  });

  it("closes when the backdrop is clicked and restores focus", () => {
    renderPalette();
    const trigger = openPalette();

    fireEvent.click(screen.getByTestId("workspace-command-palette-backdrop"));

    expect(screen.queryByRole("dialog", { name: "Search or jump" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("does not move, activate, or close while an IME composition is active", () => {
    renderPalette("manager");
    openPalette();
    const input = screen.getByRole("combobox", { name: "Search or jump" });
    const initialActiveOption = input.getAttribute("aria-activedescendant");

    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(document, { key: "Escape" });

    expect(input.getAttribute("aria-activedescendant")).toBe(initialActiveOption);
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Search or jump" })).toBeTruthy();

    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).not.toBe(
      initialActiveOption,
    );
    fireEvent.keyDown(input, { key: "Enter" });
    expect(navigation.push).toHaveBeenCalledWith("/tasks");
  });

  it("honors native composing and keyCode 229 fallbacks", () => {
    renderPalette("manager");
    openPalette();
    const input = screen.getByRole("combobox", { name: "Search or jump" });
    const initialActiveOption = input.getAttribute("aria-activedescendant");

    fireEvent.keyDown(input, { isComposing: true, key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229, which: 229 });
    fireEvent.keyDown(document, { key: "Escape", keyCode: 229, which: 229 });

    expect(input.getAttribute("aria-activedescendant")).toBe(initialActiveOption);
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Search or jump" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Search or jump" })).toBeNull();
  });
});

describe("Workspace command palette results", () => {
  it("keeps one-character queries nonterminal and does not fetch records", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderPalette("member");
    openPalette();
    fireEvent.change(screen.getByRole("combobox", { name: "Search or jump" }), {
      target: { value: "x" },
    });
    await advanceSearch();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe(
      "Type 2 characters to search records",
    );
    expect(screen.queryByText("No results")).toBeNull();
  });

  it("shows only immediate navigation actions visible to the current role", () => {
    renderPalette("member");
    openPalette();

    expect(screen.getByRole("option", { name: /Tasks/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Properties/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /Cases/ })).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: "Search or jump" }), {
      target: { value: "prop" },
    });
    expect(screen.queryByRole("option", { name: /Properties/ })).toBeNull();
  });

  it("debounces entity search for 150ms with private same-origin fetch options", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);
    renderPalette();
    openPalette();

    fireEvent.change(screen.getByRole("combobox", { name: "Search or jump" }), {
      target: { value: "boiler" },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toMatch(/Searching/);
    expect(screen.queryByText("No results")).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(149);
      await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspace-search?q=boiler",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("groups validated entities, announces the count, and activates a clicked result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          results: [
            {
              href: "/properties/property-1",
              id: "property-1",
              kind: "property",
              label: "Boiler House",
              meta: "BLR",
            },
            {
              href: "/people/person-1",
              id: "person-1",
              kind: "person",
              label: "Boiler Vendor",
              meta: "Vendor",
            },
          ],
        }),
      ),
    );
    renderPalette();
    openPalette();

    fireEvent.change(screen.getByRole("combobox", { name: "Search or jump" }), {
      target: { value: "boiler" },
    });
    await advanceSearch();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const listbox = screen.getByRole("listbox", { name: "Search results" });
    expect(within(listbox).getByRole("group", { name: "Properties" })).toBeTruthy();
    expect(within(listbox).getByRole("group", { name: "People" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("2 results");

    fireEvent.click(screen.getByRole("option", { name: /Boiler House/ }));
    expect(navigation.push).toHaveBeenCalledWith("/properties/property-1");
    expect(screen.queryByRole("dialog", { name: "Search or jump" })).toBeNull();
  });

  it("moves through results with Arrow keys and activates the selected option with Enter", () => {
    renderPalette("manager");
    openPalette();
    const input = screen.getByRole("combobox", { name: "Search or jump" });
    const options = screen.getAllByRole("option");

    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options[1].id);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id);
    fireEvent.keyDown(input, { key: "Enter" });

    expect(navigation.push).toHaveBeenCalledWith("/maintenance");
    expect(screen.queryByRole("dialog", { name: "Search or jump" })).toBeNull();
  });

  it("scrolls the active option into view during long keyboard traversal", () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    try {
      renderPalette();
      openPalette();
      const input = screen.getByRole("combobox", { name: "Search or jump" });
      scrollIntoView.mockClear();

      for (let index = 0; index < 12; index += 1) {
        fireEvent.keyDown(input, { key: "ArrowDown" });
      }

      expect(scrollIntoView).toHaveBeenCalled();
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest" });
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it("shows no-results and error states without hiding immediate safe actions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ error: "Search unavailable" }, 500));
    vi.stubGlobal("fetch", fetchMock);
    renderPalette("member");
    openPalette();
    const input = screen.getByRole("combobox", { name: "Search or jump" });

    fireEvent.change(input, { target: { value: "zzzzzz" } });
    await advanceSearch();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("status").textContent).toContain("No results");

    fireEvent.change(input, { target: { value: "tasks" } });
    expect(screen.getByRole("option", { name: /Tasks/ })).toBeTruthy();
    await advanceSearch();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("status").textContent).toContain("Search unavailable");
    expect(screen.getByRole("option", { name: /Tasks/ })).toBeTruthy();
  });

  it("aborts stale requests and ignores late stale responses", async () => {
    let resolveFirst!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((resolve) => {
            resolveFirst = resolve;
            expect(init?.signal).toBeInstanceOf(AbortSignal);
          }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              href: "/units/unit-new",
              id: "unit-new",
              kind: "unit",
              label: "New match",
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderPalette();
    openPalette();
    const input = screen.getByRole("combobox", { name: "Search or jump" });

    fireEvent.change(input, { target: { value: "old match" } });
    await advanceSearch();
    const firstSignal = fetchMock.mock.calls[0][1]?.signal as AbortSignal;

    fireEvent.change(input, { target: { value: "new match" } });
    await advanceSearch();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(firstSignal.aborted).toBe(true);
    expect(screen.getByRole("option", { name: /New match/ })).toBeTruthy();

    await act(async () => {
      resolveFirst(
        jsonResponse({
          results: [
            {
              href: "/units/unit-old",
              id: "unit-old",
              kind: "unit",
              label: "Old match",
            },
          ],
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByRole("option", { name: /Old match/ })).toBeNull();
    expect(screen.getByRole("option", { name: /New match/ })).toBeTruthy();
  });

  it("rejects malformed, external, protocol-relative, and executable result hrefs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          results: [
            { href: "javascript:alert(1)", id: "bad-1", kind: "property", label: "Bad JS" },
            { href: "https://evil.example", id: "bad-2", kind: "unit", label: "Bad external" },
            { href: "//evil.example", id: "bad-3", kind: "person", label: "Bad relative" },
            { href: "/tasks/task-1", id: "bad-4", kind: "unknown", label: "Bad kind" },
            { href: "/tasks/task-2", id: "bad-5", kind: "task", label: "Bad meta", meta: 3 },
            {
              href: "/tasks/task-oversized",
              id: "bad-6",
              kind: "task",
              label: "x".repeat(501),
            },
            { href: "/tasks?taskId=task-safe", id: "safe", kind: "task", label: "Safe task" },
          ],
        }),
      ),
    );
    renderPalette("member");
    openPalette();
    fireEvent.change(screen.getByRole("combobox", { name: "Search or jump" }), {
      target: { value: "safe" },
    });
    await advanceSearch();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.click(screen.getByRole("option", { name: /Safe task/ }));
    expect(navigation.push).toHaveBeenCalledWith("/tasks?taskId=task-safe");
    expect(navigation.push).not.toHaveBeenCalledWith(expect.stringContaining("evil"));
    expect(navigation.push).not.toHaveBeenCalledWith(expect.stringContaining("javascript"));
  });

  it("drops action results returned by the API so local role-aware actions remain authoritative", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          results: [
            { href: "/settings", id: "action:settings", kind: "action", label: "Settings" },
          ],
        }),
      ),
    );
    renderPalette("member");
    openPalette();
    fireEvent.change(screen.getByRole("combobox", { name: "Search or jump" }), {
      target: { value: "settings" },
    });
    await advanceSearch();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByRole("option", { name: /Settings/ })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("No results");
  });

  it("caps untrusted entity payloads at the server search limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          results: Array.from({ length: 25 }, (_, index) => ({
            href: `/units/unit-${index}`,
            id: `unit-${index}`,
            kind: "unit",
            label: `Boiler unit ${index}`,
          })),
        }),
      ),
    );
    renderPalette();
    openPalette();
    fireEvent.change(screen.getByRole("combobox", { name: "Search or jump" }), {
      target: { value: "boiler" },
    });
    await advanceSearch();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getAllByRole("option")).toHaveLength(20);
    expect(screen.getByRole("status").textContent).toContain("20 results");
  });

  it("bounds the untrusted payload rows before validating them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          results: [
            ...Array.from({ length: 20 }, (_, index) => ({
              href: "/tasks/bad",
              id: `bad-${index}`,
              kind: "unknown",
              label: "Invalid",
            })),
            {
              href: "/units/outside-limit",
              id: "outside-limit",
              kind: "unit",
              label: "Outside limit",
            },
          ],
        }),
      ),
    );
    renderPalette();
    openPalette();
    fireEvent.change(screen.getByRole("combobox", { name: "Search or jump" }), {
      target: { value: "outside" },
    });
    await advanceSearch();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByRole("option", { name: /Outside limit/ })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("No results");
  });

  it.each([
    {
      allowed: {
        href: "/maintenance?taskId=allowed",
        id: "allowed-manager",
        kind: "maintenance",
        label: "Allowed manager task",
      },
      deniedKind: {
        href: "/properties/property-1",
        id: "denied-manager-property",
        kind: "property",
        label: "Denied property",
      },
      deniedHref: {
        href: "/settings",
        id: "denied-manager-settings",
        kind: "maintenance",
        label: "Denied settings",
      },
      role: "manager" as const,
    },
    {
      allowed: {
        href: "/tasks?taskId=allowed",
        id: "allowed-member",
        kind: "task",
        label: "Allowed member task",
      },
      deniedKind: {
        href: "/properties/property-1",
        id: "denied-member-property",
        kind: "property",
        label: "Denied property",
      },
      deniedHref: {
        href: "/settings",
        id: "denied-member-settings",
        kind: "task",
        label: "Denied settings",
      },
      role: "member" as const,
    },
  ])(
    "keeps untrusted entity routes inside $role destinations",
    async ({ allowed, deniedHref, deniedKind, role }) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse({ results: [deniedKind, deniedHref, allowed] }),
        ),
      );
      renderPalette(role);
      openPalette();
      fireEvent.change(screen.getByRole("combobox", { name: "Search or jump" }), {
        target: { value: "allowed" },
      });
      await advanceSearch();
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getAllByRole("option")).toHaveLength(1);
      expect(screen.getByRole("option", { name: new RegExp(allowed.label) })).toBeTruthy();
      expect(screen.queryByRole("option", { name: /Denied/ })).toBeNull();
    },
  );

  it("removes entity results immediately when the shell role narrows", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          {
            href: "/properties/property-1",
            id: "property-1",
            kind: "property",
            label: "Admin property",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const view = renderPalette("admin");
    openPalette();
    fireEvent.change(screen.getByRole("combobox", { name: "Search or jump" }), {
      target: { value: "admin" },
    });
    await advanceSearch();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("option", { name: /Admin property/ })).toBeTruthy();

    view.rerender(
      <AppShell role="member">
        <button type="button">Outside control</button>
      </AppShell>,
    );

    expect(screen.queryByRole("option", { name: /Admin property/ })).toBeNull();
  });

  it("normalizes malformed query text and caps it before URI encoding", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);
    renderPalette();
    openPalette();
    fireEvent.change(screen.getByRole("combobox", { name: "Search or jump" }), {
      target: { value: `boiler\uD800${"a".repeat(200)}` },
    });
    await advanceSearch();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
    const sentQuery = requestedUrl.searchParams.get("q");
    expect(sentQuery).not.toBeNull();
    expect(sentQuery?.isWellFormed()).toBe(true);
    expect(Array.from(sentQuery ?? "")).toHaveLength(120);
  });
});
