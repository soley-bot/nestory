import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  requirePermission: vi.fn(),
  requireSuperAdminContext: vi.fn(),
  requireWorkspaceContext: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/context", () => ({
  requirePermission: mocks.requirePermission,
  requireSuperAdminContext: mocks.requireSuperAdminContext,
  requireWorkspaceContext: mocks.requireWorkspaceContext,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: mocks.from,
    rpc: mocks.rpc,
    storage: { from: mocks.storageFrom },
  })),
}));

import {
  archiveTimelineEventAction,
  attachTimelineDocumentAction,
  createTimelineEventAction,
  restoreTimelineEventAction,
  updateTimelineEventAction,
} from "@/features/timeline/actions";
import { invalidPdfFile } from "@/test-utils/upload-content";

describe("timeline action authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ organizationId: "org-1" });
    mocks.requireWorkspaceContext.mockResolvedValue({
      branchId: "branch-1",
      isSuperAdmin: false,
      organizationId: "org-1",
    });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.storageFrom.mockReturnValue({ upload: mocks.upload });
    mocks.rpc.mockResolvedValue({
      data: "30000000-0000-4000-8000-000000000001",
      error: null,
    });
    mocks.from.mockImplementation((table: string) => {
      const query = {
        eq: vi.fn(() => query),
        is: vi.fn(() => query),
        maybeSingle: vi.fn(async () => {
          if (table === "timeline_events") {
            return {
              data: {
                event_type: "manual",
                id: "10000000-0000-4000-8000-000000000001",
                lease_id: null,
                ledger_entry_id: null,
                property_id: "20000000-0000-4000-8000-000000000001",
                unit_id: null,
              },
              error: null,
            };
          }
          return { data: { branch_id: "branch-1" }, error: null };
        }),
        select: vi.fn(() => query),
      };
      return query;
    });
  });

  it("uses property write for manual create and update", async () => {
    await createTimelineEventAction({}, new FormData());
    await updateTimelineEventAction({}, new FormData());
    expect(mocks.requirePermission).toHaveBeenNthCalledWith(1, "properties.write");
    expect(mocks.requirePermission).toHaveBeenNthCalledWith(2, "properties.write");
  });

  it("uses property archive for manual lifecycle transitions", async () => {
    await archiveTimelineEventAction({}, new FormData());
    await restoreTimelineEventAction({}, new FormData());
    expect(mocks.requirePermission).toHaveBeenNthCalledWith(1, "properties.archive");
    expect(mocks.requirePermission).toHaveBeenNthCalledWith(2, "properties.archive");
    expect(mocks.requireSuperAdminContext).not.toHaveBeenCalled();
  });

  it("rejects spoofed timeline document bytes before Storage access", async () => {
    const formData = new FormData();
    formData.set("eventId", "10000000-0000-4000-8000-000000000001");
    formData.set("document", invalidPdfFile("timeline.pdf"));

    await expect(attachTimelineDocumentAction({}, formData)).resolves.toEqual({
      fieldErrors: {
        document: ["Upload a PDF, JPG, PNG, or WebP document."],
      },
      status: "error",
    });
    expect(mocks.storageFrom).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
