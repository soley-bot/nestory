import { getUuidSearchParam } from "@/lib/validation/search-params";

export const maxUnitProfitLossBatchSize = 20;

export type UnitProfitLossExportSelection = {
  format: "pdf" | "xlsx";
  month: string;
  propertyId: string;
  unitIds: string[];
};

export function parseUnitProfitLossExportSelection(params: URLSearchParams): UnitProfitLossExportSelection | null {
  const month = params.get("month") ?? "";
  const propertyId = (params.get("propertyId") ?? "all").toLowerCase();
  const format = params.get("format");
  const unitIds = params.getAll("unitIds").map(id => id.toLowerCase());
  if (["month", "propertyId", "format", "financialGeneration"].some(key => params.getAll(key).length > 1)
    || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)
    || (propertyId !== "all" && !getUuidSearchParam(propertyId))
    || (format !== "pdf" && format !== "xlsx")
    || unitIds.length === 0 || unitIds.length > maxUnitProfitLossBatchSize
    || new Set(unitIds).size !== unitIds.length
    || unitIds.some(id => !getUuidSearchParam(id))) return null;
  return { format, month, propertyId, unitIds };
}
