import { requireWorkspaceContext } from "@/lib/auth/context";
import { getFinancialWriteContext } from "@/lib/finance/financial-write-context.server";

export const dynamic = "force-dynamic";

export async function GET() {
  const workspace = await requireWorkspaceContext();
  const context = await getFinancialWriteContext(workspace.organizationId);
  return Response.json({ organizationId: workspace.organizationId, context }, { headers: { "Cache-Control": "private, no-store" } });
}
