import { getCurrentUser, getFinanceReportMembershipForUser } from "@/lib/auth/context";
import { withFinancialDownloadContext } from "@/lib/finance/financial-write-context.server";
import { getUnitProfitLossBundle } from "@/features/reports/data/unit-profit-loss-bundle";
import { maxUnitProfitLossBatchSize, parseUnitProfitLossExportSelection } from "@/features/reports/unit-profit-loss-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return textResponse("Unauthorized", 401);
  const membership = await getFinanceReportMembershipForUser(user.id);
  if (!membership) return textResponse("Forbidden", 403);
  const selection = parseUnitProfitLossExportSelection(new URL(request.url).searchParams);
  if (!selection) return textResponse(`Choose a valid month and 1–${maxUnitProfitLossBatchSize} different units, then select PDF or Excel.`, 400);
  try {
    const bundle = await withFinancialDownloadContext(membership.organizationId, request, () =>
      getUnitProfitLossBundle(membership.organizationId, membership.organizationName, selection));
    if ("validation" in bundle) return textResponse(bundle.validation.message, bundle.validation.status);
    const body = bundle.body.buffer.slice(bundle.body.byteOffset, bundle.body.byteOffset + bundle.body.byteLength) as ArrayBuffer;
    return new Response(body, { headers: { ...privateHeaders, "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${bundle.filename}"`, "Content-Length": String(bundle.body.byteLength) } });
  } catch {
    return textResponse("Financial data changed or could not be verified. Reload the report before downloading it.", 409);
  }
}

function textResponse(body: string, status: number) {
  return new Response(body, { status, headers: { ...privateHeaders, "Content-Type": "text/plain; charset=utf-8" } });
}
