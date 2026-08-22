/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PhotoGallery } from "@/features/photos/components/photo-gallery";

afterEach(cleanup);

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
