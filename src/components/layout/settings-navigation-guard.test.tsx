/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import Link from "next/link";
import { SettingsNavigationGuardProvider, useSettingsNavigationGuard } from "./settings-navigation-guard";
import type { DraftStatus } from "@/components/ui/draft-action-bar";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
let updateStatus: (status: DraftStatus) => void;
const discard = vi.fn();
function Editor() {
  const guard = useSettingsNavigationGuard()!;
  useEffect(() => {
    updateStatus = guard.setDraftStatus;
    guard.registerDraftController({ discard });
    return () => guard.registerDraftController(null);
  }, [guard]);
  return <input aria-label="Draft name" defaultValue="Unsaved company" />;
}
function setup() {
  return render(<><Link href="/people">People</Link><SettingsNavigationGuardProvider><Editor /><Link href="/settings/branches">Branches<span>1</span></Link></SettingsNavigationGuardProvider></>);
}
function mark(status: DraftStatus) { act(() => updateStatus(status)); }
beforeEach(() => {
  push.mockReset(); discard.mockReset();
  window.history.replaceState({}, "", "/settings/organization");
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("settings exit safety", () => {
  it("guards the Organization context link without requiring edits in the identity editor", async () => {
    setup(); mark("dirty");
    const link = screen.getByRole("link", { name: "Branches1" });
    fireEvent.click(link);
    expect(screen.getByRole("dialog", { name: "Open Branches?" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(document.activeElement).toBe(link));
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Unsaved company");
    expect(push).not.toHaveBeenCalled(); expect(discard).not.toHaveBeenCalled();
    fireEvent.click(link);
    fireEvent.click(screen.getByRole("button", { name: "Discard and open Branches" }));
    expect(discard).toHaveBeenCalledOnce(); expect(push).toHaveBeenCalledExactlyOnceWith("/settings/branches");
  });
  it("guards app navigation outside the settings subtree", () => {
    setup(); mark("error"); fireEvent.click(screen.getByRole("link", { name: "People" }));
    expect(screen.getByRole("dialog", { name: "Open People?" })).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull(); expect(discard).not.toHaveBeenCalled();
  });
  it("leaves modified clicks, new tabs, downloads, and same-page links alone", () => {
    setup(); mark("dirty");
    const link = screen.getByRole("link", { name: "People" });
    fireEvent.click(link, { ctrlKey: true });
    link.setAttribute("target", "_blank"); fireEvent.click(link);
    link.removeAttribute("target"); link.setAttribute("download", ""); fireEvent.click(link);
    link.removeAttribute("download"); link.setAttribute("href", "/settings/organization#preview"); fireEvent.click(link);
    expect(screen.queryByRole("dialog")).toBeNull(); expect(push).not.toHaveBeenCalled();
  });
  it.each(["dirty", "saving", "error"] as const)("warns before refresh for %s and releases the warning after save/discard", (status) => {
    setup(); mark(status);
    const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    mark("clean"); const clean = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
  });
  it("does not depart after a canceled in-flight save navigation", () => {
    setup(); mark("saving"); fireEvent.click(screen.getByRole("link", { name: "People" }));
    expect(screen.queryByRole("button", { name: /Discard and open/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" })); mark("saved");
    expect(push).not.toHaveBeenCalled();
  });
  it("waits for an in-flight save, but keeps a failed draft on screen", () => {
    setup(); mark("saving"); fireEvent.click(screen.getByRole("link", { name: "People" })); mark("error");
    expect(screen.queryByRole("dialog")).toBeNull(); expect(push).not.toHaveBeenCalled();
    const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
  });
  it("cancels Back without changing history; confirmation traverses to the original entry", () => {
    const navigation = Object.assign(new EventTarget(), { traverseTo: vi.fn(() => ({ finished: Promise.resolve() })) });
    vi.stubGlobal("navigation", navigation);
    const go = vi.spyOn(window.history, "go"); const pushState = vi.spyOn(window.history, "pushState");
    setup(); mark("dirty");
    const event = Object.assign(new Event("navigate", { cancelable: true }), {
      canIntercept: true, hashChange: false, downloadRequest: null, formData: null,
      navigationType: "traverse", destination: { url: `${window.location.origin}/people`, key: "previous-entry" },
    });
    act(() => navigation.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true); expect(go).not.toHaveBeenCalled(); expect(pushState).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(navigation.traverseTo).not.toHaveBeenCalled();
    act(() => navigation.dispatchEvent(Object.assign(new Event("navigate", { cancelable: true }), {
      canIntercept: true, hashChange: false, downloadRequest: null, formData: null,
      navigationType: "traverse", destination: { url: `${window.location.origin}/people`, key: "previous-entry" },
    })));
    fireEvent.click(screen.getByRole("button", { name: "Discard and open this page" }));
    expect(navigation.traverseTo).toHaveBeenCalledExactlyOnceWith("previous-entry"); expect(push).not.toHaveBeenCalled();
    go.mockRestore(); pushState.mockRestore();
  });
});
