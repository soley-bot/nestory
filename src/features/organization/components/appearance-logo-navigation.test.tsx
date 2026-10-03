/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCallback, useEffect, useRef } from "react";
import userEvent from "@testing-library/user-event";
import { SettingsNavigationGuardProvider, useSettingsNavigationGuard } from "@/components/layout/settings-navigation-guard";
import { AppearanceEditor } from "./appearance-editor";
import type { SettingsEditorHandle } from "./branch-editor";
import type { DraftStatus } from "@/components/ui/draft-action-bar";

let sectionStatus: DraftStatus = "clean";

const { push, refresh, upload } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), upload: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/features/organization/actions", () => ({ uploadOrganizationLogoAction: upload, removeOrganizationLogoAction: vi.fn(), updateOrganizationAppearanceAction: vi.fn() }));

function Editor() {
  const guard = useSettingsNavigationGuard()!;
  const ref = useRef<SettingsEditorHandle>(null);
  const setDraftStatus = guard.setDraftStatus;
  const reportStatus = useCallback((status: DraftStatus) => {
    sectionStatus = status;
    setDraftStatus(status);
  }, [setDraftStatus]);
  useEffect(() => {
    guard.registerDraftController({ discard: () => ref.current?.discard() });
    return () => guard.registerDraftController(null);
  }, [guard]);
  return <><a href="/settings/branches" onClick={event => guard.handleNavigationClick(event, { href: "/settings/branches", label: "Branches" })}>Branches</a><AppearanceEditor ref={ref} onDraftStatusChange={reportStatus} logoStoragePath={null} logoUrl={null} organizationName="Synthetic Company" theme={{ mode: "system", accentPreset: "neutral", accentSeed: null }} /></>;
}
function setup() { render(<SettingsNavigationGuardProvider><Editor /></SettingsNavigationGuardProvider>); }
function select() { fireEvent.change(screen.getByLabelText("Company logo file"), { target: { files: [new File(["synthetic"], "synthetic.png", { type: "image/png" })] } }); }
function submit() { fireEvent.submit(screen.getByLabelText("Company logo file").closest("form")!); }
function leave() { fireEvent.click(screen.getByRole("link", { name: "Branches" })); }
beforeEach(() => { sectionStatus = "clean"; push.mockReset(); refresh.mockReset(); upload.mockReset(); });
afterEach(cleanup);

it("keeps the selected file when navigation is canceled and discards it only on confirmation", () => {
  setup(); select(); leave();
  expect(screen.getByRole("dialog", { name: "Open Branches?" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByText("synthetic.png")).toBeTruthy(); expect(push).not.toHaveBeenCalled();
  leave(); fireEvent.click(screen.getByRole("button", { name: "Discard and open Branches" }));
  expect(screen.queryByText("synthetic.png")).toBeNull(); expect(push).toHaveBeenCalledExactlyOnceWith("/settings/branches");
});

it("preserves the failed selection for retry and releases the guard after success", async () => {
  upload.mockResolvedValueOnce({ status: "error", message: "Synthetic upload failed" }).mockResolvedValueOnce({ status: "success", message: "Synthetic upload saved" });
  setup(); select(); submit(); await screen.findByText("Synthetic upload failed");
  await waitFor(() => expect((screen.getByLabelText("Company logo file") as HTMLInputElement).disabled).toBe(false));
  await waitFor(() => expect(sectionStatus).toBe("error"));
  leave(); expect(screen.getByRole("dialog")).toBeTruthy(); fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByText("synthetic.png")).toBeTruthy(); submit(); await screen.findByText("Synthetic upload saved");
  await waitFor(() => expect((screen.getByLabelText("Company logo file") as HTMLInputElement).disabled).toBe(false));
  await waitFor(() => expect(sectionStatus).toBe("saved"));
  expect(screen.queryByText("synthetic.png")).toBeNull(); leave(); expect(screen.queryByRole("dialog")).toBeNull();
  expect(upload).toHaveBeenCalledTimes(2); expect(refresh).toHaveBeenCalledOnce();
});

it.each(["success", "error"] as const)("waits for a pending upload and handles its %s result", async status => {
  let complete!: (value: { status: "success" | "error"; message: string }) => void;
  upload.mockReturnValue(new Promise(resolve => { complete = resolve; }));
  setup(); select(); submit(); leave();
  expect(screen.getByText(/A save is still in progress/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Discard and open/ })).toBeNull(); expect(push).not.toHaveBeenCalled();
  await act(async () => complete({ status, message: "Synthetic result" }));
  expect(push).toHaveBeenCalledTimes(status === "success" ? 1 : 0);
  if (status === "error") expect(screen.getByText("synthetic.png")).toBeTruthy();
});

it("does not navigate after canceling a pending upload departure", async () => {
  let complete!: (value: { status: "success"; message: string }) => void;
  upload.mockReturnValue(new Promise(resolve => { complete = resolve; }));
  setup(); select(); submit(); leave(); fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  await act(async () => complete({ status: "success", message: "Synthetic saved" }));
  expect(push).not.toHaveBeenCalled();
});

it("keeps appearance edits guarded after a logo upload succeeds", async () => {
  upload.mockResolvedValue({ status: "success", message: "Synthetic saved" });
  setup(); fireEvent.click(screen.getByRole("button", { name: "Forest" })); select(); submit(); await screen.findByText("Synthetic saved");
  leave(); expect(screen.getByRole("dialog")).toBeTruthy(); expect(push).not.toHaveBeenCalled();
});

it.each(["returned", "thrown"])("retains the actual file after a %s upload failure for a native retry", async failure => {
  if (failure === "thrown") upload.mockRejectedValueOnce(new Error("Synthetic transport failure"));
  else upload.mockResolvedValueOnce({ status: "error", message: "Synthetic upload failed" });
  upload.mockResolvedValueOnce({ status: "success", message: "Synthetic retry saved" });
  setup();
  const input = screen.getByLabelText("Company logo file") as HTMLInputElement;
  const file = new File(["synthetic retry payload"], "retry.png", { type: "image/png" });
  await userEvent.upload(input, file);
  submit(); await screen.findByRole("alert");
  await waitFor(() => expect(input.disabled).toBe(false));
  expect(input.files?.[0]).toBe(file);
  submit(); await screen.findByText("Synthetic retry saved");
  await waitFor(() => expect(input.disabled).toBe(false));
  expect(input.files).toHaveLength(0);
  expect(upload).toHaveBeenCalledTimes(2);
});
