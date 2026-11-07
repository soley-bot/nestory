"use server";
import { expectedReportCommandError, type ReportCommandResult } from "@/features/reports/report-command-result";
import { financialWriteError } from "@/lib/finance/financial-write-context";
import * as commands from "./lifecycle-actions";

async function run(command: (data: FormData) => Promise<void>, data: FormData): Promise<ReportCommandResult> {
  try { await command(data); return {status: "success"}; }
  catch (error) {
    const expected = expectedReportCommandError(error);
    if (expected) return expected;
    if (!(error instanceof Error)) throw error;
    const lifecycle = financialWriteError(error.message);
    if (lifecycle) return {status: "error", message: lifecycle};
    if (error.message === "Enter an amount greater than zero." || error.message === "Enter a nonnegative amount with up to 12 integer digits and 2 decimal places.") return {status: "error", message: error.message, fieldErrors: {amount: [error.message]}};
    if (/month_locked|financial_month_locked|period_closed/.test(error.message)) return {status: "error", message: "This financial period is locked. Review its status before recording this change."};
    if (/insufficient|underfund|held_cash/.test(error.message)) return {status: "error", message: "There is not enough available owner cash. Review the balance and amount."};
    if (/already_reversed/.test(error.message)) return {status: "error", message: "This transaction has already been reversed. Recheck the account and select its current replacement."};
    if (/owner_roster|owner_share|owner_person_inactive/.test(error.message)) return {status: "error", message: "Review the property’s owner assignments for the selected date before continuing."};
    throw error;
  }
}
export async function recordOwnerCashEventFormAction(data: FormData) { return run(commands.recordOwnerCashEventAction, data); }
export async function recordOwnerDistributionFormAction(data: FormData) { return run(commands.recordOwnerDistributionAction, data); }
export async function reverseOwnerInvoicePaymentFormAction(data: FormData) { return run(commands.reverseOwnerInvoicePaymentAction, data); }
export async function reversePropertyWithdrawalFormAction(data: FormData) { return run(commands.reversePropertyWithdrawalAction, data); }
export async function transferOwnerBalanceComponentFormAction(data: FormData) { return run(commands.transferOwnerBalanceComponentAction, data); }
