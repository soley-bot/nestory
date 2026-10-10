import { loadLocalDepositReport, revalidateLocalDepositScope, LocalDepositExportError, type LocalDepositClient } from "./deposit-rent-local-source";
import { buildTrustedReportPdf } from "./pdf";
import { buildTrustedReportXlsx } from "./excel";
import { z } from "zod";

export const LOCAL_DEPOSIT_EXPORT_ENABLED = false;
type Identity = { organizationId: string; organizationName: string; authorizationKey: string };
export type LocalDepositExportDependencies = {
  currentUser(): Promise<{ id: string } | null>;
  // Must use existing server membership + leases.view AND finance.view checks.
  membership(userId: string): Promise<Identity | null>;
  client(): Promise<LocalDepositClient>;
};
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const text = (message: string, status: number) => new Response(message, { status, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });

// Outside app/: this factory is not a production endpoint. Only server-owned
// local tests may enable it. Query/body/environment flags cannot activate Cash.
export function createLocalDepositExportHandler(dependencies: LocalDepositExportDependencies, enabledForLocalTests = LOCAL_DEPOSIT_EXPORT_ENABLED) {
  return async (request: Request): Promise<Response> => {
    if (!enabledForLocalTests) return text("Local Cash export is disabled.", 404);
    if (request.method !== "GET") return text("Method not allowed", 405);
    const user = await dependencies.currentUser();
    if (!user) return text("Unauthorized", 401);
    const membership = await dependencies.membership(user.id);
    if (!membership) return text("Forbidden", 403);
    try {
      const query = new URL(request.url).searchParams;
      const allowed = new Set(["propertyId", "unitId", "from", "to", "format", "expectedFingerprint"]);
      if ([...query.keys()].some(key => !allowed.has(key)) || [...allowed].some(key => key !== "propertyId" && query.getAll(key).length > 1)) throw new LocalDepositExportError(400, "Explicit local report scope required.");
      const parsed = z.strictObject({ propertyIds: z.array(z.uuid()).min(1).max(100), unitId: z.uuid().optional(),
        periodStart: z.iso.date(), periodEnd: z.iso.date(), format: z.enum(["pdf", "xlsx"]),
        expectedFingerprint: z.string().regex(/^[a-fA-F0-9]{64}$/).optional() }).safeParse({
        propertyIds: query.getAll("propertyId"), unitId: query.get("unitId") ?? undefined,
        periodStart: query.get("from"), periodEnd: query.get("to"), format: query.get("format"),
        expectedFingerprint: query.get("expectedFingerprint") ?? undefined });
      if (!parsed.success) throw new LocalDepositExportError(400, "Invalid local report scope.");
      const scope = parsed.data;
      const start = new Date(`${scope.periodStart}T00:00:00Z`);
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
      if (new Set(scope.propertyIds).size !== scope.propertyIds.length || scope.unitId && scope.propertyIds.length !== 1
        || start.getUTCDate() !== 1 || end !== scope.periodEnd) throw new LocalDepositExportError(400, "Explicit monthly property/unit scope required.");
      const client = await dependencies.client();
      const reportScope = {
        actorId: user.id, organizationId: membership.organizationId, propertyIds: scope.propertyIds,
        unitId: scope.unitId, periodStart: scope.periodStart, periodEnd: scope.periodEnd,
      };
      const report = await loadLocalDepositReport(client, reportScope, scope.expectedFingerprint);
      const bytes = scope.format === "pdf" ? buildTrustedReportPdf({ organizationName: membership.organizationName, report }) : buildTrustedReportXlsx(report);
      // Recheck role/branch/membership before releasing any financial bytes.
      const finalUser = await dependencies.currentUser();
      const finalMembership = finalUser?.id === user.id ? await dependencies.membership(user.id) : null;
      if (!finalMembership || finalMembership.organizationId !== membership.organizationId
        || finalMembership.authorizationKey !== membership.authorizationKey) return text("Forbidden", 403);
      // Membership alone does not prove current property or unit access.
      // Repeat both readers after rendering, immediately before release.
      await revalidateLocalDepositScope(client, reportScope);
      return new Response(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, {
        headers: { ...headers, "X-Nestory-Report-Scope": "deposit-rent-only",
          "Content-Type": scope.format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${report.exportFilenameBase}.${scope.format}"` },
      });
    } catch (error) {
      return error instanceof LocalDepositExportError ? text(error.message, error.status) : text("Local report sources could not be verified.", 409);
    }
  };
}
