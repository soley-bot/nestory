"use server";

import { unstable_rethrow } from "next/navigation";
import { closeOwnerMonthAction, reopenOwnerMonthAction, recordOwnerCloseCorrectionAction, publishOwnerStatementAction, resumeOwnerStatementPublicationAction } from "@/features/owner-close/actions";
import { generateOwnerBalancePeriodAction, allocateOwnerEventAction } from "@/features/owner-balances/lifecycle-actions";
import { expectedReportCommandError, type ReportCommandResult } from "./report-command-result";

async function run(command: (data: FormData) => Promise<void>, data: FormData): Promise<ReportCommandResult> {
  try {
    await command(data);
    return { status: "success" };
  } catch (error) {
    unstable_rethrow(error);
    const expected = expectedReportCommandError(error);
    if (expected) return expected;
    throw error;
  }
}

export async function closeReportMonthAction(data: FormData) { return run(closeOwnerMonthAction, data); }
export async function reopenReportMonthAction(data: FormData) { return run(reopenOwnerMonthAction, data); }
export async function correctReportMonthAction(data: FormData) { return run(recordOwnerCloseCorrectionAction, data); }
export async function publishReportStatementAction(data: FormData) { return run(publishOwnerStatementAction, data); }
export async function resumeReportStatementAction(data: FormData) { return run(resumeOwnerStatementPublicationAction, data); }
export async function calculateReportMonthAction(data: FormData) { return run(generateOwnerBalancePeriodAction, data); }
export async function assignReportSourceAction(data: FormData) { return run(allocateOwnerEventAction, data); }
