import type { ZodIssue } from "zod";

export type ReportCommandResult =
  | { status: "success" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> };

const labels: Record<string, string> = {
  closeReason: "Close reason", reopenReason: "Reopen reason", reason: "Reason",
  sourceReference: "Source reference", evidenceSha256: "Evidence fingerprint",
  signedAmount: "Correction amount", effectiveDate: "Effective date",
  monthStart: "Month", propertyId: "Property", ownerPersonId: "Owner",
};

export class ReportCommandValidationError extends Error {
  readonly fieldErrors: Record<string, string[]>;
  constructor(issues: ZodIssue[]) {
    super(issues[0]?.message ?? "Check the form.");
    this.fieldErrors = {};
    for (const issue of issues) {
      const field = String(issue.path[0] ?? "form");
      const label = labels[field] ?? "Selected record";
      const message = issue.code === "too_small" ? `${label}: enter at least ${issue.minimum} characters.`
        : issue.code === "too_big" ? `${label}: use no more than ${issue.maximum} characters.`
        : field === "evidenceSha256" ? "Evidence fingerprint: use the 64-character lowercase SHA-256 value."
        : `${label}: check the value and try again.`;
      (this.fieldErrors[field] ??= []).push(message);
    }
  }
}

const knownErrors: Record<string, string> = {
  owner_close_blocked: "The month cannot close yet. Recheck and resolve the remaining preparation checks.",
  owner_close_input_changed_concurrently: "Activity changed during close. Recheck and recalculate this month before closing again.",
  owner_close_reopen_required: "This month is already closed. Recheck its saved statement; use a corrected statement only if a correction is needed.",
  owner_statement_artifacts_incomplete: "Finish saving the missing statement files with Resume owner statement before reopening.",
  owner_statement_revision_not_closed: "Close the owner month before publishing its statement.",
  owner_statement_revision_not_current: "A newer close exists. Recheck and publish the current revision.",
  owner_statement_revision_already_published: "This revision is already published. Recheck to download its saved files.",
  owner_close_correction_negative_component: "This correction would make a balance negative. Check the component and amount.",
  owner_close_correction_month_not_locked: "The financial month must be locked before recording a close correction.",
  owner_close_correction_target_invalid: "The correction revision has changed. Recheck and select the current preparing revision.",
  owner_close_correction_amount_invalid: "Enter a nonzero correction amount with at most two decimal places.",
  "Enter a nonzero correction amount.": "Enter a nonzero correction amount.",
  "Invalid exact owner-opening amount returned by the database.": "Enter a correction amount with at most 12 integer digits and two decimal places, without commas or exponent notation.",
  "Privileged email verification required.": "Privileged session verification blocked statement file completion. An Admin must resolve the session check before resuming publication.",
};

export function expectedReportCommandError(error: unknown): ReportCommandResult | null {
  if (error instanceof ReportCommandValidationError) return {
    status: "error", message: Object.values(error.fieldErrors).flat().join(" "), fieldErrors: error.fieldErrors,
  };
  if (!(error instanceof Error)) return null;
  const message = knownErrors[error.message];
  return message ? { status: "error", message } : null;
}
