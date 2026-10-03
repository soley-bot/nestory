import type { ImportRunSummary } from "@/features/imports/import.types";

export function getImportRunPresentation(run: ImportRunSummary) {
  const summary = `${run.createdCount} created · ${run.updatedCount} updated · ${run.failedCount} failed · ${run.skippedCount} skipped`;
  if (run.status === "staged") {
    return {
      label: run.readyRows === 0 ? "Needs correction" : "Ready to import",
      summary: `${run.readyRows} ready · ${run.blockedRows} blocked · ${run.warningRows} with warnings`,
      guidance: run.readyRows === 0
        ? "No rows can be imported yet. Fix the blocked rows, then upload a corrected file."
        : "Resume imports the ready rows from this saved run. Blocked rows are not imported.",
    };
  }
  if (run.status === "committing") {
    return {
      label: "Saving rows",
      summary,
      guidance: "The result is not final yet. Reconcile checks this run's status; wait for the result before uploading the file again.",
    };
  }
  return {
    label: run.status === "failed" ? "Import stopped" : run.status === "committed_with_errors" ? "Completed with issues" : "Completed",
    summary,
    guidance: run.status === "failed" || run.status === "committed_with_errors" || run.blockedRows > 0 || run.failedCount > 0 || run.skippedCount > 0
      ? "Review the saved counts before uploading a corrected file. Fix rows that were not saved; keep already saved rows out of the correction file."
      : "This run is complete. Already saved rows will not be imported again by resuming this run.",
  };
}
