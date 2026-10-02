/* @vitest-environment jsdom */

import { StrictMode, type ReactNode } from "react";
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/components/auth-page-shell", () => ({
  AuthPageShell: ({ children, description, title }: { children: ReactNode; description: string; title: string }) => (
    <main><h1>{title}</h1><p>{description}</p>{children}</main>
  ),
}));

import { ImplicitSessionCompletion } from "@/features/auth/components/implicit-session-completion";

describe("email link completion", () => {
  const fetchMock = vi.fn();
  const replace = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    replace.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    const location = { hash: "", pathname: "/auth/complete", search: "", replace };
    const history = { replaceState: () => { location.hash = ""; } };
    vi.stubGlobal("window", new Proxy(window, {
      get(target, key) {
        if (key === "location") return location;
        if (key === "history") return history;
        return Reflect.get(target, key, target);
      },
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("replaces the loading shell for missing or malformed tokens", async () => {
    render(<ImplicitSessionCompletion nextPath="/update-password" />);
    await screen.findByRole("heading", { name: "We could not verify this link" });
    expect(screen.queryByText("Signing you in")).toBeNull();
    expect(screen.queryByText("Keep this page open.")).toBeNull();
    expect(screen.getByRole("link", { name: "Request a new recovery link" }).getAttribute("href")).toBe("/forgot-password");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not submit fragment tokens when the server reports an email-link error", async () => {
    window.location.hash = "access_token=fixture&refresh_token=fixture&type=invite";
    render(<ImplicitSessionCompletion failed nextPath="/workspace" />);
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Signing you in")).toBeNull();
  });

  it("submits once under StrictMode and offers the same invitation after rejection", async () => {
    const invitation = "/accept-invite?invitation=11111111-1111-4111-8111-111111111111";
    window.location.hash = "access_token=fixture&refresh_token=fixture&type=invite";
    fetchMock.mockResolvedValue({ ok: false });
    render(<StrictMode><ImplicitSessionCompletion nextPath={invitation} /></StrictMode>);
    await screen.findByRole("heading", { name: "We could not verify this link" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe("");
    const href = screen.getByRole("link", { name: "Return to sign in" }).getAttribute("href")!;
    expect(new URL(href, "https://example.test").searchParams.get("next")).toBe(invitation);
    expect(screen.queryByText("Keep this page open.")).toBeNull();
  });

  it("handles a network failure without leaving progress instructions", async () => {
    window.location.hash = "access_token=fixture&refresh_token=fixture&type=invite";
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<ImplicitSessionCompletion nextPath="/workspace" />);
    await screen.findByRole("heading", { name: "We could not verify this link" });
    expect(screen.queryByText("Verifying your secure link.")).toBeNull();
  });

  it("navigates once after successful completion under StrictMode", async () => {
    window.location.hash = "access_token=fixture&refresh_token=fixture&type=invite";
    fetchMock.mockResolvedValue({ ok: true });
    render(<StrictMode><ImplicitSessionCompletion nextPath="/properties" /></StrictMode>);
    await waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith("/properties"));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe("");
    expect(screen.queryByText("We could not verify this link")).toBeNull();
  });

  it("does not navigate after a pending completion is unmounted", async () => {
    window.location.hash = "access_token=fixture&refresh_token=fixture&type=invite";
    let complete!: (value: { ok: boolean }) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const view = render(<ImplicitSessionCompletion nextPath="/properties" />);
    view.unmount();
    await act(async () => complete({ ok: true }));
    expect(replace).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
