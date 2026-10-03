import { describe, expect, it } from "vitest";
import { getImportRunPresentation } from "./import-result-presentation";
import type { ImportRunSummary } from "./import.types";

const run: ImportRunSummary = {
  blockedRows: 2, committedAt: null, createdAt: "2026-10-03T08:00:00Z",
  createdCount: 7, failedCount: 1, fileName: "synthetic.csv", id: "run-1",
  importType: "units", readyRows: 10, skippedCount: 2, status: "committed_with_errors",
  totalRows: 12, updatedCount: 2, warningRows: 1,
};

describe("import result presentation", () => {
  it("separates save failures, skipped rows and saved results", () => {
    expect(getImportRunPresentation(run)).toMatchObject({
      label: "Completed with issues", summary: "7 created · 2 updated · 1 failed · 2 skipped",
    });
    expect(getImportRunPresentation(run).guidance).toContain("keep already saved rows out");
  });
  it("does not present staged rows as save results", () => {
    expect(getImportRunPresentation({ ...run, status: "staged" })).toMatchObject({
      label: "Ready to import", summary: "10 ready · 2 blocked · 1 with warnings",
    });
  });
  it("explains all-blocked runs without offering a retry", () => {
    expect(getImportRunPresentation({ ...run, status: "staged", readyRows: 0 }).label)
      .toBe("Needs correction");
    expect(getImportRunPresentation({ ...run, status: "staged", readyRows: 0 }).guidance)
      .toContain("No rows can be imported yet");
  });
  it("distinguishes checking an unfinished run from uploading again", () => {
    expect(getImportRunPresentation({ ...run, status: "committing" }).guidance)
      .toContain("wait for the result before uploading the file again");
  });
  it("requires saved-count review for a failed run", () => {
    expect(getImportRunPresentation({ ...run, status: "failed" }).label).toBe("Import stopped");
    expect(getImportRunPresentation({ ...run, status: "failed" }).guidance).toContain("Review the saved counts");
  });
  it("still guides correction when a completed run had blocked rows", () => {
    expect(getImportRunPresentation({ ...run, status: "committed" }).guidance).toContain("corrected file");
  });
  it("explains a completed run with no unsaved rows", () => {
    expect(getImportRunPresentation({ ...run, status: "committed", blockedRows: 0, failedCount: 0, skippedCount: 0 }).guidance)
      .toContain("This run is complete");
  });
});
