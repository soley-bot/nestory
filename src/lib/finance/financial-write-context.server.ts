import "server-only";
import { cache } from "react";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db/server";
import { FINANCIAL_GENERATION_FIELD, FINANCIAL_GENERATION_HEADER, financialGenerationHeaders, financialContextKey, financialWriteContextSchema, type FinancialWriteContext } from "./financial-write-context";

// One render must anchor its layout, forms, and financial payloads to the same
// generation even when sibling Server Components load concurrently.
export const getFinancialWriteContext = cache(async (organizationId: string): Promise<FinancialWriteContext> => {
  const client = await createSupabaseServerClient();
  const result = await client.rpc("get_financial_write_context", { p_organization_id: organizationId });
  if (result.error) throw new Error("Financial workspace status could not be verified. Reload the page before continuing.");
  return financialWriteContextSchema.parse(result.data);
});

function assertReadable(context: FinancialWriteContext, periodStart?: string) {
  if (context.status !== "open") throw new Error("Financial reporting is paused while this workspace is being reset.");
  if (periodStart && context.financial_start_date && periodStart < context.financial_start_date) {
    throw new Error(`Financial reporting starts on ${context.financial_start_date}. Choose a period on or after that date.`);
  }
}

const reportContextSchema = z.object({ context: financialWriteContextSchema, source_revision: z.string().regex(/^(0|[1-9]\d*)$/) });

async function getFinancialReportContext(organizationId: string) {
  const client = await createSupabaseServerClient();
  const result = await client.rpc("get_financial_report_context", { p_organization_id: organizationId });
  if (result.error) throw new Error("Financial workspace status could not be verified. Reload the page before continuing.");
  return reportContextSchema.parse(result.data);
}

// Reject mixed reset generations AND ordinary committed source changes. Each
// report still owns its reconciliation and immutable-publication checks.
export async function withFinancialReadContext<T>(organizationId: string, read: (context: FinancialWriteContext) => Promise<T>, periodStart?: string, expectedGeneration?: number): Promise<T> {
  const anchor = await getFinancialWriteContext(organizationId);
  const before = await getFinancialReportContext(organizationId);
  assertReadable(before.context, periodStart);
  if (financialContextKey(anchor) !== financialContextKey(before.context)) throw new Error("The financial session changed. Reload the page before continuing.");
  if (expectedGeneration !== undefined && before.context.generation !== expectedGeneration) throw new Error("The financial session changed. Reload the page before continuing.");
  const result = await read(before.context);
  const after = await getFinancialReportContext(organizationId);
  assertReadable(after.context, periodStart);
  if (financialContextKey(before.context) !== financialContextKey(after.context) || before.source_revision !== after.source_revision) {
    throw new Error("Financial data changed while this report was loading. Reload the page and try again.");
  }
  return result;
}

export async function withFinancialDownloadContext<T>(organizationId: string, request: Request, read: () => Promise<T>, periodStart?: string) {
  const raw = new URL(request.url).searchParams.get("financialGeneration");
  const expected = raw !== null && /^(0|[1-9]\d{0,9})$/.test(raw) && Number(raw) <= 2147483647 ? Number(raw) : undefined;
  return withFinancialReadContext(organizationId, async () => {
    const current = await getFinancialWriteContext(organizationId);
    if ((current.enforced || raw !== null) && (expected === undefined || current.generation !== expected)) {
      throw new Error("The financial session changed. Reload the report before downloading it.");
    }
    return read();
  }, periodStart, expected);
}

// Client-triggered reads carry the same original form generation as writes.
// Missing intent is allowed only in workspaces that have never been enrolled.
export async function withFinancialIntentReadContext<T>(organizationId: string, formData: FormData | undefined, read: (context: FinancialWriteContext) => Promise<T>, periodStart?: string): Promise<T> {
  const raw = financialGenerationHeaders(formData)[FINANCIAL_GENERATION_HEADER];
  const expected = raw === undefined ? undefined : Number(raw);
  return withFinancialReadContext(organizationId, async (context) => {
    if (expected === undefined && (context.enforced || formData?.has(FINANCIAL_GENERATION_FIELD))) {
      throw new Error("The financial session changed. Reload the page before continuing.");
    }
    return read(context);
  }, periodStart, expected);
}
