import { describe, expect, it, vi } from "vitest";
import { runImportReadyRowsFlow } from "@/features/imports/import-ready-rows";

describe("runImportReadyRowsFlow", () => {
  it("returns a staging error without attempting a commit", async () => {
    const stage = vi.fn().mockResolvedValue({
      message: "The import payload could not be read.",
      status: "error",
    });
    const commit = vi.fn();

    const result = await runImportReadyRowsFlow({
      commit,
      formData: new FormData(),
      stage,
    });

    expect(result).toEqual({
      message: "The import payload could not be read.",
      status: "error",
    });
    expect(commit).not.toHaveBeenCalled();
  });

  it("keeps a fully blocked run staged and does not force invalid rows through", async () => {
    const stage = vi.fn().mockResolvedValue({
      draftKey: "draft-1",
      runId: "run-1",
      sourceFileName: "units.csv",
      status: "success",
      summary: { blocked: 3, ready: 0, total: 3, warnings: 0 },
    });
    const commit = vi.fn();

    const result = await runImportReadyRowsFlow({
      commit,
      formData: new FormData(),
      stage,
    });

    expect(result).toEqual({
      draftKey: "draft-1",
      message:
        "No rows are ready to import. Fix the rows that need attention and try again.",
      runId: "run-1",
      sourceFileName: "units.csv",
      status: "error",
      validationSummary: {
        blocked: 3,
        ready: 0,
        total: 3,
        warnings: 0,
      },
    });
    expect(commit).not.toHaveBeenCalled();
  });

  it("commits ready rows while retaining the blocked-row validation summary", async () => {
    const stage = vi.fn().mockResolvedValue({
      draftKey: "draft-1",
      runId: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
      sourceFileName: "units.csv",
      status: "success",
      summary: { blocked: 2, ready: 3, total: 5, warnings: 1 },
    });
    const commit = vi.fn().mockImplementation(
      async (_state: unknown, commitFormData: FormData) => {
        expect(commitFormData.get("runId")).toBe(
          "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
        );
        return {
          message: "Committed 3 unit rows.",
          runId: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
          status: "success",
          summary: { created: 2, failed: 0, skipped: 2, updated: 1 },
        };
      },
    );

    const result = await runImportReadyRowsFlow({
      commit,
      formData: new FormData(),
      stage,
    });

    expect(result).toEqual({
      commitSummary: { created: 2, failed: 0, skipped: 2, updated: 1 },
      draftKey: "draft-1",
      message: "Committed 3 unit rows.",
      runId: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
      sourceFileName: "units.csv",
      status: "success",
      validationSummary: {
        blocked: 2,
        ready: 3,
        total: 5,
        warnings: 1,
      },
    });
    expect(commit).toHaveBeenCalledOnce();
  });
});
