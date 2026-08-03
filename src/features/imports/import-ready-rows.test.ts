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
      runStatus: "staged",
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
          runStatus: "committed",
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
      runStatus: "committed",
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

  it("retains the staged run identity when the first commit attempt fails", async () => {
    const stage = vi.fn().mockResolvedValue({
      draftKey: "draft-1",
      runId: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
      runStatus: "staged",
      sourceFileName: "units.csv",
      status: "success",
      summary: { blocked: 0, ready: 3, total: 3, warnings: 0 },
    });
    const commit = vi.fn().mockResolvedValue({
      message: "The staged import could not be committed.",
      runId: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
      status: "error",
    });

    const result = await runImportReadyRowsFlow({
      commit,
      formData: new FormData(),
      stage,
    });

    expect(result).toMatchObject({
      draftKey: "draft-1",
      runId: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
      runStatus: "staged",
      sourceFileName: "units.csv",
      status: "error",
      validationSummary: { blocked: 0, ready: 3, total: 3, warnings: 0 },
    });
  });

  it("prefers a terminal commit result over the staged claim status", async () => {
    const stage = vi.fn().mockResolvedValue({
      draftKey: "draft-1",
      runId: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
      runStatus: "staged",
      sourceFileName: "units.csv",
      status: "success",
      summary: { blocked: 0, ready: 3, total: 3, warnings: 0 },
    });
    const commit = vi.fn().mockResolvedValue({
      message:
        "No unit rows were committed. Review 3 failed rows. This terminal result was not retried.",
      runId: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
      runStatus: "failed",
      status: "error",
      summary: { created: 0, failed: 3, skipped: 0, updated: 0 },
    });

    const result = await runImportReadyRowsFlow({
      commit,
      formData: new FormData(),
      stage,
    });

    expect(result).toMatchObject({
      draftKey: "draft-1",
      runId: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
      runStatus: "failed",
      status: "error",
    });
  });

  it("reclaims the server-owned run on every retry instead of trusting previous client state", async () => {
    const stage = vi.fn().mockResolvedValue({
      draftKey: "forged-draft-key",
      runId: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
      sourceFileName: "units.csv",
      status: "success",
      summary: { blocked: 0, ready: 3, total: 3, warnings: 0 },
    });
    const commit = vi.fn().mockResolvedValue({
      message: "Committed 3 unit rows.",
      runId: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
      status: "success",
      summary: { created: 3, failed: 0, skipped: 0, updated: 0 },
    });
    const formData = new FormData();
    formData.set("payload", JSON.stringify({ draftKey: "forged-draft-key" }));

    const retryOptions = {
      commit,
      formData,
      previousState: {
        draftKey: "draft-1",
        message: "The staged import could not be committed.",
        runId: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
        sourceFileName: "units.csv",
        status: "error",
        validationSummary: { blocked: 0, ready: 3, total: 3, warnings: 0 },
      },
      stage,
    };
    const result = await runImportReadyRowsFlow(retryOptions);

    expect(stage).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      commitSummary: { created: 3, failed: 0, skipped: 0, updated: 0 },
      draftKey: "forged-draft-key",
      runId: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
      status: "success",
    });
  });

  it("does not let a matching client draft key bypass the server staging claim", async () => {
    const stage = vi.fn().mockResolvedValue({
      draftKey: "draft-1",
      runId: "f961fdba-276c-40e8-9c3a-318302f9770b",
      sourceFileName: "units.csv",
      status: "success",
      summary: { blocked: 0, ready: 1, total: 1, warnings: 0 },
    });
    const commit = vi.fn().mockResolvedValue({
      status: "success",
      summary: { created: 1, failed: 0, skipped: 0, updated: 0 },
    });
    const formData = new FormData();
    formData.set("payload", JSON.stringify({ draftKey: "draft-1" }));

    const retryOptions = {
      commit,
      formData,
      previousState: {
        draftKey: "draft-1",
        runId: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
        status: "error",
        validationSummary: { blocked: 0, ready: 3, total: 3, warnings: 0 },
      },
      stage,
    };

    await runImportReadyRowsFlow(retryOptions);

    expect(stage).toHaveBeenCalledOnce();
  });
});
