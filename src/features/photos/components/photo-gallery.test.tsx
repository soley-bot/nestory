/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PhotoActionState } from "@/features/photos/actions";
import type { AssetPhoto } from "@/features/photos/photo.types";

const actions = vi.hoisted(() => ({ archive: vi.fn(), cover: vi.fn(), upload: vi.fn() }));
vi.mock("@/features/photos/actions", () => ({
  archiveAssetPhotoAction: actions.archive,
  setAssetPhotoCoverAction: actions.cover,
  createAssetPhotoAction: actions.upload,
}));
import { PhotoGallery } from "@/features/photos/components/photo-gallery";

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  actions.cover.mockResolvedValue({ message: "Cover updated.", status: "success" });
  actions.archive.mockResolvedValue({ message: "Photo archived.", status: "success" });
  HTMLElement.prototype.scrollTo = vi.fn();
});

const photo = {
  fileName: "lobby.jpg",
  id: "photo-1",
  isCover: false,
  mimeType: "image/jpeg",
  propertyId: "property-1",
  sizeBytes: 100,
  storagePath: "org/branches/branch/photos/lobby.jpg",
  uploadedAt: "2026-08-22T00:00:00.000Z",
};

describe("PhotoGallery exact permissions", () => {
  it("splits upload and cover editing from archival", () => {
    const { rerender } = render(
      <PhotoGallery
        canArchive
        canWrite={false}
        emptyLabel="No photos"
        photos={[photo]}
        propertyId="property-1"
        title="Photos"
      />,
    );

    expect(screen.queryByRole("button", { name: "Add photo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Set cover" })).toBeNull();
    expect(screen.getByRole("button", { name: "Archive" })).not.toBeNull();

    rerender(
      <PhotoGallery
        canArchive={false}
        canWrite
        emptyLabel="No photos"
        photos={[photo]}
        propertyId="property-1"
        title="Photos"
      />,
    );

    expect(screen.getByRole("button", { name: "Add photo" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Set cover" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
  });
});

const viewablePhoto: AssetPhoto = { ...photo, caption: "Lobby", url: "/lobby.jpg" };

function gallery(photos = [viewablePhoto], readOnly = false) {
  return <PhotoGallery canArchive={!readOnly} canWrite={!readOnly} emptyLabel="No photos" photos={photos} propertyId="property-1" title="Photos" />;
}

function deferred() {
  let resolve!: (state: PhotoActionState) => void;
  const promise = new Promise<PhotoActionState>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("PhotoGallery viewing", () => {
  it("opens for read-only users with the keyboard and restores focus after Escape or Close", async () => {
    const user = userEvent.setup();
    render(gallery([viewablePhoto], true));
    const trigger = screen.getByRole("button", { name: "View photo: Lobby" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Lobby" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close photo" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toHaveFocus();
    await user.keyboard(" ");
    await user.click(screen.getByRole("button", { name: "Close photo" }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(actions.cover).not.toHaveBeenCalled();
    expect(actions.archive).not.toHaveBeenCalled();
  });

  it("contains the uncropped original and supports full-size keyboard scrolling, then resets on reopen", async () => {
    const user = userEvent.setup();
    render(gallery());
    await user.click(screen.getByRole("button", { name: "View photo: Lobby" }));
    const dialog = screen.getByRole("dialog");
    const fullSize = within(dialog).getByRole("button", { name: "Full size" });
    expect(fullSize).toBeDisabled();
    expect(within(dialog).getByRole("status")).toHaveTextContent("Loading photo...");
    const image = within(dialog).getByRole("img", { name: "Lobby" });
    expect(image).toHaveAttribute("src", new URL(viewablePhoto.url!, window.location.origin).href);
    expect(image).toHaveClass("object-contain");
    Object.defineProperties(image, { naturalWidth: { value: 2400 }, naturalHeight: { value: 1600 } });
    fireEvent.load(image);
    await waitFor(() => expect(fullSize).toBeEnabled());
    await user.click(fullSize);
    expect(fullSize).toHaveAttribute("aria-pressed", "true");
    expect(image.parentElement).toHaveStyle({ width: "2400px", height: "1600px" });
    expect(within(dialog).getByRole("region", { name: "Photo" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Fit photo" }));
    expect(image.parentElement).not.toHaveStyle({ width: "2400px" });
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "View photo: Lobby" }));
    expect(screen.getByRole("button", { name: "Full size" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps focus in the viewer during repeated Tab presses", async () => {
    const user = userEvent.setup();
    render(gallery());
    await user.click(screen.getByRole("button", { name: "View photo: Lobby" }));
    for (let index = 0; index < 8; index++) {
      await user.tab({ shift: index % 2 === 0 });
      expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it("shows unavailable photos and handles a failed original without trapping dismissal", async () => {
    const user = userEvent.setup();
    render(gallery([{ ...viewablePhoto, url: undefined }, { ...viewablePhoto, id: "photo-2", caption: undefined }]));
    expect(screen.getByRole("button", { name: "View photo: Lobby" })).toBeDisabled();
    expect(screen.getByText("Photo unavailable")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View photo: lobby.jpg" }));
    fireEvent.error(within(screen.getByRole("dialog")).getByRole("img"));
    expect(screen.getByRole("alert")).toHaveTextContent("Photo unavailable. Refresh to try again.");
    expect(screen.getByRole("button", { name: "Full size" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("PhotoGallery action feedback", () => {
  it("blocks repeated and competing clicks across cards while cover is pending, without blocking viewing", async () => {
    const result = deferred();
    actions.cover.mockReturnValueOnce(result.promise);
    render(gallery([viewablePhoto, { ...viewablePhoto, id: "photo-2", caption: "Kitchen" }]));
    const coverButtons = screen.getAllByRole("button", { name: "Set cover" });
    fireEvent.click(coverButtons[0]);
    fireEvent.click(coverButtons[0]);
    fireEvent.click(coverButtons[1]);
    fireEvent.click(screen.getAllByRole("button", { name: "Archive" })[0]);
    expect(actions.cover).toHaveBeenCalledTimes(1);
    expect(actions.cover.mock.calls[0][0].get("photoId")).toBe(photo.id);
    expect(actions.archive).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Setting cover..." })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Setting cover...");
    expect(coverButtons[1]).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "View photo: Kitchen" }));
    expect(screen.getByRole("dialog", { name: "Kitchen" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close photo" }));
    await act(async () => result.resolve({ message: "Cover updated.", status: "success" }));
    expect(screen.getByRole("status")).toHaveTextContent("Cover updated.");
    expect(coverButtons[0]).toBeEnabled();
  });

  it("shows archive pending and server failures, permits retry, and retains feedback after the archived card disappears", async () => {
    const user = userEvent.setup();
    const result = deferred();
    actions.archive.mockReturnValueOnce(result.promise);
    const { rerender } = render(gallery());
    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(screen.getByRole("button", { name: "Archiving..." })).toHaveAttribute("aria-disabled", "true");
    await act(async () => result.resolve({ message: "Could not archive the photo. Try again.", status: "error" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not archive the photo. Try again.");
    expect(within(screen.getByRole("button", { name: "Archive" }).closest("article")!).getByRole("alert"))
      .toHaveTextContent("Could not archive the photo. Try again.");
    expect(screen.getByRole("button", { name: "View photo: Lobby" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Photo archived."));
    expect(screen.queryByRole("alert")).toBeNull();
    rerender(gallery([]));
    expect(screen.getByRole("status")).toHaveTextContent("Photo archived.");
  });

  it("returns focus to the gallery when an open photo is removed by a pending archive", async () => {
    const user = userEvent.setup();
    const result = deferred();
    actions.archive.mockReturnValueOnce(result.promise);
    const { rerender } = render(gallery());
    await user.click(screen.getByRole("button", { name: "Archive" }));
    await user.click(screen.getByRole("button", { name: "View photo: Lobby" }));
    expect(screen.getByRole("button", { name: "Close photo" })).toHaveFocus();
    await act(async () => result.resolve({ message: "Photo archived.", status: "success" }));
    rerender(gallery([]));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Photos" })).toHaveFocus());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Photo archived.");
    await user.tab();
    expect(screen.getByRole("button", { name: "Add photo" })).toHaveFocus();
  });

  it.each(["cover", "archive"])("keeps keyboard focus on a pending %s action and its retry", async (intent) => {
    const user = userEvent.setup();
    const result = deferred();
    const action = actions[intent as "cover" | "archive"];
    action.mockReturnValueOnce(result.promise);
    render(gallery());
    const button = screen.getByRole("button", { name: intent === "cover" ? "Set cover" : "Archive" });
    button.focus();
    await user.keyboard("{Enter}{Enter}");
    expect(action).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveFocus();
    await act(async () => result.resolve({ message: "Try again.", status: "error" }));
    expect(button).not.toHaveAttribute("aria-disabled");
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  });

  it.each(["cover", "archive"])("returns keyboard focus to the gallery when a successful %s removes its action", async (intent) => {
    const user = userEvent.setup();
    const result = deferred();
    actions[intent as "cover" | "archive"].mockReturnValueOnce(result.promise);
    const { rerender } = render(gallery());
    screen.getByRole("button", { name: intent === "cover" ? "Set cover" : "Archive" }).focus();
    await user.keyboard("{Enter}");
    await act(async () => result.resolve({ message: "Photo updated.", status: "success" }));
    rerender(gallery(intent === "cover" ? [{ ...viewablePhoto, isCover: true }] : []));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Photos" })).toHaveFocus());
    await user.tab();
    expect(screen.getByRole("button", { name: "Add photo" })).toHaveFocus();
  });

  it("leaves focus in another viewer when a pending archive removes its card", async () => {
    const user = userEvent.setup();
    const result = deferred();
    actions.archive.mockReturnValueOnce(result.promise);
    const kitchen = { ...viewablePhoto, id: "photo-2", caption: "Kitchen" };
    const { rerender } = render(gallery([viewablePhoto, kitchen]));
    screen.getAllByRole("button", { name: "Archive" })[0].focus();
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "View photo: Kitchen" }));
    await act(async () => result.resolve({ message: "Photo archived.", status: "success" }));
    rerender(gallery([kitchen]));
    expect(screen.getByRole("dialog", { name: "Kitchen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close photo" })).toHaveFocus();
  });

  it.each(["cover", "archive"])("recovers from a thrown %s error with safe feedback", async (intent) => {
    const user = userEvent.setup();
    actions[intent as "cover" | "archive"].mockRejectedValueOnce(new Error("private database detail"));
    render(gallery());
    const button = screen.getByRole("button", { name: intent === "cover" ? "Set cover" : "Archive" });
    await user.click(button);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Try again."));
    expect(screen.queryByText(/private database detail/)).toBeNull();
    expect(button).toBeEnabled();
    await user.click(button);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(intent === "cover" ? "Cover updated." : "Photo archived."));
  });
});
